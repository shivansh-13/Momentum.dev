import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker.js';
import { DashboardPanel } from './dashboardPanel.js';
import { PairingFlow } from './pairingFlow.js';
import { SessionManager } from './sessionManager.js';
import { SyncClient } from './syncClient.js';
import type { Mode, SessionEventState } from './types.js';

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
  };

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
    });
  };

  activityTracker = new ActivityTracker({
    idleThresholdSeconds,
    heartbeatIntervalSeconds,
    mode,
    userId: runtime.userId ?? '00000000-0000-0000-0000-000000000000',
    deviceId: runtime.deviceId ?? '00000000-0000-0000-0000-000000000000',
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
    updateUi();
  };

  const runStartSession = async () => {
    sessionManager.startSession(true);
    emitSessionEvent('start');
    await syncClient.flush();
    void vscode.window.showInformationMessage('Momentum session started.');
    updateUi();
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
    updateUi();
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
    updateUi();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('momentum.openDashboard', async () => {
      const snapshot = sessionManager.getSnapshot();
      dashboard.show(context, {
        paired: Boolean(runtime.userId && runtime.deviceId && runtime.deviceJwt),
        sessionState: snapshot.state,
        elapsedSeconds: Math.floor(snapshot.elapsedMs / 1000),
      });

      dashboard.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case 'pair':
            await runPair();
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
    vscode.commands.registerCommand('momentum.pair', runPair),
    vscode.commands.registerCommand('momentum.startSession', runStartSession),
    vscode.commands.registerCommand('momentum.pauseSession', runPauseSession),
    vscode.commands.registerCommand('momentum.endSession', runEndSession),
  );

  updateUi();
}

export function deactivate() {
  activityTracker?.stop();
}
