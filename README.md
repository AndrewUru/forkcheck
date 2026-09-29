# Forkcheck

Primera entrega de una aplicación empresarial de inspección y control de equipos. Next.js App Router + TypeScript estricto + React + Tailwind + Supabase (Auth, PostgreSQL, Storage, RLS). Preparada para Vercel y para una futura PWA con sincronización offline.

## Qué funciona

- Login por código de organización e ID de empleado usando Supabase Auth; sin directorio público de empleados ni contraseñas propias.
- Sesiones verificadas, roles y alcance de sucursales; organización derivada del perfil autenticado.
- Dashboard con agregación SQL, filtros combinables y estados actuales; listado de sucursales paginado.
- Listado de equipos paginado, ficha, QR descargable e historial autorizado de inspecciones, incidencias, mantenimiento y traslados.
- Checklist móvil generado desde la versión publicada de una plantilla, respuestas locales, confirmación explícita del marcado en bloque, fotos y firma táctil.
- Finalización transaccional e idempotente: validación de versión y respuestas, firma, incidencias automáticas y bloqueo. Un resultado correcto nunca desbloquea el equipo.
- Bucket privado de evidencias; subida con decodificación real de imagen, eliminación de EXIF, límites de tamaño y MIME. URLs de lectura firmadas de corta duración.
- Auditoría mediante triggers; sin escritura del usuario normal.
- Seed de desarrollo: Demo Logistics, 3 regiones, 6 sucursales, 40 equipos, Still/Linde/Toyota/Jungheinrich, 4 tipos, plantillas publicadas, estados e incidencias.
- Contrato inicial de herramienta IA con parámetros Zod y contexto autorizado, sin proveedor ni SQL generado.

No hay un modo de demostración que sustituya la base de datos. Sin variables de Supabase se muestra `/setup`.

## Arranque local

Requisitos: Node.js 24, npm y Docker Desktop si se utiliza Supabase local. También se puede conectar un proyecto Supabase de desarrollo existente.

```powershell
npm ci
Copy-Item .env.example .env.local
npx supabase start
npx supabase db reset
```

`db reset` elimina y reconstruye **la base local**. Aplica las migraciones y después `supabase/seed.sql`; no utilizar el seed en producción. Copia la URL y clave pública/anon mostradas por Supabase a `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave pública o anon local>
```

```powershell
npm run dev
```

Abre `http://localhost:3000`. El acceso no contiene contraseñas de demostración predefinidas: crea un usuario con el script siguiente. La identidad `seed-reporter` es inactiva, sin contraseña, y solo atribuye las incidencias del seed.

## Crear usuarios

El alias Auth es `employee_id@organization_slug.employees.forkcheck.invalid`, normalizado a minúsculas. El usuario introduce organización, ID y contraseña; no necesita conocer ese alias. La organización del formulario de login identifica el alias, **no autoriza** consultas: el alcance se deriva de la sesión y del perfil en base de datos.

El alta es una operación administrativa fuera de la aplicación. Proporciona temporalmente `SUPABASE_SERVICE_ROLE_KEY` al script mediante un gestor de secretos o variable de entorno. Nunca configurar esta clave como `NEXT_PUBLIC_*`, subirla a Git ni añadirla al runtime de Vercel.

Variables requeridas por `npm run provision:user`:

| Variable                    | Ejemplo / significado                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `PROVISION_ORGANIZATION`    | `demo-logistics`                                                                    |
| `PROVISION_EMPLOYEE`        | `admin01`, en minúsculas                                                            |
| `PROVISION_FIRST_NAME`      | Nombre                                                                              |
| `PROVISION_LAST_NAME`       | Apellidos                                                                           |
| `PROVISION_ROLE`            | `CORPORATE_ADMIN` para el primer administrador                                      |
| `PROVISION_PASSWORD`        | Contraseña inicial única de al menos 12 caracteres, suministrada como secreto       |
| `PROVISION_BRANCHES`        | UUID de sucursales separados por comas; obligatorio para roles con alcance limitado |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave administrativa solo durante la provisión                                      |

```powershell
npm run provision:user
```

El script usa `auth.admin.createUser`, crea el perfil y valida las sucursales contra la organización. Si falla el perfil revierte la identidad Auth; si falla la asignación, desactiva el perfil. No muestra la contraseña. La recuperación de credenciales se gestiona por un administrador mediante Supabase Auth: los alias `.invalid` no reciben correo. Para implantar recuperación por correo o SSO debe añadirse un canal verificado, no enviar correos a esos alias.

## Roles y acceso

| Rol              | Alcance inicial                                                                  |
| ---------------- | -------------------------------------------------------------------------------- |
| OPERARIO         | Equipos/historial de sucursales explícitas, iniciar y completar sus inspecciones |
| MANTENIMIENTO    | Lectura técnica de sucursales asignadas; esquema preparado para órdenes/acciones |
| SUPERVISOR       | Lectura, dashboard e inspecciones en sucursales asignadas                        |
| REGIONAL_MANAGER | Dashboard y lectura de múltiples sucursales explícitamente asignadas             |
| CORPORATE_ADMIN  | Lectura y operación en su organización completa                                  |
| SUPERADMIN       | Sin bypass multi-tenant; reservado para administración técnica                   |

Las pantallas para altas de equipos, configuración de plantillas, usuarios y actualizaciones de mantenimiento quedan fuera de esta primera entrega. Las escrituras administrativas se realizan por tooling de confianza; **no se conceden permisos SQL amplios al navegador** para suplir pantallas pendientes. La administración técnica de plataforma no confiere lectura global de tenants.

## Datos y garantías

Jerarquía `organizations → regions → branches → zones`, con `equipment_assignments` como historial de ubicación y un índice único para la asignación activa. Las FK compuestas evitan enlazar entidades de distintas organizaciones o zonas de otra sucursal.

`checklist_templates → checklist_versions → checklist_sections → checklist_items`. Se crea una versión en borrador, se añaden secciones/items y se publica estableciendo `published_at`. Los triggers rechazan cambios posteriores, incluso desde herramientas privilegiadas. Las inspecciones fijan la versión y la sucursal de inicio. Un traslado durante la inspección impide finalizarla sin revisión del contexto.

Las periodicidades se almacenan por plantilla; cada equipo tiene planes y `next_due`. La finalización calcula la siguiente fecha desde el día local de realización, con intervalos calendario para meses/años. El dashboard cuenta planes, no equipos, incluye atrasos y cuenta una realización por plan/fecha. La fecha filtra cumplimiento; equipos, ubicaciones, estados e incidencias son actuales. No es un almacén histórico de KPIs ni reconstruye el estado pasado de sucursales inactivas o planes reconfigurados.

Las respuestas WARNING/CRITICAL requieren descripción. Cada item controla la exigencia de fotografía y las respuestas permitidas; los puntos críticos del seed no permiten «No aplica». Un fallo bloqueante, respuesta CRITICAL o severidad configurada CRITICAL genera bloqueo conservador. No existe desbloqueo automático.

Storage guarda archivos, PostgreSQL guarda referencias. Las rutas se vinculan a organización/inspección/item; RLS comprueba propietario y sucursal. Los objetos no se sobrescriben. Si se interrumpe una subida antes de confirmar, puede quedar evidencia huérfana: establecer una tarea administrativa de retención antes de producción, verificando referencias antes de borrar. La finalización siempre es transaccional en PostgreSQL; las subidas previas a Storage no forman parte de esa transacción.

La firma gráfica acredita una confirmación interna, **no es una firma electrónica cualificada**. El formulario requiere trazo y aceptación; la base exige el objeto de firma antes de finalizar.

## Estructura

```text
app/
  (auth)/login/
  (workspace)/             # layout con sesión verificada
    admin/                 # dashboard y sucursales
    equipment/             # lista y [publicCode]
    inspections/[id]/      # checklist o resultado histórico
    incidents/
    scan/
  actions.ts               # mutaciones autorizadas y subidas
  setup/                   # configuración pendiente, sin datos falsos
components/
  dashboard/ equipment/ inspections/ ui/
lib/
  auth/ permissions/ supabase/ inspections/ validations/ ai/
types/
scripts/provision-user.ts
supabase/
  migrations/ seed.sql config.toml
tests/
docs/architecture.md
```

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Los tests de integración usan **PostgreSQL real embebido (PGlite)** y ejecutan las migraciones y el seed. Comprueban RLS entre organizaciones y sucursales, ausencia de escalada de roles, inmutabilidad de versiones, autorización de Storage, rollback, incidencias críticas, bloqueo y reintentos idempotentes. El harness reproduce únicamente las tablas y la función `auth.uid()` que utiliza el SQL: **no prueba los servicios GoTrue, PostgREST ni Storage HTTP de Supabase**.

El smoke test de navegador utiliza una instancia sin credenciales y comprueba estado de configuración, redirección de rutas protegidas, manifest y layout a 390 px. Para validar la integración alojada: iniciar sesión con dos organizaciones, abrir el QR, responder un checklist, subir fotos reales, firmar, finalizar, verificar el bloqueo y repetir la lectura desde la otra organización. No dar por validada esa integración sin ejecutarla con un proyecto configurado.

`npm run format` aplica Prettier. No se utiliza `any`. `types/database.ts` contiene el contrato de las tablas/vistas/RPC utilizadas; debe mantenerse sincronizado con las migraciones (puede reemplazarse por `supabase gen types typescript` cuando haya un stack Supabase disponible).

## Vercel

1. Crear el proyecto Supabase del entorno correspondiente. Aplicar las migraciones con `supabase link --project-ref …` y `supabase db push`, revisando el destino; no ejecutar el seed en producción.
2. Crear la organización y jerarquía inicial con tooling administrativo; provisionar usuarios.
3. Importar el repositorio en Vercel con Node 24 y el preset Next.js. Añadir solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` al entorno web.
4. Configurar URL de sitio en Supabase Auth, HTTPS y controles operativos de copias de seguridad/retención. El alta pública permanece desactivada.
5. Ejecutar la validación de integración con usuarios de alcances distintos antes de uso operativo.

Se incluye manifest e iconos instalables. No hay service worker que cachee datos empresariales ni sincronización offline. `lib/ai` prepara herramientas limitadas a la sesión; no se llama todavía a OpenAI.

Decisiones y límites: [docs/architecture.md](docs/architecture.md). Reglas para agentes: [AGENTS.md](AGENTS.md).
