import { createHash, randomUUID } from 'node:crypto';
import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { HeartbeatEvent, Mode } from './types.js';

const exec = promisify(execCallback);

interface TrackerConfig {
  idleThresholdSeconds: number;
  heartbeatIntervalSeconds: number;
  mode: Mode;
  getUserId: () => string;
  getDeviceId: () => string;
  onHeartbeat: (event: HeartbeatEvent) => void;
  getSessionId: () => string | null;
}

export class ActivityTracker {
  private readonly config: TrackerConfig;
  private lastActivityAtMs = Date.now();
  private activeLanguage = 'plaintext';
  private filesSaved = 0;
  private localCommits = 0;
  private lastCommitCount: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: TrackerConfig) {
    this.config = config;
  }

  start(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        this.filesSaved += 1;
        this.markActive();
      }),
      vscode.workspace.onDidChangeTextDocument(() => {
        this.markActive();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.languageId) {
          this.activeLanguage = editor.document.languageId;
        }
        this.markActive();
      }),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          this.markActive();
        }
      }),
    );

    this.timer = setInterval(() => {
      void this.emitHeartbeat();
    }, this.config.heartbeatIntervalSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  incrementLocalCommits(delta = 1): void {
    this.localCommits += delta;
  }

  private markActive(): void {
    this.lastActivityAtMs = Date.now();
  }

  private async emitHeartbeat(): Promise<void> {
    const now = Date.now();
    const idleMs = now - this.lastActivityAtMs;
    const idleThresholdMs = this.config.idleThresholdSeconds * 1000;

    const activeSeconds = idleMs <= idleThresholdMs ? this.config.heartbeatIntervalSeconds : 0;
    const idleSeconds = this.config.heartbeatIntervalSeconds - activeSeconds;

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'no-workspace';
    const projectHash = createHash('sha256').update(workspacePath).digest('hex');
    const commitDelta = await this.readCommitDelta(workspacePath);

    this.localCommits += commitDelta;

    const event: HeartbeatEvent = {
      type: 'heartbeat',
      clientEventId: randomUUID(),
      deviceId: this.config.getDeviceId(),
      userId: this.config.getUserId(),
      occurredAt: new Date(now).toISOString(),
      mode: this.config.mode,
      activeSeconds,
      idleSeconds,
      language: this.activeLanguage,
      projectHash,
      filesSaved: this.filesSaved,
      localCommits: this.localCommits,
      sessionId: this.config.getSessionId(),
    };

    this.filesSaved = 0;
    this.localCommits = 0;
    this.config.onHeartbeat(event);
  }

  private async readCommitDelta(workspacePath: string): Promise<number> {
    if (workspacePath === 'no-workspace') {
      return 0;
    }

    try {
      const { stdout } = await exec('git rev-list --count HEAD', { cwd: workspacePath });
      const currentCount = Number.parseInt(stdout.trim(), 10);
      if (!Number.isFinite(currentCount)) {
        return 0;
      }

      if (this.lastCommitCount === null) {
        this.lastCommitCount = currentCount;
        return 0;
      }

      const delta = Math.max(0, currentCount - this.lastCommitCount);
      this.lastCommitCount = currentCount;
      return delta;
    } catch {
      return 0;
    }
  }
}
