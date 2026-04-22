import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return withCors(new Response('Method not allowed', { status: 405 }));
  }

  try {
    const body = (await req.json()) as { userId: string };
    const userId = body.userId?.trim();

    if (!userId) {
      throw new Error('userId is required');
    }

    // Verify the userId actually exists before returning data
    const supabaseCheck = getAdminClient();
    const { data: authRow } = await supabaseCheck
      .from('user_auth')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!authRow) {
      throw new Error('user not found');
    }

    const supabase = getAdminClient();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const [{ data: user }, { data: daily }, { data: sessions }, { data: heartbeats }, { data: totals }] =
      await Promise.all([
        supabase.from('users').select('display_name').eq('id', userId).maybeSingle(),
        supabase
          .from('daily_stats')
          .select('coding_minutes, sessions_count, momentum_score')
          .eq('user_id', userId)
          .eq('day', todayStart.toISOString().slice(0, 10))
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id, started_at, ended_at, duration_seconds, status, kind')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(20),
        supabase
          .from('heartbeats')
          .select('language, local_commits, files_saved, active_seconds')
          .eq('user_id', userId)
          .gte('ts', todayStart.toISOString())
          .lte('ts', todayEnd.toISOString()),
        supabase
          .from('sessions')
          .select('duration_seconds, status')
          .eq('user_id', userId),
      ]);

    const languageMap = new Map<string, number>();
    let commitsToday = 0;
    let fileSavesToday = 0;

    for (const hb of heartbeats ?? []) {
      commitsToday += hb.local_commits ?? 0;
      fileSavesToday += hb.files_saved ?? 0;
      const current = languageMap.get(hb.language) ?? 0;
      languageMap.set(hb.language, current + (hb.active_seconds ?? 0));
    }

    let totalSeconds = 0;
    let completedSessions = 0;
    for (const row of totals ?? []) {
      totalSeconds += row.duration_seconds ?? 0;
      if (row.status === 'completed') {
        completedSessions += 1;
      }
    }

    const topLanguages = Array.from(languageMap.entries())
      .map(([language, seconds]) => ({ language, seconds }))
      .sort((a, b) => b.seconds - a.seconds);

    return withCors(
      new Response(
        JSON.stringify({
          userId,
          displayName: user?.display_name ?? 'Developer',
          metrics: {
            codingMinutesToday: daily?.coding_minutes ?? 0,
            commitsToday,
            fileSavesToday,
            sessionsToday: daily?.sessions_count ?? 0,
            momentumScoreToday: daily?.momentum_score ?? 0,
            totalHours: totalSeconds / 3600,
            completedSessions,
            topLanguages,
            recentSessions: (sessions ?? []).map((s) => ({
              id: s.id,
              startedAt: s.started_at,
              endedAt: s.ended_at,
              durationSeconds: s.duration_seconds,
              status: s.status,
              kind: s.kind,
            })),
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
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
