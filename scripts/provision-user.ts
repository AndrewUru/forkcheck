import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { employeeEmail } from '../lib/validations/inspection';
import { roles } from '../types/domain';
import type { Database } from '../types/database';
const input = z
  .object({
    url: z.url(),
    key: z.string().min(20),
    organization: z.string().regex(/^[a-z0-9-]{2,40}$/),
    employee: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    password: z.string().min(12),
    first: z.string().min(1),
    last: z.string().min(1),
    role: z.enum(roles),
    branches: z.array(z.uuid()),
  })
  .parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    organization: process.env.PROVISION_ORGANIZATION,
    employee: process.env.PROVISION_EMPLOYEE,
    password: process.env.PROVISION_PASSWORD,
    first: process.env.PROVISION_FIRST_NAME,
    last: process.env.PROVISION_LAST_NAME,
    role: process.env.PROVISION_ROLE,
    branches: (process.env.PROVISION_BRANCHES ?? '').split(',').filter(Boolean),
  });
const db = createClient<Database>(input.url, input.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: org, error: orgError } = await db
  .from('organizations')
  .select('id')
  .eq('slug', input.organization)
  .single();
if (orgError) throw new Error('Organization unavailable');
if (!['CORPORATE_ADMIN', 'SUPERADMIN'].includes(input.role) && !input.branches.length)
  throw new Error('Explicit branch assignments required');
if (input.branches.length) {
  const { data, error } = await db
    .from('branches')
    .select('id')
    .eq('organization_id', org.id)
    .in('id', input.branches);
  if (error || data.length !== input.branches.length) throw new Error('Invalid branch scope');
}
const { data, error } = await db.auth.admin.createUser({
  email: employeeEmail(input.organization, input.employee),
  password: input.password,
  email_confirm: true,
});
if (error)
  throw new Error('Auth user could not be created (check whether employee already exists)');
const { error: profileError } = await db
  .from('profiles')
  .insert({
    id: data.user.id,
    organization_id: org.id,
    employee_id: input.employee,
    first_name: input.first,
    last_name: input.last,
    role: input.role,
  });
if (profileError) {
  await db.auth.admin.deleteUser(data.user.id);
  throw new Error('Profile creation failed; Auth identity rolled back');
}
if (input.branches.length) {
  const { error } = await db
    .from('user_branches')
    .insert(
      input.branches.map((branch_id) => ({
        organization_id: org.id,
        user_id: data.user.id,
        branch_id,
      })),
    );
  if (error) {
    await db.from('profiles').update({ active: false }).eq('id', data.user.id);
    throw new Error('Branch assignment failed; profile disabled');
  }
}
console.log(`Created employee ${input.employee} in ${input.organization} (${input.role}).`);
