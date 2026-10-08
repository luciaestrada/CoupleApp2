# CoupleApp

La implementación actual de mapa, ubicación adaptativa, notificaciones y cuenta está descrita en
[`docs/IMPLEMENTACION_ESTADO.md`](docs/IMPLEMENTACION_ESTADO.md), junto con la migración y la configuración necesaria para activarla.

Aplicación móvil para parejas construida con Expo, React Native y Supabase. El repositorio usa un
solo backend de datos, Supabase; FCM se utiliza únicamente para las notificaciones Android. Las
actualizaciones no destructivas para instalaciones existentes viven en `supabase/migrations`.

## Arquitectura

```text
App.tsx                        composición de providers y efectos de arranque
src/config/                    validación estricta del entorno
src/context/                   sesión y estado de la pareja
src/contexts/AppContext.ts     fachada de estado para las pantallas
src/services/                  acceso a datos, comandos RPC y suscripciones Realtime
src/screens/                   presentación e interacción
src/supabase/client.ts         único cliente Supabase
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

`npm run backend:audit` comprueba Auth, REST y el arranque de los workers del servidor configurado
en `.env`, sin modificar datos ni invocar trabajos mediante POST. Un 401 en un worker protegido
es esperado con la clave pública; un 500 indica un fallo de arranque o infraestructura. El acceso
REST anónimo no verifica las migraciones ni los permisos de una sesión autenticada.

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

Para reparar los workers de una instalación Linux con Docker Compose, consulta
[Reparación del servidor](docs/SERVER_REPAIR.md). Genera el paquete con
`powershell -ExecutionPolicy Bypass -File scripts/package-server.ps1`.

Para generar APK y AAB firmados, consulta [Android release](docs/ANDROID_RELEASE.md).
Comandos locales: `npm run android:release:apk` y `npm run android:release:aab`.

La ubicación se activa desde Mapa, con un modo cotidiano de bajo consumo y sesiones en vivo de 15 minutos. El segundo plano se habilita por separado y requiere permisos permanentes y un build nativo. Las posiciones muestran su fecha de captura y precisión; el sistema operativo puede retrasar o detener el seguimiento.

En Android configura `GOOGLE_MAPS_ANDROID_API_KEY` y el archivo FCM mediante `GOOGLE_SERVICES_JSON`. Las credenciales push de Google y el worker deben estar activos para recibir avisos remotos en Android.

En iOS se utilizan avisos locales sin APNs, sincronizados con Supabase en primer plano, mediante tareas periódicas de fondo y durante actualizaciones reales de ubicación. iOS controla las oportunidades de ejecución: los mensajes pueden retrasarse y las tareas se detienen si cierras la app deslizando. Las fechas especiales y los planes se programan como recordatorios locales a las 09:00, hora de Madrid. Consulta la [revisión y comprobación en iPhone](docs/IOS_NOTIFICATIONS.md). En Ajustes → Notificaciones puedes activar permisos, probar un aviso con la pantalla bloqueada y diagnosticar el registro y las últimas ejecuciones de fondo. La dependencia, configuración y diagnóstico nativo requieren una nueva compilación iOS.

Los permisos no se solicitan al arrancar. Se activan desde la función correspondiente o desde el
panel de `Cuenta`, que distingue una denegación recuperable de un permiso bloqueado y, en este
último caso, abre los Ajustes de la aplicación.

Las variables `EXPO_PUBLIC_*` forman parte de la aplicación compilada. Solo deben contener la URL y
una clave `sb_publishable_...`; nunca una clave `sb_secret_...`.
