# Decisiones de arquitectura — primera entrega

- Next.js App Router con Server Components para lectura y Server Actions para mutaciones. Formularios de inspección locales; envío completo al finalizar, sin escrituras por cada pulsación.
- PostgreSQL es la autoridad: RLS por organización y sucursal, claves foráneas compuestas y funciones transaccionales para inicio/finalización. SUPERADMIN no obtiene acceso global implícito a datos empresariales.
- Una identidad Auth pertenece a una organización. Login por código de organización + ID de empleado mediante alias Auth determinista, sin directorio público de empleados ni contraseñas propias. Alta mediante script administrativo seguro.
- Roles almacenados en perfiles protegidos; asignaciones de sucursal explícitas para operario, mantenimiento, supervisor y regional. CORPORATE_ADMIN tiene alcance organizacional.
- Versiones publicadas inmutables. La inspección captura versión y sucursal al inicio; cambiar o trasladar el activo no reescribe el histórico.
- Firma y fotografías en bucket privado con rutas verificadas y objetos inmutables. Firma gráfica de confirmación interna, no firma cualificada. Finalización idempotente y bloqueo conservador: nunca desbloquea automáticamente una máquina.
- Traslados con una única asignación activa y validación de zona/sucursal. No se almacena sucursal actual en equipment.
- Periodicidad por equipo/plantilla, fecha de próxima revisión persistida y cálculo calendario. Se cuenta cumplimiento por planes vencidos en la fecha, no por número de equipos.
- Sin datos ficticios en el frontend: estado de configuración cuando falta Supabase; seed separado y exclusivo de desarrollo.
- PWA: manifest e iconos; sin service worker que cachee datos empresariales ni sincronización offline en esta entrega.
- IA: contratos de herramientas validados y contexto derivado de sesión. Sin proveedor, chat ni ejecución de SQL arbitrario.
- Pantallas administrativas avanzadas (editor de plantillas, usuarios, órdenes de mantenimiento, comparativas) se reservan para entregas posteriores; esquema preparado y sin botones que simulen operaciones.

Fuentes consultadas: https://nextjs.org/docs/app/api-reference/file-conventions/proxy y https://supabase.com/docs/guides/auth/server-side/creating-a-client

## Preparación de la prueba técnica

Se mantiene Supabase real. La instalación manual en SQL Editor se genera desde las migraciones y el seed para evitar versiones divergentes. El archivo solo admite una base nueva y ejecuta todo en una transacción. Un diagnóstico de consola valida tablas y el tipo de clave administrativa sin imprimir secretos. No se usa la clave administrativa en el runtime web.

## Renovación de flota y asignación personal

- CORPORATE_ADMIN gestiona altas y asignaciones personales mediante funciones SQL autorizadas. Una alta crea el equipo, su ubicación y un plan con una plantilla publicada compatible en la misma transacción.
- Se separan las asignaciones personales (`equipment_operators`) del historial de ubicación (`equipment_assignments`). Cada usuario puede tener una asignación personal activa; varios usuarios pueden compartir un equipo por turnos. Se conserva el historial al cambiar de equipo.
- La asignación requiere usuario activo, mismo tenant y acceso vigente a la sucursal del equipo. No amplía los permisos ya otorgados por sucursal. El usuario ve su equipo destacado y mantiene el acceso autorizado existente.
- La interfaz y la base validan las operaciones; no se permite modificar roles, identificadores ni organización desde los nuevos formularios.
- Se añade una migración incremental, sin reejecutar el seed ni cambiar los datos existentes. Hasta aplicarla, las pantallas nuevas informan de que la actualización está pendiente.
- El nickname se interpreta como alias personal, opcional, de hasta 40 caracteres. Solo su propietario puede modificarlo; el nombre legal y employee_id no cambian.
- La baja por renovación es una retirada con motivo y fecha: estado INACTIVE, fin de asignaciones personales y desactivación de planes. Se conserva la última ubicación y todo el historial. Se rechaza la baja mientras exista una inspección abierta. No se ofrece borrado irreversible del histórico sin una definición expresa de ese alcance.
