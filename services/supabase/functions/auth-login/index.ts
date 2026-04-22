import { corsHeaders, withCors } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/db.ts';
import { verifyPassword } from '../_shared/password.ts';

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
    };

    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      throw new Error('email and password are required');
    }

    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('user_auth')
      .select('user_id, password_hash, users(display_name)')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('invalid credentials');
    }

    const valid = await verifyPassword(password, data.password_hash);
    if (!valid) {
      throw new Error('invalid credentials');
    }

    const displayName =
      data.users && typeof data.users === 'object' && 'display_name' in data.users
        ? ((data.users.display_name as string | null) ?? 'Developer')
        : 'Developer';

    return withCors(
      new Response(JSON.stringify({ userId: data.user_id, displayName }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch (error) {
    return withCors(
      new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
});
