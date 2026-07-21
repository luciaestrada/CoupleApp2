# Configuración de Supabase self-hosted

1. Abre Studio en `https://supabase.pruebahomelab.es`.
2. En SQL Editor, ejecuta `migrations/202607140001_initial_schema.sql`.
3. En SQL Editor, ejecuta `cron.sql` para activar el reinicio diario de rachas.
4. Comprueba que Realtime está activo para las tablas creadas.
5. Mantén el bucket `stories` como privado; las imágenes se leen con URLs firmadas.

## Reparar la RPC de creación de pareja

Si la aplicación muestra que `public.create_couple_with_invite(p_start_date)` no aparece en el
schema cache, ejecuta en SQL Editor
`migrations/202607150001_restore_create_couple_rpc.sql`. La migración vuelve a crear la función,
restaura el permiso para usuarios autenticados y solicita a PostgREST que recargue el esquema.

## Edge Function de mantenimiento

La función `functions/maintenance/index.ts` hace tres tareas:

- elimina archivos y filas de historias caducadas;
- envía la cola de notificaciones mediante Expo Push;
- crea recordatorios de fechas especiales de forma idempotente.

En el servidor:

1. Copia `supabase/functions/maintenance` a
   `/opt/supabase/docker/volumes/functions/maintenance`.
2. Genera un secreto con `openssl rand -hex 32` y guárdalo como `CRON_SECRET` en el `.env`.
3. Pasa `CRON_SECRET: ${CRON_SECRET}` al servicio `functions` de `docker-compose.yml`.
4. Si activas seguridad mejorada de Expo Push, pasa también `EXPO_ACCESS_TOKEN`.
5. Recrea Edge Runtime con `sh run.sh recreate functions`.
6. Invoca cada minuto `POST https://supabase.pruebahomelab.es/functions/v1/maintenance`
   enviando la cabecera `x-cron-secret` con el secreto anterior.

Aunque el servidor tenga `FUNCTIONS_VERIFY_JWT=false`, esta función rechaza peticiones que no
incluyan el secreto de cron.

La aplicación solo contiene la URL y la clave publicable. No añadas al repositorio
`SUPABASE_SECRET_KEY`, `SERVICE_ROLE_KEY`, claves JWT ni la contraseña de PostgreSQL.

Para Auth móvil, configura en el servidor:

```env
ENABLE_EMAIL_AUTOCONFIRM=true
ADDITIONAL_REDIRECT_URLS=coupleapp://auth/callback
```

Esta opción evita que Auth intente enviar un correo de confirmación durante el desarrollo. Después
de cambiar el `.env` de Supabase, recrea el servicio `auth` para aplicar los valores:

```sh
cd /opt/supabase/docker
docker compose up -d --force-recreate auth
docker compose exec auth printenv GOTRUE_MAILER_AUTOCONFIRM
docker compose logs --tail=100 auth
```

El segundo comando debe imprimir `true`. Si el alta responde con
`Error sending confirmation email`, el contenedor sigue teniendo la confirmación activada o la
configuración SMTP no es válida.

En producción no uses autoconfirmación. Configura `ENABLE_EMAIL_AUTOCONFIRM=false` y proporciona
valores reales para `SMTP_ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y
`SMTP_SENDER_NAME`; después vuelve a recrear el servicio `auth`.
