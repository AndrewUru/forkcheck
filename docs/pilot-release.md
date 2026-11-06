# Primera entrega para el piloto — noviembre de 2026

## Funciones entregadas

- Cierre de incidencias con descripción de reparación/verificación, autor y fecha. Mantenimiento y administración de empresa pueden cerrar dentro de su alcance. La vista Resueltas y la ficha del equipo conservan el resultado.
- Puesta en servicio como acción independiente para administración de empresa. Exige confirmación y motivo. No recupera retirados ni admite incidencias, órdenes de mantenimiento o inspecciones pendientes. No cambia la programación de revisiones. El cierre por sí solo nunca desbloquea.
- CSV de revisiones completas desde la ficha, para perfiles con acceso al dashboard. Filtra fechas en la zona de la empresa; incluye fecha UTC, resultado, identificadores de revisión y versión, fecha prevista y código interno de máquina. Límite de 1.000 filas: rechaza la descarga si faltan filas o se supera el límite. No exporta fotos ni firmas.
- Diagnóstico del alta: diferencia duplicado, contraseña, permisos, sesión, servicio y configuración. Una respuesta vacía no se presenta como alta confirmada.
- Corrección de la prueba de versionado: selecciona dos planes activos de equipos operativos con una misma plantilla.

## Instalación sobre una base existente

1. Comprobar que están aplicadas todas las migraciones anteriores, incluidas `202610110001_business_roles.sql` y `202610110002_shared_fleet.sql`.
2. Aplicar exclusivamente la nueva migración `supabase/migrations/202611060001_incident_resolution.sql`. No ejecutar reset ni resembrar una base con datos reales.
3. Actualizar la función con `npx supabase functions deploy manage-users` en el proyecto correcto. Mantener la verificación JWT y las claves administrativas solo en Edge Functions.
4. Publicar la aplicación de la rama `main` después de la migración. Crear main no cambia por sí mismo la rama de producción de Vercel ni la rama predeterminada de GitHub, que era master.
5. Comprobar con sesiones reales de dos empresas: alta de operario, rechazo de duplicados, inspección y evidencia, cierre de incidencia, rechazo de desbloqueo con pendientes, autorización final y CSV. Revisar el alcance del rol MANTENIMIENTO si se utiliza; no se han ampliado permisos de jefes ni EHS.

Las órdenes de mantenimiento previas que sigan abiertas impiden el cierre relacionado y la puesta en servicio. Esta entrega no incorpora un gestor de órdenes: deben revisarse mediante el procedimiento administrativo existente. Nunca cerrarlas solo para sortear el bloqueo.

## Verificación y límites

Las pruebas PGlite ejecutan migraciones y RLS sobre PostgreSQL local. Las pruebas de acciones y del endpoint cubren autorización, validación, filtros, truncamiento y neutralización de fórmulas CSV. No sustituyen GoTrue, PostgREST, Storage ni la prueba de cámara y subida desde un teléfono.

La publicación del código no aplica por sí misma SQL ni instala funciones de Supabase. El diagnóstico mejora la información del alta; no confirma la causa ni la resolución del fallo del entorno alojado sin ejecutar allí el flujo.

### Resultado de la revisión local

- 203 pruebas unitarias y de base de datos aprobadas.
- Compilación de producción, TypeScript, lint y comprobación Deno de `manage-users` correctos.
- Las dos comprobaciones HTTP de manifiesto/iconos pasaron. Las ocho pruebas de navegador no pudieron ejecutarse: la descarga de Chromium falló y el Chromium del sistema no pudo abrir sockets en este entorno. No se presentan como pruebas funcionales superadas.
- Sin credenciales de Supabase alojado: pendiente comprobar el recorrido real de autenticación, subida de evidencias y nuevas operaciones.

## Próximo alcance comercial

Quedan pendientes alta autónoma de empresas, suscripciones, cobro y configuración inicial guiada. Antes de activar cobros, validar uso diario y soporte con empresas piloto.
