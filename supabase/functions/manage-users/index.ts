import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { z } from 'npm:zod@4.6.5';
import type { Database } from '../../../types/database.ts';

const inputSchema = z
  .object({
    employee_id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    password: z.string().min(12).max(128),
    role: z.enum([
      'OPERARIO',
      'MANTENIMIENTO',
      'SUPERVISOR',
      'REGIONAL_MANAGER',
      'CORPORATE_ADMIN',
    ]),
    branches: z.array(z.uuid()).max(100),
  })
  .refine((v) => v.role === 'CORPORATE_ADMIN' || v.branches.length > 0);

Deno.serve(async (request: Request) => {
  const reply = (status: number, error?: string) =>
    Response.json(error ? { error } : { success: true }, { status });
  if (request.method !== 'POST') return reply(405, 'Method unavailable');
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, 'Authentication required');
  if (Number(request.headers.get('content-length') ?? 0) > 16384)
    return reply(413, 'Request too large');
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient<Database>(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser(authorization.slice(7));
  if (authError || !user) return reply(401, 'Authentication required');
  const { data: actor } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .single();
  if (actor?.role !== 'CORPORATE_ADMIN' || actor.must_change_password)
    return reply(403, 'Not authorized');
  const { data: organization } = await db
    .from('organizations')
    .select('slug')
    .eq('id', actor.organization_id)
    .single();
  if (!organization) return reply(403, 'Organization unavailable');
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 16384) return reply(413, 'Request too large');
    body = JSON.parse(text);
  } catch {
    return reply(400, 'Invalid input');
  }
  const reset = z
    .object({ action: z.literal('reset_password'), user_id: z.uuid() })
    .safeParse(body);
  if (reset.success) {
    // Fail closed until the migration (including the Auth trigger) is installed.
    if (typeof actor.must_change_password !== 'boolean') return reply(503, 'Migration required');
    const { data: target } = await db
      .from('profiles')
      .select('id,role,active')
      .eq('id', reset.data.user_id)
      .eq('organization_id', actor.organization_id)
      .single();
    if (!target?.active || target.id === actor.id || target.role === 'SUPERADMIN')
      return reply(403, 'User unavailable');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const password = `Aa1!${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const { error } = await admin.auth.admin.updateUserById(target.id, {
      password,
      app_metadata: { forkcheck_reset_nonce: crypto.randomUUID(), forkcheck_reset_actor: actor.id },
    });
    if (error) return reply(400, 'Reset failed; wait a minute before retrying');
    return Response.json(
      { temporaryPassword: password },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return reply(400, 'Invalid input');
  const { password, ...profileInput } = parsed.data;
  // Privileged client is used only for Auth, never for business table writes.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${profileInput.employee_id}@${organization.slug}.employees.forkcheck.invalid`,
    password,
    email_confirm: true,
  });
  if (error || !created.user) return reply(409, 'User could not be created');
  const result = await db.rpc('register_employee', {
    p_auth_id: created.user.id,
    p_input: profileInput,
  });
  if (result.error) {
    const rollback = await admin.auth.admin.deleteUser(created.user.id);
    return reply(
      rollback.error ? 500 : 400,
      rollback.error ? 'Identity cleanup required' : 'Profile could not be created',
    );
  }
  return reply(200);
});
