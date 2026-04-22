import { pairStartRequestSchema } from '../../../../packages/shared-types/src/api.ts';
import { generatePairCode } from '../_shared/codes.ts';
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
    const body = pairStartRequestSchema.parse(await req.json());
    const supabase = getAdminClient();

    const code = generatePairCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('pairing_codes')
      .insert({
        code,
        device_fingerprint: body.deviceFingerprint,
        expires_at: expiresAt,
      })
      .select('id, code, expires_at')
      .single();

    if (error) {
      throw error;
    }

    return withCors(
      new Response(
        JSON.stringify({
          pairingId: data.id,
          code: data.code,
          expiresAt: data.expires_at,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      ),
    );
  } catch (error) {
    return withCors(
      new Response(JSON.stringify({ error: (error as Error).message }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }),
    );
  }
});
