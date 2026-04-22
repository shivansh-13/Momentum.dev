import {
  computeMomentumScore,
  qualifiesForStreak,
} from '../../../../packages/engine/src/index.ts';
import { syncVscodeRequestSchema } from '../../../../packages/shared-types/src/api.ts';
import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/db.ts';

function confidenceFromType(type: string): 'Verified' | 'Self Reported' {
  if (type === 'output.local_commit') {
    return 'Verified';
  }
  return 'Self Reported';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return withCors(new Response('Method not allowed', { status: 405 }));
  }

  try {
    const body = syncVscodeRequestSchema.parse(await req.json());
    const supabase = getAdminClient();

    let accepted = 0;
    let rejected = 0;

    for (const event of body.events) {
      try {
        if (event.type === 'heartbeat') {
          const { error } = await supabase.from('heartbeats').insert({
            user_id: event.userId,
            device_id: event.deviceId,
            session_id: event.sessionId ?? null,
            client_event_id: event.clientEventId,
            ts: event.occurredAt,
            active_seconds: event.activeSeconds,
            idle_seconds: event.idleSeconds,
            language: event.language,
            project_hash: event.projectHash,
            files_saved: event.filesSaved,
            local_commits: event.localCommits,
          });
          if (error) {
            throw error;
          }
        }

        if (event.type === 'session') {
          if (event.state === 'start') {
            const { error } = await supabase.from('sessions').upsert({
              id: event.sessionId,
              user_id: event.userId,
              device_id: event.deviceId,
              started_at: event.occurredAt,
              duration_seconds: event.durationSeconds,
              kind: event.pomodoro ? 'pomodoro' : 'freeform',
              status: 'active',
              confidence: confidenceFromType(event.type),
            });
            if (error) {
              throw error;
            }
          }

          if (event.state === 'complete' || event.state === 'abandon') {
            const { error } = await supabase
              .from('sessions')
              .update({
                ended_at: event.occurredAt,
                duration_seconds: event.durationSeconds,
                status: event.state === 'complete' ? 'completed' : 'abandoned',
                confidence: confidenceFromType(event.type),
              })
              .eq('id', event.sessionId)
              .eq('user_id', event.userId);
            if (error) {
              throw error;
            }
          }
        }

        if (event.type === 'output.local_commit') {
          const { error } = await supabase.from('output_events').insert({
            user_id: event.userId,
            device_id: event.deviceId,
            source: 'git',
            kind: 'commit',
            occurred_at: event.occurredAt,
            weight: event.commitCountDelta,
            confidence: confidenceFromType(event.type),
          });
          if (error) {
            throw error;
          }
        }

        accepted += 1;
      } catch (_err) {
        rejected += 1;
      }
    }

    if (body.events.length > 0) {
      const sample = body.events[0];
      const nowDay = sample.occurredAt.slice(0, 10);

      const { data: heartbeats } = await supabase
        .from('heartbeats')
        .select('active_seconds')
        .eq('user_id', sample.userId)
        .gte('ts', `${nowDay}T00:00:00.000Z`)
        .lte('ts', `${nowDay}T23:59:59.999Z`);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', sample.userId)
        .eq('status', 'completed')
        .gte('started_at', `${nowDay}T00:00:00.000Z`)
        .lte('started_at', `${nowDay}T23:59:59.999Z`);

      const { data: outputEvents } = await supabase
        .from('output_events')
        .select('id')
        .eq('user_id', sample.userId)
        .gte('occurred_at', `${nowDay}T00:00:00.000Z`)
        .lte('occurred_at', `${nowDay}T23:59:59.999Z`);

      const activeMinutes = Math.floor(
        (heartbeats ?? []).reduce((acc, hb) => acc + hb.active_seconds, 0) / 60,
      );
      const sessionsCount = (sessions ?? []).length;
      const outputCount = (outputEvents ?? []).length;

      const streakQualified = qualifiesForStreak({
        activeCodingMinutes: activeMinutes,
        completedSessions: sessionsCount,
        verifiedOutputEvents: outputCount,
      });

      const momentumScore = computeMomentumScore({
        codedToday: activeMinutes > 0,
        completedFocusSessions: sessionsCount,
        outputEvents: outputCount,
        learningLogs: 0,
        streakLength: 0,
        inactiveHours: 0,
      });

      await supabase.from('daily_stats').upsert({
        user_id: sample.userId,
        day: nowDay,
        coding_minutes: activeMinutes,
        sessions_count: sessionsCount,
        output_count: outputCount,
        momentum_score: momentumScore,
        streak_qualified: streakQualified,
        updated_at: new Date().toISOString(),
      });
    }

    return withCors(
      new Response(JSON.stringify({ accepted, rejected }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch (error) {
    return withCors(
      new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
});
