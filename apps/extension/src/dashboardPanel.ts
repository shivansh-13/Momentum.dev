import * as vscode from 'vscode';

export interface DashboardState {
  paired: boolean;
  sessionState: 'idle' | 'running' | 'paused';
  elapsedSeconds: number;
}

export class DashboardPanel {
  private panel: vscode.WebviewPanel | null = null;

  show(context: vscode.ExtensionContext, state: DashboardState): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.render(state);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'momentumDashboard',
      'Momentum Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      null,
      context.subscriptions,
    );

    this.render(state);
  }

  onDidReceiveMessage(listener: (message: { command?: string }) => void): vscode.Disposable | undefined {
    if (!this.panel) {
      return undefined;
    }
    return this.panel.webview.onDidReceiveMessage(listener);
  }

  update(state: DashboardState): void {
    if (!this.panel) {
      return;
    }
    this.render(state);
  }

  private render(state: DashboardState): void {
    if (!this.panel) {
      return;
    }

    const sessionLabel =
      state.sessionState === 'running'
        ? 'Running'
        : state.sessionState === 'paused'
          ? 'Paused'
          : 'Idle';

    const minutes = Math.floor(state.elapsedSeconds / 60);
    const seconds = state.elapsedSeconds % 60;
    const elapsed = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Momentum Dashboard</title>
  <style>
    :root {
      --bg: #0b1218;
      --panel: #13212d;
      --text: #e7f0f7;
      --muted: #8ca4b7;
      --accent: #3ddc97;
      --warning: #f6bd60;
      --danger: #f28482;
      --button: #1d3142;
      --button-hover: #28465e;
    }
    body {
      margin: 0;
      padding: 20px;
      font-family: "Segoe UI", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at top right, #172c3c 0%, var(--bg) 55%);
    }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background: linear-gradient(180deg, #183044 0%, var(--panel) 100%);
      border: 1px solid #28465e;
      border-radius: 12px;
      padding: 18px;
    }
    .title {
      font-size: 22px;
      margin: 0 0 8px;
      letter-spacing: 0.4px;
    }
    .meta {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat {
      background: #0f1f2b;
      border: 1px solid #264255;
      border-radius: 10px;
      padding: 10px;
    }
    .stat-label {
      font-size: 12px;
      color: var(--muted);
      margin: 0 0 4px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .stat-value {
      font-size: 20px;
      margin: 0;
      font-weight: 600;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    button {
      border: 1px solid #2d4d64;
      background: var(--button);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 8px;
      font-size: 13px;
      cursor: pointer;
    }
    button:hover {
      background: var(--button-hover);
    }
    .pair { border-color: #2f7f5a; }
    .start { border-color: #3a9f6f; }
    .pause { border-color: #c78e3a; }
    .end { border-color: #bb4f4d; }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="title">Momentum.dev</h1>
    <p class="meta">The app that keeps developers consistent</p>

    <div class="stats">
      <div class="stat">
        <p class="stat-label">Pairing</p>
        <p class="stat-value">${state.paired ? 'Connected' : 'Not Connected'}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Session State</p>
        <p class="stat-value">${sessionLabel}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Elapsed</p>
        <p class="stat-value">${elapsed}</p>
      </div>
      <div class="stat">
        <p class="stat-label">Today</p>
        <p class="stat-value">Building</p>
      </div>
    </div>

    <div class="actions">
      <button class="pair" onclick="send('pair')">Pair</button>
      <button class="start" onclick="send('startSession')">Start</button>
      <button class="pause" onclick="send('pauseSession')">Pause</button>
      <button class="end" onclick="send('endSession')">End</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(command) {
      vscode.postMessage({ command });
    }
  </script>
</body>
</html>`;
  }
}
