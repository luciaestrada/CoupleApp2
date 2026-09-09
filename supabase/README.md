# Backend Supabase

**Actualización de septiembre de 2026:** la entrega push vive ahora en `functions/push`; `maintenance` limpia archivos y procesa eliminaciones de cuenta. La migración `20260908000100_live_location_notifications.sql` y las instrucciones vigentes están en [IMPLEMENTACION_ESTADO.md](../docs/IMPLEMENTACION_ESTADO.md). El resto de este documento describe la instalación base anterior.

## Instalación de la base de datos

Ejecuta [`setup.sql`](setup.sql) completo en el SQL Editor. El archivo configura en una sola
transacción el modelo relacional, funciones de negocio, triggers, permisos, RLS, Storage privado,
Realtime y tareas `pg_cron`. Al confirmar, también ordena a PostgREST recargar su esquema.

El instalador conserva `auth.users`, reconstruye sus perfiles y elimina el resto de los datos de
CoupleApp. Para una instancia que ya contiene datos, no se vuelve a ejecutar: las actualizaciones
no destructivas versionadas están en `migrations/` y se aplican una sola vez por orden de nombre.

La actualización `20260813000100_personal_love_streaks.sql` convierte la racha compartida en dos
rachas personales y copia el valor existente a ambos miembros antes de retirar las columnas antiguas.

Si `create extension pg_cron` falla, la instancia no tiene el módulo cargado en PostgreSQL. Debes
habilitar `pg_cron` en la infraestructura de la instancia antes de volver a ejecutar el instalador;
no se resuelve con una migración alternativa.

## Edge Function de mantenimiento

`functions/maintenance/index.ts` elimina historias caducadas (archivo y fila) y entrega la cola de
notificaciones mediante Expo Push. Usa `@supabase/server` y solo acepta una clave secreta de
Supabase; no usa `service_role`, `anon` ni un segundo secreto propio.

Cada ejecución reserva su lote de notificaciones de forma atómica. Esto evita envíos duplicados
si dos schedulers se solapan; una reserva interrumpida se libera automáticamente tras diez minutos.

Con Supabase CLI:

```sh
deno check functions/maintenance/index.ts
supabase functions deploy maintenance --no-verify-jwt
```

En una instalación self-hosted, copia la carpeta `functions/maintenance` al volumen de Edge
Functions y recrea ese servicio. La comprobación JWT de plataforma debe quedar desactivada para
esta función porque la autenticación con clave secreta se valida dentro de `@supabase/server`; el
repositorio incluye la misma declaración en `config.toml`.

Invócala de forma periódica con una petición `POST` y la clave secreta en `apikey`:

```sh
curl -X POST 'https://TU_SUPABASE/functions/v1/maintenance' \
  -H 'apikey: sb_secret_TU_CLAVE'
```

Programa esa llamada cada minuto o cada pocos minutos desde un scheduler privado. Si activas la
seguridad mejorada de Expo Push, configura `EXPO_ACCESS_TOKEN` como secreto de la función.

## Auth

El SQL crea perfiles para cuentas actuales y futuras, pero la entrega de correos y SMTP pertenecen
al servicio Auth y no a PostgreSQL. Para producción, configura un SMTP real y mantén la confirmación
de correo habilitada. La aplicación admite ese flujo: tras el registro informa al usuario cuando
debe confirmar su correo.

## Seguridad

- La aplicación móvil solo usa `EXPO_PUBLIC_SUPABASE_URL` y una clave `sb_publishable_...`.
- La clave `sb_secret_...` solo vive en el servidor o scheduler privado.
- Los tokens Expo Push viven en una tabla sin acceso para el cliente y se reasignan al último
  usuario que registra el dispositivo.
- El bucket `stories` es privado y las lecturas usan URLs firmadas.
- Las identidades de las escrituras se derivan de `auth.uid()` en funciones SQL `security definer`
  con un `search_path` explícito.
