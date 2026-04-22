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
    const body = (await req.json()) as { code: string; userId: string };
    if (!body.code || !body.userId) {
      throw new Error('code and userId are required');
    }

    const supabase = getAdminClient();

    const { data: pairing, error: pairingError } = await supabase
      .from('pairing_codes')
      .select('id, device_fingerprint, expires_at, consumed_at')
      .eq('code', body.code)
      .maybeSingle();

    if (pairingError) {
      throw pairingError;
    }

    if (!pairing) {
      return withCors(
        new Response(JSON.stringify({ error: 'pairing code not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (pairing.consumed_at) {
      return withCors(
        new Response(JSON.stringify({ error: 'pairing code already consumed' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    if (new Date(pairing.expires_at).getTime() < Date.now()) {
      return withCors(
        new Response(JSON.stringify({ error: 'pairing code expired' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }

    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        user_id: body.userId,
        device_fingerprint: pairing.device_fingerprint,
        device_name: 'VS Code',
        platform: 'unknown',
        vscode_version: 'dev',
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (deviceError) {
      throw deviceError;
    }

    const { error: updateError } = await supabase
      .from('pairing_codes')
      .update({
        user_id: body.userId,
        device_id: device.id,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', pairing.id);

    if (updateError) {
      throw updateError;
    }

    return withCors(
      new Response(JSON.stringify({ ok: true, pairingId: pairing.id, deviceId: device.id }), {
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
