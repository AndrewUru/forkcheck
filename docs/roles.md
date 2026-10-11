# Roles de Forkcheck

Los niveles organizativos no heredan automáticamente los permisos de los niveles inferiores. PostgreSQL vuelve a autorizar cada operación y aplica RLS a las lecturas, incluidas las de dirección.

| Rol                 | Consulta                                                      | Acciones operativas                                           |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Operario            | Equipos, revisiones e incidencias de sus sucursales           | Realizar y firmar checks, autoasignarse maquinaria de su centro y quitar su asignación |
| Jefe de almacén     | Sus sucursales, dashboard y operarios con sucursal compartida | Realizar checks, crear operarios; crear, modificar y asignar maquinaria |
| Delegado del centro | Sus sucursales y dashboard                                    | Pendientes de definición; por ahora consulta                  |
| Equipo EHS          | Sus sucursales, dashboard, operarios y jefes de su alcance     | Crear operarios y jefes, designar jefes y sus centros; crear, modificar y asignar maquinaria |
| Director regional   | Sucursales asignadas explícitamente y dashboard               | Ninguna                                                       |
| Director general    | Toda su organización y dashboard                              | Ninguna                                                       |

Todos pueden cambiar su propia contraseña y nickname. El alcance regional se configura seleccionando las sucursales correspondientes; añadir una sucursal a una región no concede acceso automáticamente a los directores regionales existentes. El jefe puede tener varias sucursales explícitas, igual que el supervisor anterior.

## Límites del jefe de almacén

Solo puede crear cuentas OPERARIO y concederles sucursales que él ya tiene autorizadas. No puede crear otros jefes, delegados, EHS, directores ni administradores. El navegador no determina su organización ni su rol.

Puede asignar equipos a operarios activos con acceso a la sucursal de destino. Si el operario ya tiene otro equipo, el jefe también debe tener acceso a la ubicación actual de ese equipo para cambiar o quitar la asignación. Las asignaciones de otros centros no se muestran ni se pueden terminar por conocer su identificador. Los cambios conservan el historial y rechazan ediciones concurrentes obsoletas.

Dar de baja usuarios, restablecer contraseñas, retirar máquinas, gestionar proveedores y editar/publicar plantillas siguen reservados al administrador de empresa anterior. Los permisos de desbloqueo y cierre de incidencias de delegado/EHS requieren una definición posterior; no se conceden por su posición jerárquica.

## EHS y gestión compartida de maquinaria

EHS crea operarios y jefes desde Usuarios. También puede designar a un operario existente como jefe y modificar los centros de un jefe existente. Debe tener acceso a todos sus centros anteriores y nuevos; no puede promover mandos superiores ni ampliar su propio alcance. El cambio conserva la identidad, exige finalizar inspecciones abiertas y, al promover a un operario, cierra su asignación personal conservando el histórico. El formulario requiere confirmar la designación y rechaza cambios de rol o centros hechos entretanto.

EHS y jefes pueden dar de alta equipos con una plantilla publicada compatible y modificar su código interno, marca, modelo, serie, año, centro y zona. La ficha del equipo ofrece «Modificar equipo». El tipo, el plan de revisión, el QR y el estado no se alteran en esa edición. La edición tampoco desbloquea maquinaria. Para un traslado deben tener acceso al origen y destino, no debe haber inspecciones abiertas y todos los operarios asignados deben conservar acceso al destino. Se mantiene el historial de ubicaciones y se rechazan guardados obsoletos.

## Autoasignación del operario

Desde la ficha puede pulsar «Asignarme este equipo» o «Quitar mi asignación». La aplicación obtiene la identidad desde la sesión y verifica el centro en PostgreSQL; no permite elegir otro usuario. Puede cambiar su equipo actual, mantiene una única asignación personal activa y conserva las anteriores. Varios operarios pueden compartir máquina por turnos. No se admiten equipos retirados. Una asignación nunca autoriza el uso ni elimina bloqueos o revisiones pendientes.

## Compatibilidad e instalación

La migración `202610110001_business_roles.sql` renombra los valores del enum existente:

- SUPERVISOR → JEFE_ALMACEN.
- REGIONAL_MANAGER → DIRECTOR_REGIONAL.
- OPERARIO, MANTENIMIENTO, CORPORATE_ADMIN y SUPERADMIN conservan su identidad y responsabilidades.

No se recrean perfiles ni se modifican las FK de inspecciones, firmas, auditoría o asignaciones. Las cuentas de mantenimiento y administración se identifican como anteriores en la interfaz; no aparecen entre los nuevos roles de negocio del formulario de alta. El script `provision:user` mantiene su disponibilidad para administración autorizada.

La ampliación de gestión compartida se instala con `202610110002_shared_fleet.sql`, después de `202610110001_business_roles.sql`. Para una instalación existente, el responsable debe aplicar solo las migraciones pendientes en orden, actualizar `manage-users` y la aplicación en una ventana coordinada. La aplicación con los nombres antiguos no es compatible con la base ya renombrada. No se repiten migraciones ni se vuelve a cargar el seed. No hay despliegue automático.

Comprobaciones locales: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e`. La Edge Function se verifica con `deno check --config supabase/functions/deno.json supabase/functions/manage-users/index.ts`.

PGlite comprueba PostgreSQL, RLS, migración de perfiles existentes, aislamiento, asignaciones, rechazo de escaladas y conservación de inspecciones abiertas. El navegador sin backend comprueba acceso protegido y presentación básica; no valida las sesiones de los nuevos roles en Supabase alojado. Después de la instalación se requiere una prueba real de GoTrue, PostgREST y Storage con cuentas de distintos centros y organizaciones.
