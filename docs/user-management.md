# GestiÃ³n de usuarios

CORPORATE_ADMIN puede consultar asignaciones, crear cuentas y dar de baja usuarios desde Usuarios. La baja revoca el acceso mediante el perfil activo y conserva el histÃ³rico; no borra la identidad Auth.

InstalaciÃ³n por el responsable del proyecto:

1. Aplicar `supabase/migrations/202610010005_users.sql` despuÃ©s de las migraciones existentes.
2. Verificar la funciÃ³n con `deno check --config supabase/functions/deno.json supabase/functions/manage-users/index.ts`.
3. Instalar `manage-users` en Supabase con `npx supabase functions deploy manage-users`. No desactivar la verificaciÃ³n JWT. La funciÃ³n tambiÃ©n valida la identidad con `getUser` y el perfil activo.
4. Utilizar los secretos integrados de Edge Functions; nunca copiar la clave administrativa al runtime de Next.js ni a variables pÃºblicas.
5. Probar con sesiones reales de dos organizaciones: alta, duplicados, sucursal ajena, baja y denegaciÃ³n inmediata del usuario desactivado.

La RPC crea perfil, sucursales y auditorÃ­a en una transacciÃ³n. Si falla, la funciÃ³n intenta eliminar Ãºnicamente la identidad reciÃ©n creada. Un fallo de red puede dejar una identidad sin perfil: carece de acceso, y debe revisarse desde la administraciÃ³n de Auth antes de reintentar. No se promete atomicidad entre GoTrue y PostgreSQL.

Referencias: [autenticaciÃ³n de funciones](https://supabase.com/docs/guides/functions/auth), [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
