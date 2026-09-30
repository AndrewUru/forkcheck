# Preparación de la prueba técnica

## 1. Instalar la base

`npm run setup:trial` genera `artifacts/install-trial.sql` desde las migraciones y el seed. En el proyecto Supabase de prueba, abrir **SQL Editor → New query**, pegar todo el archivo y ejecutar **Run**. La instalación es transaccional y rechaza una base donde ya exista Forkcheck. No requiere Docker.

## 2. Corregir la clave administrativa local

En **Settings → API Keys → Publishable and secret API keys**, copiar una clave `sb_secret_…` en `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`. También se acepta la clave legacy cuyo rol sea `service_role`, nunca la clave `anon`. La clave pública de la web se conserva en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

No pegar secretos en el chat ni subir `.env.local` a Git. La variable administrativa se usa solo para crear usuarios. Fuente: https://supabase.com/docs/guides/getting-started/api-keys

## 3. Crear el acceso de la prueba

Añadir temporalmente estas variables a `.env.local`; elegir una contraseña propia de al menos 12 caracteres:

```dotenv
PROVISION_ORGANIZATION=demo-logistics
PROVISION_EMPLOYEE=admin01
PROVISION_FIRST_NAME=Administrador
PROVISION_LAST_NAME=Prueba
PROVISION_ROLE=CORPORATE_ADMIN
PROVISION_PASSWORD=<contraseña elegida>
```

Ejecutar `npm run provision:user`. Después eliminar `PROVISION_PASSWORD` de `.env.local`; Supabase Auth ya conserva su hash. No repetir el alta si ya existe el usuario.

## 4. Arrancar y comprobar

```powershell
npm run doctor
npm run dev
```

Abrir http://localhost:3000 con organización `demo-logistics`, empleado `admin01` y la contraseña elegida. `doctor` indica tablas inexistentes, claves incorrectas y ausencia de perfiles activos sin revelar secretos.

## Recorrido de presentación

1. Mostrar dashboard y filtrar una sucursal.
2. Abrir Equipos, buscar `CAR-001` y entrar en su ficha.
3. Iniciar inspección; abrir «Marcar resto como correcto», revisar la lista y confirmar.
4. Firmar, aceptar la confirmación y finalizar. Abrir el resultado persistido.
5. Repetir una inspección: marcar el cinturón como incidencia, describir el fallo y añadir una foto PNG/JPEG/WebP de menos de 5 MB.
6. Firmar y finalizar. Verificar incidencia CRITICAL, equipo BLOCKED y evidencias en el histórico.
7. Explicar que una nueva revisión correcta no desbloquea el equipo, y que las versiones históricas no se reescriben.

La presentación usa registros reales en Supabase. Cada envío cambia el estado del equipo y los KPIs; no se borra el historial para reiniciar la presentación. Las pruebas unitarias/SQL no sustituyen este recorrido contra Auth y Storage reales.
