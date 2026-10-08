# Decisiones de arquitectura — primera entrega

## Experiencia del turno

- El inicio del operario dirige siempre a `/scan`, incluso si tiene equipo asignado. Sin sesión se requiere login; el cambio obligatorio de contraseña sigue teniendo prioridad. El administrador conserva su centro de control. `/shift` permanece como resumen del turno, accesible desde el escáner.
- La navegación móvil prioriza Inicio, Equipos, Incidencias y Perfil; el resto sigue accesible en un menú secundario. Los administradores mantienen su centro de control como inicio.
- Antes de firmar se muestra un resumen derivado de las respuestas locales y de las mismas reglas de bloqueo del dominio. El resultado definitivo y el estado actual del equipo se consultan después de la transacción de finalización. No se modifican permisos, persistencia ni bloqueo automático.

## Experiencia guiada y escáner dentro de la aplicación

- El escáner utiliza la cámara tras pulsar «Activar cámara», con permiso del navegador, preferencia por cámara trasera y decodificación local mediante jsQR. No guarda ni envía fotogramas. Detiene la cámara al salir, ocultar la página o reconocer un QR válido. Permite también introducir un código o enlace de etiqueta. Solo acepta rutas de equipo del mismo origen y códigos públicos válidos; el servidor vuelve a verificar sesión y RLS antes de abrir el equipo.
- La ficha del equipo prioriza el estado real, la revisión pendiente/en curso y una siguiente acción clara. El equipo asignado queda como acceso secundario en el escáner. Se conserva la consulta de ficha, QR, históricos y contactos; no se autorizan máquinas por una animación ni por el resultado del último checklist.
- La inspección se divide en pasos de hasta cinco preguntas dentro de cada sección, con validación de respuestas, notas y fotografías antes de avanzar, resumen y firma al final. No hay autoselección de respuestas. El formulario mantiene respuestas y archivos en memoria y conserva el envío agregado, las evidencias privadas y los reintentos existentes. La confirmación se invalida al cambiar respuestas; no se incorpora almacenamiento offline.
- El resultado diferencia revisión guardada de estado actual del equipo, mantiene visibles los bloqueos previos y ofrece el siguiente destino. El dashboard prioriza bloqueos, equipos con revisiones atrasadas e incidencias; los totales proceden de RPC o conteos exactos y las listas muestran explícitamente sus límites.
- Se incorporan estados de carga y transiciones breves respetando movimiento reducido. Se verifica móvil a 390 px, navegación por teclado y fallos de cámara. Los tests con cámara simulada no sustituyen la prueba en un teléfono físico sobre HTTPS.

## Demostración con varios participantes

- La preparación administrativa crea `demo-testers`, una organización exclusiva, cinco sucursales y dos equipos por sucursal, con checklist publicado y planes diarios. No copia datos reales ni modifica organizaciones existentes; si el slug ya existe, aborta toda la transacción.
- Cada participante utiliza una identidad OPERARIO (`demo01` a `demo05`) con acceso a una sola sucursal. Las contraseñas distintas se suministran como secretos al script de alta, fuera del runtime web. No se comparten cuentas ni se concede administración organizacional a los participantes.
- El alta es secuencial y admite reintentos únicamente si las cuentas existentes mantienen exactamente el rol, organización y sucursal esperados. No restablece contraseñas, equipos bloqueados ni históricos. Las pruebas de administración necesitan organizaciones independientes.

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

## Asistente de IA

- El asistente usa OpenAI desde el servidor, con la clave solo en `OPENAI_API_KEY`. Cada petición autentica de nuevo al usuario y carga su perfil activo; nunca recibe organización ni rol del navegador.
- Las herramientas son lecturas acotadas y validadas: historial de un equipo, incidencias recientes autorizadas y métricas del dashboard para roles con permiso. Utilizan el cliente Supabase del usuario, por lo que RLS sigue siendo la autoridad. No se ofrece SQL libre ni herramientas de escritura.
- El modelo recibe solo los datos devueltos por las herramientas; sus respuestas no autorizan el uso de un equipo ni sustituyen una inspección. Las conversaciones no se persisten. Se limita la entrada, la salida y el número de pasos por petición.

## Calendario diario

- Todos los perfiles activos acceden al calendario con su alcance habitual de RLS. Se muestran los equipos con próxima revisión y las inspecciones completadas en la fecha seleccionada, con paginación independiente.
- Hoy incluye equipos con revisiones atrasadas. En fechas futuras se muestra la próxima revisión ya programada, sin inventar recurrencias. Las fechas pasadas muestran inspecciones realizadas: la programación actual no reconstruye pendientes históricos.
- La fecha y los límites del día se calculan en la zona horaria de la organización, incluidos los cambios de horario. Esta pantalla usa tablas y vistas existentes y no requiere una migración.

## Proveedores de renting

- La empresa de renting realiza el mantenimiento; la organización registra inspecciones y reportes. El directorio guarda proveedores reales y sus contactos, sin datos de muestra ni envío automático de reportes.
- Los perfiles activos consultan los contactos de su organización. CORPORATE_ADMIN crea, edita y desactiva proveedores mediante una RPC autorizada y auditada. No se permite escritura directa desde el cliente ni borrado del histórico.

## Administración de usuarios

- Se amplía expresamente el alcance con altas y bajas para CORPORATE_ADMIN. La ficha de cada equipo muestra sus asignaciones personales con paginación.
- El alta Auth se ejecuta en una Edge Function de Supabase: la clave administrativa queda exclusivamente en ese runtime, nunca en Next.js. La función verifica la sesión; una RPC vuelve a comprobar el administrador activo, deriva la organización y valida rol y sucursales antes de crear perfil, alcance y auditoría en una transacción. Si falla, se elimina la identidad Auth recién creada.
- Eliminar significa dar de baja: desactivar el perfil y cerrar asignaciones personales en una transacción auditada. Se conserva Auth y el histórico; no se permite la baja propia. No se ofrece reactivación ni borrado irreversible.
- La migración y la función requieren instalación explícita; no se despliegan automáticamente.

## Cambio y recuperación de contraseñas

- Perfil permite cambiar la contraseña tras verificar la actual con Supabase Auth. Los alias internos no reciben correo. CORPORATE_ADMIN restablece únicamente cuentas activas de su organización, excepto la propia y SUPERADMIN, desde la Edge Function `manage-users`.
- El restablecimiento usa una contraseña aleatoria y un identificador nuevo en `app_metadata` (solo modificable por Auth administrativo). Un trigger sobre `auth.users` valida de nuevo al administrador y al destinatario y establece `profiles.must_change_password`, con auditoría sin secretos, dentro de la transacción que cambia la contraseña. No se copian hashes de Auth a tablas de negocio.
- El trigger es de restricción, diferido hasta el commit: GoTrue escribe contraseña y metadatos en sentencias separadas dentro de una transacción. Lee los metadatos finales para distinguir el restablecimiento. Referencia: [implementación de actualización administrativa de Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/admin.go).
- Un cambio posterior real de contraseña elimina esa obligación mediante el mismo trigger. Cambiar metadatos o llamar a una RPC no la elimina. Las consultas RLS y RPC de negocio bloquean al perfil pendiente; solo puede consultar su propio perfil activo, cambiar contraseña o salir. La página de cambio obligatorio queda fuera del layout de trabajo para evitar bucles de redirección.
- La contraseña temporal se devuelve únicamente en la respuesta del restablecimiento, no se persiste ni se recupera después. Ante una respuesta perdida, el administrador puede generar otra. Se limita cada cuenta a un restablecimiento por minuto. Las URLs de evidencia ya firmadas conservan su breve caducidad.
- La migración nueva y la actualización de la Edge Function se instalan explícitamente, en ese orden. Los tests PGlite verifican trigger, rollback, RLS y RPC con un esquema Auth mínimo; no sustituyen la validación real de GoTrue, su política de contraseñas y sesiones.

## Administración de plantillas

- CORPORATE_ADMIN dispone de catálogo paginado, creación, duplicado, borradores, publicación y retirada del catálogo mediante RPC autorizadas y auditadas. La organización se deriva de la sesión; no hay escrituras directas desde el navegador.
- Cada plantilla fija su tipo de equipo y periodicidad al crearla. Para cambiar esos atributos se duplica como una plantilla nueva. Las nuevas versiones cambian secciones, preguntas y reglas; las inspecciones abiertas y terminadas conservan su checklist_version_id. Una nueva inspección adopta la última versión publicada.
- Solo hay un borrador por plantilla. Guardar reemplaza su contenido en una transacción y exige la revisión esperada para evitar sobrescribir otro editor. El formulario es local y envía el contenido completo, con límites de 30 secciones y 200 preguntas. Publicar exige un borrador completo guardado; el contenido publicado continúa inmutable.
- Retirar significa ocultar del catálogo para nuevas altas y bloquear su edición/publicación. Los planes existentes siguen usando la última versión publicada, para no suspender revisiones de seguridad; el histórico y los borradores se conservan. Esta entrega no administra la reasignación de planes ni borra plantillas.
- Se instala una migración incremental antes de usar el editor. Los tipos, permisos, pruebas de aislamiento, validación, revisión concurrente y versionado acompañan la funcionalidad; no se despliega automáticamente.

## Paleta visual de la aplicación

- Se aplica la referencia visual facilitada: azul principal #0047AB, azul oscuro #083D82, blanco y amarillo #E9AB19. Cian #008EC4, verde #00AC83, rojo #E40036 y violeta #6B56A2 quedan como acentos secundarios.
- Los colores de estado conservan su significado; los textos usan variantes oscuras para mantener contraste. La paleta se comparte entre navegación, formularios, login e iconos de la PWA mediante variables CSS.
