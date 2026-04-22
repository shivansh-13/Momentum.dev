import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ActivityTracker } from './activityTracker.js';
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

  context.subscriptions.push({
    dispose: () => clearInterval(flushTimer),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('momentum.pair', async () => {
      const result = await pairingFlow.startPairing(apiBaseUrl);
      if (!result) {
        return;
      }

      runtime.userId = result.userId;
      runtime.deviceId = result.deviceId;
      runtime.deviceJwt = result.deviceJwt;

      void vscode.window.showInformationMessage('Momentum paired successfully.');
    }),
    vscode.commands.registerCommand('momentum.startSession', async () => {
      sessionManager.startSession(true);
      emitSessionEvent('start');
      await syncClient.flush();
      void vscode.window.showInformationMessage('Momentum session started.');
    }),
    vscode.commands.registerCommand('momentum.pauseSession', async () => {
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
    }),
    vscode.commands.registerCommand('momentum.endSession', async () => {
      const snapshot = sessionManager.getSnapshot();
      if (snapshot.state === 'idle') {
        void vscode.window.showWarningMessage('No active session to end.');
        return;
      }

      emitSessionEvent('complete');
      sessionManager.endSession();
      await syncClient.flush();
      void vscode.window.showInformationMessage('Momentum session completed.');
    }),
  );
}

export function deactivate() {
  activityTracker?.stop();
}
