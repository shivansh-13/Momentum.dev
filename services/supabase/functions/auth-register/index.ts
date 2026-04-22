import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/db.ts';
import { hashPassword } from '../_shared/password.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return withCors(new Response('Method not allowed', { status: 405 }));
  }

  try {
    const body = (await req.json()) as {
      email: string;
      password: string;
      displayName: string;
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';
    const displayName = body.displayName?.trim();

    if (!email || !displayName || password.length < 8) {
      throw new Error('email, displayName and password(min 8 chars) are required');
    }

    const supabase = getAdminClient();

    const { data: existing } = await supabase
      .from('user_auth')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      throw new Error('email already registered');
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      display_name: displayName,
    });
    if (userError) {
      throw userError;
    }

    const { error: authError } = await supabase.from('user_auth').insert({
      user_id: userId,
      email,
      password_hash: passwordHash,
    });
    if (authError) {
      throw authError;
    }

    return withCors(
      new Response(JSON.stringify({ userId, displayName }), {
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
