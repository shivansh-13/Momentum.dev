import { z } from 'zod';
import { ingestEventSchema } from './events.js';

export const pairStartRequestSchema = z.object({
  deviceFingerprint: z.string().uuid(),
  deviceName: z.string().min(1).max(100),
  platform: z.enum(['darwin', 'win32', 'linux']),
  vscodeVersion: z.string().min(1).max(32),
});

export const pairStartResponseSchema = z.object({
  pairingId: z.string().uuid(),
  code: z.string().length(6),
  expiresAt: z.string().datetime({ offset: true }),
});

export const pairPollRequestSchema = z.object({
  pairingId: z.string().uuid(),
});

export const pairPollResponseSchema = z.object({
  status: z.enum(['pending', 'paired', 'expired']),
  deviceJwt: z.string().optional(),
  userId: z.string().uuid().optional(),
});

export const syncVscodeRequestSchema = z.object({
  events: z.array(ingestEventSchema).max(500),
});

export const syncVscodeResponseSchema = z.object({
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
});

export type PairStartRequest = z.infer<typeof pairStartRequestSchema>;
export type PairStartResponse = z.infer<typeof pairStartResponseSchema>;
export type PairPollRequest = z.infer<typeof pairPollRequestSchema>;
export type PairPollResponse = z.infer<typeof pairPollResponseSchema>;
export type SyncVscodeRequest = z.infer<typeof syncVscodeRequestSchema>;
export type SyncVscodeResponse = z.infer<typeof syncVscodeResponseSchema>;
