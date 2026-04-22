export type Mode = 'personal' | 'work';

export interface ExtensionRuntimeState {
  userId: string | null;
  deviceId: string | null;
  deviceJwt: string | null;
}
