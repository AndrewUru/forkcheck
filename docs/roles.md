# Roles de Forkcheck

Los niveles organizativos no heredan automáticamente los permisos de los niveles inferiores. PostgreSQL vuelve a autorizar cada operación y aplica RLS a las lecturas, incluidas las de dirección.

| Rol | Consulta | Acciones operativas |
| --- | --- | --- |
| Operario | Equipos, revisiones e incidencias de sus sucursales | Realizar y firmar sus checks; los fallos generan incidencias |
| Jefe de almacén | Sus sucursales, dashboard y operarios con sucursal compartida | Realizar checks, crear operarios y asignar/quitar carretillas |
| Delegado del centro | Sus sucursales y dashboard | Pendientes de definición; por ahora consulta |
| Equipo EHS | Sus sucursales y dashboard | Pendientes de definición; por ahora consulta |
| Director regional | Sucursales asignadas explícitamente y dashboard | Ninguna |
| Director general | Toda su organización y dashboard | Ninguna |

Todos pueden cambiar su propia contraseña y nickname. El alcance regional se configura seleccionando las sucursales correspondientes; añadir una sucursal a una región no concede acceso automáticamente a los directores regionales existentes. El jefe puede tener varias sucursales explícitas, igual que el supervisor anterior.

## Límites del jefe de almacén

Solo puede crear cuentas OPERARIO y concederles sucursales que él ya tiene autorizadas. No puede crear otros jefes, delegados, EHS, directores ni administradores. El navegador no determina su organización ni su rol.

Puede asignar equipos a operarios activos con acceso a la sucursal de destino. Si el operario ya tiene otro equipo, el jefe también debe tener acceso a la ubicación actual de ese equipo para cambiar o quitar la asignación. Las asignaciones de otros centros no se muestran ni se pueden terminar por conocer su identificador. Los cambios conservan el historial y rechazan ediciones concurrentes obsoletas.

Dar de baja usuarios, restablecer contraseñas, crear/retirar máquinas, gestionar proveedores y editar/publicar plantillas siguen reservados al administrador de empresa anterior. Los permisos de desbloqueo y cierre de incidencias de delegado/EHS requieren una definición posterior; no se simulan ni se conceden por su posición jerárquica.

## Compatibilidad e instalación

La migración `202610110001_business_roles.sql` renombra los valores del enum existente:

- SUPERVISOR → JEFE_ALMACEN.
- REGIONAL_MANAGER → DIRECTOR_REGIONAL.
- OPERARIO, MANTENIMIENTO, CORPORATE_ADMIN y SUPERADMIN conservan su identidad y responsabilidades.

No se recrean perfiles ni se modifican las FK de inspecciones, firmas, auditoría o asignaciones. Las cuentas de mantenimiento y administración se identifican como anteriores en la interfaz; no aparecen entre los nuevos roles de negocio del formulario de alta. El script `provision:user` mantiene su disponibilidad para administración autorizada.

Para una instalación existente, el responsable debe aplicar las migraciones pendientes en orden, incluida la nueva, actualizar `manage-users` y la aplicación en una ventana coordinada. La aplicación anterior contiene los nombres antiguos y no es compatible con la base ya renombrada. La migración no debe ejecutarse dos veces, ni debe volver a cargarse el seed. No hay despliegue automático.

Comprobaciones locales: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`. La Edge Function se verifica con `deno check --config supabase/functions/deno.json supabase/functions/manage-users/index.ts`.

PGlite comprueba PostgreSQL, RLS, migración de perfiles existentes, aislamiento, asignaciones, rechazo de escaladas y conservación de inspecciones abiertas. El navegador sin backend comprueba acceso protegido y presentación básica; no valida las sesiones de los nuevos roles en Supabase alojado. Después de la instalación se requiere una prueba real de GoTrue, PostgREST y Storage con cuentas de distintos centros y organizaciones.
