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
