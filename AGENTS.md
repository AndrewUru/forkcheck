# Forkcheck — reglas de desarrollo

## Arquitectura

Next.js App Router, TypeScript estricto, React, Tailwind y Supabase. `app/(workspace)` protege la interfaz con sesión verificada; cada Server Action vuelve a autorizar la operación. `lib/auth` deriva el perfil desde `auth.uid()`. `lib/permissions` comparte reglas de interfaz/servidor; las restricciones definitivas viven en PostgreSQL.

Lee `docs/architecture.md` antes de cambiar decisiones. Documenta primero cualquier decisión nueva. La primera entrega no incluye un editor administrativo completo, sincronización offline ni proveedor IA.

## Seguridad multi-tenant

- Nunca confiar en organization_id, rol, empleado o sucursales enviados por el navegador.
- Clientes web exclusivamente con clave pública y sesión del usuario. Prohibido introducir service-role en la aplicación o en NEXT_PUBLIC_*.
- Las funciones SECURITY DEFINER deben fijar search_path, comprobar identidad/organización/alcance y revocar EXECUTE de PUBLIC/anon.
- Toda nueva tabla de negocio necesita organization_id, FK compuestas, RLS e índices de acceso. Las vistas usan security_invoker.
- SUPERADMIN no evita RLS. Un perfil desactivado pierde acceso inmediatamente.
- No permitir escrituras directas a inspecciones, respuestas, incidencias, firmas, perfiles ni auditoría desde el cliente.
- Versiones publicadas inmutables. El histórico utiliza checklist_version_id, jamás la plantilla vigente.
- Finalización, incidencias, firma y bloqueo en una única transacción; reintentos idempotentes. Nunca desbloquear automáticamente.
- Storage privado, rutas verificadas, MIME/tamaño limitados, imágenes decodificadas y metadatos EXIF eliminados. No habilitar overwrite de evidencias.
- No registrar contraseñas, claves, tokens ni imágenes en logs. No guardar imágenes en PostgreSQL.

## Convenciones

- Componentes servidor por defecto; componentes cliente solo para interacción.
- Validar entradas con Zod. Prohibido `any`, ts-ignore o desactivar strict para hacer pasar checks.
- Mantener el formulario local y el envío agregado para futura cola offline; no escribir a Supabase en cada clic.
- Formularios accesibles, estados vacíos reales, targets táctiles grandes, ancho mínimo de verificación 390 px.
- Consultas paginadas/limitadas; no calcular KPIs a partir de una lista truncada por PostgREST.
- No simular funciones esenciales con TODO, datos frontend de muestra ni botones sin acción.
- Migraciones nuevas para cambios posteriores a un despliegue. No reescribir migraciones ya aplicadas.
- Esquema tipado en `types/database.ts`: mantenerlo sincronizado con migraciones y verificar typecheck. Los modelos de dominio están separados.
- No generar SQL arbitrario desde IA. Herramientas tipadas reciben un contexto de backend autorizado.

## Comandos

- `npm ci` — dependencias reproducibles (Node 24).
- `npm run dev` — desarrollo.
- `npm run lint` / `npm run typecheck` / `npm test` — checks obligatorios.
- `npm run build` — compilación de producción.
- `npm run format` — formato.
- `npm run test:e2e` — smoke tests en navegador.
- `npx supabase start` / `npx supabase db reset` — stack local y seed; reset borra la base local.
- `npm run provision:user` — alta administrativa con variables seguras (ver README).

## Pruebas y límites

Los tests PGlite ejecutan PostgreSQL real, migraciones, seed, roles, RLS y transacciones. El esquema auth/storage del harness es mínimo: no equivale a probar GoTrue, PostgREST y el servicio Storage de Supabase. Conservar pruebas unitarias de permisos y evaluación, y pruebas de integración de aislamiento, versionado, rollback, evidencia y reintento. No afirmar una validación de Supabase alojado sin credenciales y ejecución reales.

No desplegar, publicar secretos, añadir telemetría, borrar recursos externos ni ampliar alcance por iniciativa propia. No enviar mensajes a terceros.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
