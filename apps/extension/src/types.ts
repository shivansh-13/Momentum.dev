export type Mode = 'personal' | 'work';

export interface ExtensionRuntimeState {
  userId: string | null;
  deviceId: string | null;
  deviceJwt: string | null;
}

export type SessionEventState =
  | 'start'
  | 'tick'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'abandon';

export interface HeartbeatEvent {
  type: 'heartbeat';
  clientEventId: string;
  deviceId: string;
  userId: string;
  occurredAt: string;
  mode: Mode;
  activeSeconds: number;
  idleSeconds: number;
  language: string;
  projectHash: string;
  filesSaved: number;
  localCommits: number;
  sessionId?: string | null;
}

export interface SessionEvent {
  type: 'session';
  clientEventId: string;
  deviceId: string;
  userId: string;
  occurredAt: string;
  mode: Mode;
  sessionId: string;
  state: SessionEventState;
  durationSeconds: number;
  pomodoro: boolean;
}

export interface OutputLocalCommitEvent {
  type: 'output.local_commit';
  clientEventId: string;
  deviceId: string;
  userId: string;
  occurredAt: string;
  mode: Mode;
  projectHash: string;
  commitCountDelta: number;
}

export type IngestEvent = HeartbeatEvent | SessionEvent | OutputLocalCommitEvent;

export interface PairStartPayload {
  deviceFingerprint: string;
  deviceName: string;
  platform: 'darwin' | 'win32' | 'linux';
  vscodeVersion: string;
}

export interface PairStartResponse {
  pairingId: string;
  code: string;
  expiresAt: string;
}

export interface PairPollResponse {
  status: 'pending' | 'paired' | 'expired';
  deviceJwt?: string;
  userId?: string;
}

export interface AuthRegisterPayload {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthLoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  displayName: string;
}

export interface ProfileSessionRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  kind: 'pomodoro' | 'freeform';
}

export interface ProfileMetrics {
  codingMinutesToday: number;
  commitsToday: number;
  fileSavesToday: number;
  sessionsToday: number;
  momentumScoreToday: number;
  totalHours: number;
  completedSessions: number;
  topLanguages: Array<{ language: string; seconds: number }>;
  recentSessions: ProfileSessionRow[];
}

export interface ProfileResponse {
  userId: string;
  displayName: string;
  metrics: ProfileMetrics;
}
