import { pairPollRequestSchema } from '../../../../packages/shared-types/src/api.ts';
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
    const body = pairPollRequestSchema.parse(await req.json());
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('pairing_codes')
      .select('id, expires_at, consumed_at, user_id, device_id')
      .eq('id', body.pairingId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return withCors(
        new Response(JSON.stringify({ status: 'expired' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (new Date(data.expires_at).getTime() < Date.now()) {
      return withCors(
        new Response(JSON.stringify({ status: 'expired' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (!data.consumed_at || !data.user_id || !data.device_id) {
      return withCors(
        new Response(JSON.stringify({ status: 'pending' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    const deviceJwt = `devjwt:${data.user_id}:${data.device_id}`;

    return withCors(
      new Response(
        JSON.stringify({
          status: 'paired',
          deviceJwt,
          userId: data.user_id,
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
