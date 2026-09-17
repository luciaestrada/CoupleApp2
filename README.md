# CoupleApp

La implementación actual de mapa, ubicación adaptativa, notificaciones y cuenta está descrita en
[`docs/IMPLEMENTACION_ESTADO.md`](docs/IMPLEMENTACION_ESTADO.md), junto con la migración y la configuración necesaria para activarla.

Aplicación móvil para parejas construida con Expo, React Native y Supabase. El repositorio usa un
solo backend de datos, Supabase; FCM se utiliza únicamente para las notificaciones Android. Las
actualizaciones no destructivas para instalaciones existentes viven en `supabase/migrations`.

## Arquitectura

```text
App.js                         composición de providers y efectos de arranque
src/config/                    validación estricta del entorno
src/context/                   sesión y estado de la pareja
src/contexts/AppContext.js     fachada de estado para las pantallas
src/services/                  acceso a datos, comandos RPC y suscripciones Realtime
src/screens/                   presentación e interacción
src/supabase/client.js         único cliente Supabase
supabase/setup.sql             instalador canónico de base de datos
src/features/location/         políticas, tarea nativa y cola de ubicación
supabase/functions/push        entrega por dispositivo y receipts Expo
supabase/functions/maintenance limpieza de Storage y eliminación de cuentas
```

Las consultas pasan por RLS. Las escrituras de negocio pasan por funciones SQL que obtienen el
usuario desde `auth.uid()`; el cliente no decide `user_id`, `sender_id` ni `couple_id` en esas
operaciones.

El inventario anterior se conserva en [`docs/FUNCTIONALITY.md`](docs/FUNCTIONALITY.md).
Consulta el documento de implementación para el comportamiento y las comprobaciones actuales.

## Puesta en marcha

1. Instala dependencias con `npm ci`.
2. El `.env` incluido contiene la URL y la clave pública del backend actual. Para usar otra instancia, actualiza esas variables; `.env.example` sirve de referencia. No añadas secretos privados a este archivo versionado.
3. Para una instancia vacía, ejecuta [`supabase/setup.sql`](supabase/setup.sql). Si ya hay datos, aplica las migraciones pendientes siguiendo [`docs/IMPLEMENTACION_ESTADO.md`](docs/IMPLEMENTACION_ESTADO.md).
4. Despliega `push` y `maintenance`, configura el scheduler y las credenciales móviles siguiendo ese mismo documento.
5. Ejecuta `npm run doctor`, `npm run verify`, `npm test`, `npm run typecheck`, `npm run lint`
   y después `npm run android` o `npm run ios`.

`supabase/setup.sql` es un instalador limpio: conserva las cuentas de `auth.users`, pero elimina y
recrea todos los datos funcionales de CoupleApp. Está pensado para sustituir el backend incoherente
anterior; no debe ejecutarse sobre datos que necesites conservar sin hacer antes una copia.

Si la instancia ya estaba instalada antes de las rachas individuales, aplica primero
[`20260813000100_personal_love_streaks.sql`](supabase/migrations/20260813000100_personal_love_streaks.sql).
La actualización conserva los datos y usa la racha compartida existente como valor inicial de cada
miembro. Después aplica las migraciones pendientes de historial y ubicación/notificaciones; no vuelvas a ejecutar `setup.sql` sobre esa instancia.

## Configuración móvil

La ubicación se activa desde Mapa, con un modo cotidiano de bajo consumo y sesiones en vivo de 15 minutos. El segundo plano se habilita por separado y requiere permisos permanentes y un build nativo. Las posiciones muestran su fecha de captura y precisión; el sistema operativo puede retrasar o detener el seguimiento.

En Android configura `GOOGLE_MAPS_ANDROID_API_KEY` y el archivo FCM mediante `GOOGLE_SERVICES_JSON`. Las credenciales push de Google/Apple y los workers deben estar activos para recibir avisos.

Los permisos no se solicitan al arrancar. Se activan desde la función correspondiente o desde el
panel de `Cuenta`, que distingue una denegación recuperable de un permiso bloqueado y, en este
último caso, abre los Ajustes de la aplicación.

Las variables `EXPO_PUBLIC_*` forman parte de la aplicación compilada. Solo deben contener la URL y
una clave `sb_publishable_...`; nunca una clave `sb_secret_...`.
