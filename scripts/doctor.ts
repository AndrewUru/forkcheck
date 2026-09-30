import { createClient } from '@supabase/supabase-js';
import { assertAdminKey } from './admin-key';

let problems = 0;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local.',
  );
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const tables = [
  'organizations',
  'profiles',
  'equipment',
  'checklist_versions',
  'inspections',
  'incidents',
] as const;
for (const table of tables) {
  const { error } = await db.from(table).select('id').limit(1);
  if (error?.code === '42501') {
    console.log(
      `${table}: acceso anónimo denegado, como corresponde. Se comprobará con la clave administrativa.`,
    );
  } else if (error) {
    problems++;
    console.error(
      `${table}: ${error.code === 'PGRST205' ? 'FALTA LA TABLA. Aplica las migraciones.' : `${error.code}: ${error.message}`}`,
    );
  } else console.log(`${table}: disponible (RLS se mantiene activo).`);
}
try {
  assertAdminKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(`Auth admin: ${error.message}`);
  console.log(
    `Auth administrativo: correcto. ${data.users.length ? 'Existen identidades.' : 'Todavía no hay usuarios.'}`,
  );
  for (const table of tables) {
    const { error: tableError } = await admin.from(table).select('id').limit(1);
    if (tableError) {
      problems++;
      console.error(`${table}: comprobación administrativa fallida (${tableError.code}).`);
    } else console.log(`${table}: esquema disponible y lectura administrativa verificada.`);
  }
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('active', true)
    .limit(1);
  if (profileError || !profiles?.length) {
    problems++;
    console.error(
      'Falta un perfil activo para iniciar sesión. Ejecuta la provisión de usuarios después de instalar el esquema.',
    );
  }
} catch (error) {
  problems++;
  console.error(
    error instanceof Error ? error.message : 'No se pudo comprobar Auth administrativo.',
  );
}
console.log(
  problems
    ? `Diagnóstico: ${problems} bloqueos pendientes.`
    : 'Diagnóstico: configuración preparada. Falta verificar el recorrido de inspección en navegador.',
);
process.exitCode = problems ? 1 : 0;
