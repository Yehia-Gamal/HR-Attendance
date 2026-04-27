import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { options, json } from '../_shared/cors.ts';

// Passkeys/WebAuthn are intentionally gated until full server-side FIDO2 verification is enabled.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options(req);
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  if (Deno.env.get('WEBAUTHN_ENABLED') !== 'true') {
    return json(req, {
      error: 'PASSKEYS_DISABLED',
      message: 'تم تعطيل مفاتيح المرور حتى يتم تفعيل تحقق WebAuthn كامل من الخادم.'
    }, 501);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'UNAUTHORIZED' }, 401);

  const body = await req.json().catch(() => ({}));
  if (!body.credentialId || !body.publicKey || body.challengeVerified !== true) {
    return json(req, { error: 'WEBAUTHN_VERIFICATION_REQUIRED' }, 400);
  }

  const { data, error } = await client.from('passkey_credentials').insert({
    user_id: authData.user.id,
    label: body.label || 'Passkey',
    credential_id: body.credentialId,
    public_key: body.publicKey,
    transports: body.transports || [],
    platform: body.platform || '',
    browser_supported: true,
  }).select('*').single();
  if (error) return json(req, { error: error.message }, 400);
  await client.from('profiles').update({ passkey_enabled: true }).eq('id', authData.user.id);
  return json(req, { ok: true, credential: data });
});
