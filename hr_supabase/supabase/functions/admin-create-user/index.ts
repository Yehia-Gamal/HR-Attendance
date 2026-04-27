import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { options, json } from '../_shared/cors.ts';

function strongEnough(password: string) {
  return typeof password === 'string' && password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const core = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${core}@Aa1!`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options(req);
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  if (callerError || !callerData.user) return json(req, { error: 'UNAUTHORIZED' }, 401);

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role_id, roles:role_id(slug, permissions)')
    .eq('id', callerData.user.id)
    .single();
  if (profileError) return json(req, { error: profileError.message }, 400);
  const role = Array.isArray(callerProfile?.roles) ? callerProfile.roles[0] : callerProfile?.roles;
  const permissions = role?.permissions || [];
  const allowed = permissions.includes('*') || ['admin', 'executive', 'executive-secretary', 'hr-manager'].includes(role?.slug);
  if (!allowed) return json(req, { error: 'FORBIDDEN' }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const explicitPassword = typeof body.password === 'string' && body.password.length > 0;
  const password = explicitPassword ? String(body.password) : generateTemporaryPassword();
  if (!email) return json(req, { error: 'EMAIL_REQUIRED' }, 400);
  if (explicitPassword && !strongEnough(password)) return json(req, { error: 'PASSWORD_WEAK: استخدم 10 أحرف على الأقل مع حرف كبير وصغير ورقم ورمز.' }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.fullName || body.name || email, avatar_url: body.avatarUrl || body.photoUrl || '' },
  });
  if (createError) return json(req, { error: createError.message }, 400);

  const userId = created.user.id;
  const patch = {
    full_name: body.fullName || body.name || email,
    avatar_url: body.avatarUrl || body.photoUrl || '',
    employee_id: body.employeeId || null,
    role_id: body.roleId || null,
    branch_id: body.branchId || null,
    department_id: body.departmentId || null,
    governorate_id: body.governorateId || null,
    complex_id: body.complexId || null,
    status: body.status || 'ACTIVE',
    temporary_password: true,
    must_change_password: true,
  };

  await adminClient.from('profiles').update(patch).eq('id', userId);
  if (body.employeeId) await adminClient.from('employees').update({ user_id: userId }).eq('id', body.employeeId);

  return json(req, { ok: true, user: { id: userId, email, ...patch }, temporaryPasswordGenerated: !explicitPassword });
});
