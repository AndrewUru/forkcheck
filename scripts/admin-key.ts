export function assertAdminKey(key: string | undefined): asserts key is string {
  if (!key)
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY: utiliza una clave secret o service_role del proyecto.',
    );
  if (key.startsWith('sb_secret_')) return;
  let role: unknown;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  } catch {
    /* Invalid JWT is rejected below. */
  }
  if (role !== 'service_role')
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no es administrativa. La clave anon/publishable no permite crear usuarios. Copia la clave secret o service_role de Supabase en esa variable local.',
    );
}
