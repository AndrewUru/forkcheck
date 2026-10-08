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
- Asistente IA con OpenAI para historial, incidencias y KPIs autorizados; herramientas de lectura con parámetros Zod, sin SQL generado.

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

El script usa `auth.admin.createUser`, crea el perfil y valida las sucursales contra la organización. Si falla el perfil revierte la identidad Auth; si falla la asignación, desactiva el perfil. No muestra la contraseña. La recuperación se gestiona desde **Administración → Usuarios → Restablecer contraseña**, después de verificar la identidad del empleado. Los alias `.invalid` no reciben correo. Para implantar recuperación por correo o SSO debe añadirse un canal verificado, no enviar correos a esos alias.

### Contraseñas: instalación y uso

En un entorno existente, aplicar primero la migración `supabase/migrations/202610070001_password_management.sql` mediante el procedimiento habitual de migraciones, y después actualizar `manage-users` con `npx supabase functions deploy manage-users --project-ref <proyecto>`. Revisar siempre el proyecto de destino; estos pasos no se ejecutan automáticamente. No añadir la clave administrativa a Next.js o Vercel. En Supabase Auth, configurar longitud mínima de contraseña de 12 caracteres y mantener desactivadas las altas públicas.

- El administrador puede restablecer cuentas activas de su organización, excepto la propia y SUPERADMIN. La contraseña temporal se muestra solo en esa respuesta: entregarla individualmente y cerrar el aviso. No queda disponible para consultarla después. Si se pierde, generar otra tras esperar un minuto.
- El empleado entra con la temporal y debe elegir una contraseña personal. Hasta entonces, el servidor y RLS bloquean el acceso a datos y operaciones de negocio, incluso con una sesión anterior. Las URLs de evidencia ya firmadas mantienen su breve caducidad.
- **Perfil → Cambiar contraseña** pide la actual y dos entradas coincidentes de la nueva (12–128 caracteres). El trigger de Auth registra el cambio y elimina la obligación en la misma transacción, sin registrar contraseñas ni hashes.
- Para el único administrador que pierda acceso, utilizar el procedimiento de soporte autorizado de Supabase Auth; otro CORPORATE_ADMIN activo de la organización también puede restablecer su cuenta. La interfaz no permite restablecerse a uno mismo.

Validación en un proyecto de prueba después de instalar: restablecer un empleado, comprobar que la contraseña anterior falla, que la temporal obliga al cambio y bloquea consultas/RPC, cambiarla, salir y entrar con la nueva; comprobar también rechazo de contraseña actual incorrecta, otra organización, usuario inactivo y auditoría sin secretos. Probar con la configuración real de seguridad de Auth (incluidas políticas de reautenticación). PGlite y los mocks locales no validan GoTrue ni el despliegue de la Edge Function.

## Roles y acceso

### Demo con cinco participantes

Usa un proyecto Supabase de demostración con las migraciones aplicadas. Ejecuta `npm run setup:demo` y aplica `artifacts/setup-demo.sql` en su SQL Editor. Crea `demo-testers`, cinco sucursales y diez equipos con un checklist publicado. Si la organización existe, aborta sin modificarla. No utiliza el seed ni modifica otras organizaciones.

Proporciona al script administrativo la URL del proyecto de demo y `SUPABASE_SERVICE_ROLE_KEY`, junto con `DEMO_PASSWORD_1` a `DEMO_PASSWORD_5`: cinco contraseñas distintas de al menos 12 caracteres. Usa variables temporales o un gestor de secretos; no añadas la clave administrativa a Vercel. Ejecuta `npm run provision:demo`.

Cada participante entra con organización **demo-testers**, ID **demo01** a **demo05** y su contraseña correspondiente. Su rol OPERARIO limita el acceso a su sucursal y sus dos equipos. Entrega las credenciales individualmente. Al repetir el alta se conservan las cuentas existentes con configuración correcta y sus contraseñas. Un error detiene el proceso; las altas anteriores permanecen. Una cuenta desactivada o con alcance diferente requiere revisión administrativa.

No hay reinicio automático: inspecciones, evidencias y bloqueos permanecen. Para probar CORPORATE_ADMIN utiliza organizaciones independientes por persona.

Todos los usuarios activos pueden abrir **Calendario diario** (`/calendar`) para consultar la próxima revisión de los equipos y los reportes completados en cada fecha dentro de su alcance. Hoy incluye atrasados; los días pasados muestran las inspecciones efectivamente realizadas. La fecha utiliza la zona horaria de la organización.

El mantenimiento lo realiza la empresa de renting. **Proveedores de renting** (`/providers`) permite consultar sus teléfonos, correos y notas de contacto. CORPORATE_ADMIN da de alta, edita y desactiva proveedores. Para activar el directorio en una base existente, ejecuta `npm run setup:providers` y aplica una vez `artifacts/update-providers.sql` en Supabase SQL Editor. Esta actualización es independiente de la de flota y no añade contactos ficticios.

| Rol              | Alcance inicial                                                                  |
| ---------------- | -------------------------------------------------------------------------------- |
| OPERARIO         | Equipos/historial de sucursales explícitas, iniciar y completar sus inspecciones |
| MANTENIMIENTO    | Lectura técnica de sucursales asignadas; esquema preparado para órdenes/acciones |
| SUPERVISOR       | Lectura, dashboard e inspecciones en sucursales asignadas                        |
| REGIONAL_MANAGER | Dashboard y lectura de múltiples sucursales explícitamente asignadas             |
| CORPORATE_ADMIN  | Lectura y operación en su organización completa                                  |
| SUPERADMIN       | Sin bypass multi-tenant; reservado para administración técnica                   |

CORPORATE_ADMIN puede dar de alta y retirar equipos, y asignar un equipo activo a cada usuario mediante las pantallas de flota. La retirada conserva el historial y desactiva los planes. El usuario puede editar su nickname en «Mi perfil». Estas funciones requieren aplicar las migraciones incrementales de flota en Supabase. La configuración de plantillas, usuarios y actualizaciones de mantenimiento sigue fuera de esta entrega; **no se conceden permisos SQL amplios al navegador**. La administración técnica de plataforma no confiere lectura global de tenants.

Para actualizar el proyecto Supabase ya existente sin volver a ejecutar el seed, ejecuta `npm run setup:fleet` y pega el contenido de `artifacts/update-fleet.sql` en su SQL Editor. Ejecuta el bloque una sola vez; después recarga la app. La actualización debe aplicarse con acceso de propietario a ese proyecto.

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
3. Importar el repositorio en Vercel con Node 24 y el preset Next.js. Añadir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; para el asistente, añadir `OPENAI_API_KEY` como secreto solo de servidor.
4. Configurar URL de sitio en Supabase Auth, HTTPS y controles operativos de copias de seguridad/retención. El alta pública permanece desactivada.
5. Ejecutar la validación de integración con usuarios de alcances distintos antes de uso operativo.

Se incluye manifest e iconos instalables. No hay service worker que cachee datos empresariales ni sincronización offline. El asistente de `/assistant` usa `OPENAI_API_KEY` solo en el servidor y consultas limitadas por RLS. Sin esa variable muestra un error de configuración. `OPENAI_MODEL` permite elegir el modelo; el valor por defecto es `gpt-5-mini`.

Decisiones y límites: [docs/architecture.md](docs/architecture.md). Reglas para agentes: [AGENTS.md](AGENTS.md).
