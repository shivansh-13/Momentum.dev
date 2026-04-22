import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker.js';
import { ApiClient } from './apiClient.js';
import { DashboardPanel } from './dashboardPanel.js';
import { PairingFlow } from './pairingFlow.js';
import { SessionManager } from './sessionManager.js';
import { SyncClient } from './syncClient.js';
import type { Mode, ProfileMetrics, SessionEventState } from './types.js';

let activityTracker: ActivityTracker | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('momentum');
  const apiBaseUrl = config.get<string>('apiUrl', 'http://127.0.0.1:54321/functions/v1');
  const mode = config.get<Mode>('mode', 'personal');
  const idleThresholdSeconds = config.get<number>('idleThresholdSeconds', 120);
  const heartbeatIntervalSeconds = config.get<number>('heartbeatIntervalSeconds', 60);

  const pairingFlow = new PairingFlow(context);
  const dashboard = new DashboardPanel();
  const sessionManager = new SessionManager();

  const runtime = {
    userId: null as string | null,
    deviceId: null as string | null,
    deviceJwt: null as string | null,
    userName: '' as string,
    profile: null as ProfileMetrics | null,
  };

  const apiClient = new ApiClient({
    apiBaseUrl,
    getDeviceJwt: async () => runtime.deviceJwt,
  });

  const savedUser = await pairingFlow.getSavedUser();
  if (savedUser) {
    runtime.userId = savedUser.userId;
    runtime.userName = savedUser.displayName ?? '';
  }

  const maybeCredentials = await pairingFlow.getSavedCredentials();
  if (maybeCredentials) {
    runtime.userId = maybeCredentials.userId;
    runtime.deviceId = maybeCredentials.deviceId;
    runtime.deviceJwt = maybeCredentials.deviceJwt;
  }

  const syncClient = new SyncClient({
    apiBaseUrl,
    getDeviceJwt: async () => runtime.deviceJwt,
  });

  const refreshProfile = async () => {
    if (!runtime.userId) {
      runtime.profile = null;
      updateUi();
      return;
    }

    try {
      const profile = await apiClient.profile({ userId: runtime.userId });
      runtime.userName = profile.displayName;
      runtime.profile = profile.metrics;
    } catch {
      // Keep UI responsive even if backend is unavailable.
    }
    updateUi();
  };

  const emitSessionEvent = (state: SessionEventState) => {
    if (!runtime.userId || !runtime.deviceId) {
      return;
    }
    const snapshot = sessionManager.getSnapshot();
    if (!snapshot.sessionId) {
      return;
    }

    syncClient.enqueue({
      type: 'session',
      clientEventId: randomUUID(),
      deviceId: runtime.deviceId,
      userId: runtime.userId,
      occurredAt: new Date().toISOString(),
      mode,
      sessionId: snapshot.sessionId,
      state,
      durationSeconds: Math.floor(snapshot.elapsedMs / 1000),
      pomodoro: snapshot.pomodoro,
    });
  };

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'momentum.openDashboard';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const updateUi = () => {
    const snapshot = sessionManager.getSnapshot();
    const paired = Boolean(runtime.userId && runtime.deviceId && runtime.deviceJwt);
    const elapsedSeconds = Math.floor(snapshot.elapsedMs / 1000);

    statusBar.text = `$(pulse) Momentum ${snapshot.state === 'running' ? elapsedSeconds + 's' : snapshot.state}`;
    statusBar.tooltip = paired ? 'Momentum connected' : 'Momentum not paired';

    dashboard.update({
      paired,
      sessionState: snapshot.state,
      elapsedSeconds,
      userName: runtime.userName,
      profile: runtime.profile,
    });
  };

  activityTracker = new ActivityTracker({
    idleThresholdSeconds,
    heartbeatIntervalSeconds,
    mode,
    getUserId: () => runtime.userId ?? '00000000-0000-0000-0000-000000000000',
    getDeviceId: () => runtime.deviceId ?? '00000000-0000-0000-0000-000000000000',
    onHeartbeat: (event) => syncClient.enqueue(event),
    getSessionId: () => sessionManager.getSnapshot().sessionId,
  });

  activityTracker.start(context);

  const flushTimer = setInterval(() => {
    void syncClient.flush();
  }, 15_000);

  const uiTimer = setInterval(() => {
    updateUi();
  }, 1000);

  context.subscriptions.push({
    dispose: () => clearInterval(flushTimer),
  });
  context.subscriptions.push({
    dispose: () => clearInterval(uiTimer),
  });

  const runPair = async () => {
    const result = await pairingFlow.startPairing(apiBaseUrl);
    if (!result) {
      return;
    }

    runtime.userId = result.userId;
    runtime.deviceId = result.deviceId;
    runtime.deviceJwt = result.deviceJwt;

    void vscode.window.showInformationMessage('Momentum paired successfully.');
    await refreshProfile();
  };

  const runRegister = async () => {
    try {
      const result = await pairingFlow.register(apiBaseUrl);
      if (!result) {
        return;
      }

      runtime.userId = result.userId;
      runtime.userName = result.displayName;
      void vscode.window.showInformationMessage('Momentum account created. Pair your device next.');
      await refreshProfile();
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
    }
  };

  const runLogin = async () => {
    try {
      const result = await pairingFlow.login(apiBaseUrl);
      if (!result) {
        return;
      }

      runtime.userId = result.userId;
      runtime.userName = result.displayName;
      void vscode.window.showInformationMessage('Momentum login successful. Pair your device next.');
      await refreshProfile();
    } catch (error) {
      void vscode.window.showErrorMessage((error as Error).message);
    }
  };

  const runStartSession = async () => {
    sessionManager.startSession(true);
    emitSessionEvent('start');
    await syncClient.flush();
    void vscode.window.showInformationMessage('Momentum session started.');
    await refreshProfile();
  };

  const runPauseSession = async () => {
    const snapshot = sessionManager.getSnapshot();
    if (snapshot.state === 'paused') {
      sessionManager.resumeSession();
      emitSessionEvent('resume');
      void vscode.window.showInformationMessage('Momentum session resumed.');
    } else {
      sessionManager.pauseSession();
      emitSessionEvent('pause');
      void vscode.window.showInformationMessage('Momentum session paused.');
    }
    await syncClient.flush();
    await refreshProfile();
  };

  const runEndSession = async () => {
    const snapshot = sessionManager.getSnapshot();
    if (snapshot.state === 'idle') {
      void vscode.window.showWarningMessage('No active session to end.');
      return;
    }

    emitSessionEvent('complete');
    sessionManager.endSession();
    await syncClient.flush();
    void vscode.window.showInformationMessage('Momentum session completed.');
    await refreshProfile();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('momentum.openDashboard', async () => {
      const snapshot = sessionManager.getSnapshot();
      dashboard.show(context, {
        paired: Boolean(runtime.userId && runtime.deviceId && runtime.deviceJwt),
        sessionState: snapshot.state,
        elapsedSeconds: Math.floor(snapshot.elapsedMs / 1000),
        userName: runtime.userName,
        profile: runtime.profile,
      });

      dashboard.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case 'pair':
            await runPair();
            break;
          case 'register':
            await runRegister();
            break;
          case 'login':
            await runLogin();
            break;
          case 'refreshProfile':
            await refreshProfile();
            break;
          case 'startSession':
            await runStartSession();
            break;
          case 'pauseSession':
            await runPauseSession();
            break;
          case 'endSession':
            await runEndSession();
            break;
          default:
            break;
        }
      });
    }),
    vscode.commands.registerCommand('momentum.register', runRegister),
    vscode.commands.registerCommand('momentum.login', runLogin),
    vscode.commands.registerCommand('momentum.refreshProfile', refreshProfile),
    vscode.commands.registerCommand('momentum.pair', runPair),
    vscode.commands.registerCommand('momentum.startSession', runStartSession),
    vscode.commands.registerCommand('momentum.pauseSession', runPauseSession),
    vscode.commands.registerCommand('momentum.endSession', runEndSession),
  );

  await refreshProfile();
}

export function deactivate() {
  activityTracker?.stop();
}
