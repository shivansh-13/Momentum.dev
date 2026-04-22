import { randomUUID } from 'node:crypto';

export type SessionState = 'idle' | 'running' | 'paused';

export interface SessionSnapshot {
  state: SessionState;
  sessionId: string | null;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  elapsedMs: number;
  pomodoro: boolean;
}

export class SessionManager {
  private snapshot: SessionSnapshot = {
    state: 'idle',
    sessionId: null,
    startedAtMs: null,
    pausedAtMs: null,
    elapsedMs: 0,
    pomodoro: true,
  };

  startSession(pomodoro = true): SessionSnapshot {
    if (this.snapshot.state === 'running') {
      return this.getSnapshot();
    }

    this.snapshot = {
      state: 'running',
      sessionId: randomUUID(),
      startedAtMs: Date.now(),
      pausedAtMs: null,
      elapsedMs: 0,
      pomodoro,
    };

    return this.getSnapshot();
  }

  pauseSession(): SessionSnapshot {
    if (this.snapshot.state !== 'running') {
      return this.getSnapshot();
    }

    this.snapshot.state = 'paused';
    this.snapshot.pausedAtMs = Date.now();
    this.snapshot.elapsedMs = this.currentElapsedMs();
    return this.getSnapshot();
  }

  resumeSession(): SessionSnapshot {
    if (this.snapshot.state !== 'paused') {
      return this.getSnapshot();
    }

    const pausedDelta = Date.now() - (this.snapshot.pausedAtMs ?? Date.now());
    this.snapshot.startedAtMs = (this.snapshot.startedAtMs ?? Date.now()) + pausedDelta;
    this.snapshot.pausedAtMs = null;
    this.snapshot.state = 'running';
    return this.getSnapshot();
  }

  endSession(): SessionSnapshot {
    const final = this.getSnapshot();
    this.snapshot = {
      state: 'idle',
      sessionId: null,
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
      pomodoro: true,
    };
    return final;
  }

  getSnapshot(): SessionSnapshot {
    return {
      ...this.snapshot,
      elapsedMs: this.currentElapsedMs(),
    };
  }

  private currentElapsedMs(): number {
    if (this.snapshot.state === 'idle' || !this.snapshot.startedAtMs) {
      return this.snapshot.elapsedMs;
    }
    if (this.snapshot.state === 'paused') {
      return this.snapshot.elapsedMs;
    }
    return Date.now() - this.snapshot.startedAtMs;
  }
}
