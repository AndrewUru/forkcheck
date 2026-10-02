import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../types/database';
import { assertAdminKey } from './admin-key';

assertAdminKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
const url = z.url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
const passwords = Array.from({ length: 5 }, (_, index) =>
  z
    .string()
    .min(12)
    .parse(process.env[`DEMO_PASSWORD_${index + 1}`]),
);
if (new Set(passwords).size !== 5) throw new Error('Utiliza cinco contraseñas distintas.');
const db = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: org, error } = await db
  .from('organizations')
  .select('id')
  .eq('slug', 'demo-testers')
  .single();
if (error || !org)
  throw new Error('Aplica primero artifacts/setup-demo.sql en el proyecto de demo.');
const { data: branches, error: branchError } = await db
  .from('branches')
  .select('id,name')
  .eq('organization_id', org.id)
  .limit(6);
if (branchError || branches?.length !== 5)
  throw new Error('La demo debe tener exactamente cinco sucursales.');

// Validar todos los destinos antes de crear la primera identidad.
const targets = [];
for (let index = 0; index < 5; index++) {
  const suffix = String(index + 1).padStart(2, '0');
  const employee = `demo${suffix}`;
  const matches = branches.filter((branch) => branch.name === `Demo ${suffix}`);
  if (matches.length !== 1) throw new Error(`Sucursal incorrecta para ${employee}.`);
  const branch = matches[0];
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id,role,active')
    .eq('organization_id', org.id)
    .eq('employee_id', employee)
    .maybeSingle();
  if (profileError) throw new Error('No se pudo verificar el usuario existente.');
  if (profile) {
    const { data: scope, error: scopeError } = await db
      .from('user_branches')
      .select('branch_id')
      .eq('user_id', profile.id)
      .limit(2);
    if (
      profile.role !== 'OPERARIO' ||
      !profile.active ||
      scopeError ||
      scope?.length !== 1 ||
      scope[0].branch_id !== branch.id
    )
      throw new Error(
        `La cuenta ${employee} existe con una configuración diferente. Revisión administrativa necesaria.`,
      );
  }
  targets.push({ employee, branch, exists: !!profile, password: passwords[index] });
}
for (const target of targets) {
  if (target.exists) {
    console.log(`${target.employee}: ya existe; contraseña conservada.`);
    continue;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'scripts/provision-user.ts'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PROVISION_ORGANIZATION: 'demo-testers',
          PROVISION_EMPLOYEE: target.employee,
          PROVISION_FIRST_NAME: 'Participante',
          PROVISION_LAST_NAME: target.employee,
          PROVISION_ROLE: 'OPERARIO',
          PROVISION_BRANCHES: target.branch.id,
          PROVISION_PASSWORD: target.password,
        },
      },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Alta de ${target.employee} interrumpida. Las cuentas anteriores se conservan.`,
            ),
          ),
    );
  });
}
