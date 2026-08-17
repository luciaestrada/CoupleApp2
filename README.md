# CoupleApp

Aplicación móvil para parejas construida con Expo, React Native y Supabase. El repositorio usa un
solo backend y un solo modelo de datos: no contiene Firebase ni esquemas alternativos. Las
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
supabase/functions/maintenance limpieza de Storage y entrega de Expo Push
```

Las consultas pasan por RLS. Las escrituras de negocio pasan por funciones SQL que obtienen el
usuario desde `auth.uid()`; el cliente no decide `user_id`, `sender_id` ni `couple_id` en esas
operaciones.

El inventario completo de flujos, estado, limitaciones y verificación vive en
[`docs/FUNCTIONALITY.md`](docs/FUNCTIONALITY.md).

## Puesta en marcha

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env` y configura la URL y la clave publicable de Supabase.
3. Ejecuta completo [`supabase/setup.sql`](supabase/setup.sql) en el SQL Editor.
4. Despliega la función `maintenance` siguiendo [`supabase/README.md`](supabase/README.md).
5. Ejecuta `npm run doctor`, `npm run verify`, `npm test`, `npm run typecheck`, `npm run lint`
   y después `npm run android` o `npm run ios`.

`supabase/setup.sql` es un instalador limpio: conserva las cuentas de `auth.users`, pero elimina y
recrea todos los datos funcionales de CoupleApp. Está pensado para sustituir el backend incoherente
anterior; no debe ejecutarse sobre datos que necesites conservar sin hacer antes una copia.

Si la instancia ya estaba instalada antes de las rachas individuales, ejecuta únicamente
[`20260813000100_personal_love_streaks.sql`](supabase/migrations/20260813000100_personal_love_streaks.sql).
La actualización conserva los datos y usa la racha compartida existente como valor inicial de cada
miembro; no vuelvas a ejecutar `setup.sql` sobre esa instancia.

## Configuración móvil

La distancia se publica con permiso de primer plano mientras la app está activa. El geofencing en
segundo plano sí requiere un development build o una compilación nativa; Expo Go no ejecuta esa
tarea. iOS y Android también pueden exigir que el usuario habilite manualmente la ubicación
permanente desde Ajustes.

Los permisos no se solicitan al arrancar. Se activan desde la función correspondiente o desde el
panel de `Cuenta`, que distingue una denegación recuperable de un permiso bloqueado y, en este
último caso, abre los Ajustes de la aplicación.

Las variables `EXPO_PUBLIC_*` forman parte de la aplicación compilada. Solo deben contener la URL y
una clave `sb_publishable_...`; nunca una clave `sb_secret_...`.
