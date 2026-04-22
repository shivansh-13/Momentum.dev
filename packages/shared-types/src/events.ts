import { z } from 'zod';

export const isoDateTime = z.string().datetime({ offset: true });

export const eventBaseSchema = z.object({
  clientEventId: z.string().uuid(),
  deviceId: z.string().uuid(),
  userId: z.string().uuid(),
  occurredAt: isoDateTime,
  mode: z.enum(['personal', 'work']),
});

export const heartbeatEventSchema = eventBaseSchema.extend({
  type: z.literal('heartbeat'),
  activeSeconds: z.number().int().min(0).max(60),
  idleSeconds: z.number().int().min(0).max(60),
  language: z.string().min(1).max(64),
  projectHash: z.string().length(64),
  filesSaved: z.number().int().min(0).max(1000),
  localCommits: z.number().int().min(0).max(100),
  sessionId: z.string().uuid().nullable().optional(),
});

export const sessionStateSchema = z.enum([
  'start',
  'tick',
  'pause',
  'resume',
  'complete',
  'abandon',
]);

export const sessionEventSchema = eventBaseSchema.extend({
  type: z.literal('session'),
  sessionId: z.string().uuid(),
  state: sessionStateSchema,
  durationSeconds: z.number().int().min(0).max(86400),
  pomodoro: z.boolean(),
});

export const outputEventSchema = eventBaseSchema.extend({
  type: z.literal('output.local_commit'),
  projectHash: z.string().length(64),
  commitCountDelta: z.number().int().min(1).max(100),
});

export const ingestEventSchema = z.discriminatedUnion('type', [
  heartbeatEventSchema,
  sessionEventSchema,
  outputEventSchema,
]);

export type HeartbeatEvent = z.infer<typeof heartbeatEventSchema>;
export type SessionEvent = z.infer<typeof sessionEventSchema>;
export type OutputEvent = z.infer<typeof outputEventSchema>;
export type IngestEvent = z.infer<typeof ingestEventSchema>;
