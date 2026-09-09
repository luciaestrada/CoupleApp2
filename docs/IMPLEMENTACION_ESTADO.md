# Implementación y puesta en marcha

## Correcciones del 9 de septiembre

- Menú **Ajustes** accesible desde la cabecera y desde Cuenta. Agrupa edición de perfil, permisos, preferencias push, segundo plano e historial. El mapa conserva las acciones de compartir y pausar.
- **Lugares** permite elegir un punto en el mapa, usar la posición actual o introducir coordenadas, configurar un radio de 50 a 1000 metros, guardar y eliminar. Los lugares guardados también aparecen en el mapa principal.
- Guardar un lugar no exige acceso permanente. Los avisos de llegada se activan explícitamente con ese permiso; la sincronización se reintenta al regresar desde los ajustes del teléfono.
- Sin permiso permanente no se llama a `hasStartedGeofencingAsync`, que falla en Android incluso cuando solo se consulta su estado. Las pruebas cubren permiso denegado, concesión, revocación y registros repetidos.
- Los fallos de registro push se muestran en Ajustes, con un botón para comprobar/reintentar y sin el texto técnico de Firebase sobre la pantalla inicial. Los errores de configuración tienen una espera de cinco minutos entre reintentos automáticos.
- Se corrigió el bloque JSX fuera de `MapScreen` y se añadió una prueba de sintaxis para todas las pantallas.

**Configuración Android actualizada:** `android/app/google-services.json` ya está presente y corresponde a `com.esc.coupleapp`. El identificador Android, el namespace y las clases nativas se han actualizado para coincidir. El archivo sigue excluido de Git. La credencial de envío FCM v1 se administra en EAS; la entrega real debe verificarse tras instalar el nuevo APK. Una recarga de JavaScript no actualiza la configuración nativa. Consultar [configuración oficial de FCM con Expo](https://docs.expo.dev/push-notifications/fcm-credentials/). Maps Android sigue requiriendo `GOOGLE_MAPS_ANDROID_API_KEY`.

Actualización: 8 de septiembre de 2026. Los cambios están implementados en el repositorio. La base de datos de producción, las credenciales push y los dispositivos reales no se han modificado ni probado desde esta sesión.

## Funciones incorporadas

- Mapa con posiciones de ambos miembros, círculo de precisión, velocidad disponible, distancia y fecha de captura. Si el dato envejece, se muestra como última ubicación conocida.
- Modo cotidiano de precisión equilibrada, sesión en vivo de 15 minutos, pausa persistente y activación independiente del segundo plano. La pausa cancela tareas y conserva una marca local incluso si no hay conexión.
- Una sola tarea de publicación por dispositivo; filtros de precisión/desplazamiento, exclusión de envíos simultáneos, cola SQLite con la muestra más reciente y reintentos progresivos. El modo de ahorro/batería baja reduce la precisión al reconfigurar el seguimiento.
- Solicitudes de sesión en vivo entre miembros, aceptación/rechazo y vencimiento. Abrir el mapa del otro usuario no activa su GPS automáticamente.
- Historial opcional, muestreo de 15 minutos, retención de 30 días y visualización de las últimas 24 horas. No representa un recorrido preciso.
- Cola persistente de llegadas, deduplicación, fecha original y descarte de eventos de más de 30 minutos. Los geofences se registran solo si cambia su configuración.
- Avisos de chat, amor, llegadas, fechas, historias, estados y solicitudes de ubicación. Preferencias por categorías, vista previa opcional, bandeja y apertura autorizada de la pantalla correspondiente.
- Instalaciones independientes para push, rotación de tokens, secreto de instalación y cierre de sesión que revoca solo ese dispositivo. Los tokens no son consultables por clientes.
- Worker de push separado, reservas con identificador, reintentos, caducidad, tickets y receipts. Un receipt correcto indica aceptación por APNs/FCM; no demuestra que una persona haya visto el aviso.
- Perfil editable, avatar comprimido y privado, recuperación/cambio de contraseña, desvinculación y solicitud de eliminación definitiva de cuenta. El mantenimiento elimina archivos antes de completar la eliminación en Auth.
- Chat paginado con envíos idempotentes y mensajes pendientes recuperables. Fotos comprimidas y URLs firmadas en lote/caché. Realtime se desconecta en segundo plano y comparte observadores equivalentes.
- Cinco entradas principales de navegación: Inicio, Mapa, Recuerdos, Chat y Cuenta. Recuerdos da acceso a historias, estados, fechas, lugares y avisos.
- Contratos SQL generados desde un instalador ejecutable, comprobación Deno de Edge Functions y CI para pruebas, lint, tipos y bundles.

## Activar en una instalación existente

1. Realizar copia de seguridad y comprobar que están aplicadas las actualizaciones anteriores de rachas e historial.
2. Aplicar **solo** `supabase/migrations/20260908000100_live_location_notifications.sql`, una vez. Esta migración conserva cuentas, miembros y mensajes. La ubicación comienza pausada y el historial queda desactivado hasta que cada usuario lo habilite. Los avisos anteriores permanecen en la bandeja, pero no se vuelven a enviar.
3. Desplegar `supabase/functions/push` y la nueva versión de `supabase/functions/maintenance`. Las dos usan `@supabase/server` y requieren clave secreta de servidor; `supabase/config.toml` desactiva únicamente la comprobación JWT de plataforma.
4. Configurar los workers y credenciales que se detallan a continuación.
5. Crear e instalar nuevos binarios Android/iOS. Una actualización de JavaScript por sí sola no incorpora las nuevas dependencias ni los permisos nativos.

Para una instalación vacía, `supabase/setup.sql` ya contiene el resultado actualizado. **No usarlo para actualizar una instancia con datos**: es destructivo. No aplicar las migraciones históricas encima de este instalador actualizado.

El cliente anterior no puede seguir usando `publish_location` tras la migración: se revoca esa RPC para evitar eludir la nueva compartición explícita. Coordinar la actualización de los dos teléfonos.

## Workers y notificaciones

Despliegue con Supabase CLI:

```sh
supabase functions deploy push --no-verify-jwt
supabase functions deploy maintenance --no-verify-jwt
```

En un Supabase propio, instalar ambas carpetas y `_shared`, con el runtime compatible y las claves nuevas configuradas. Conservar `supabase/functions/deno.lock`; la dependencia del servidor está fijada a `@supabase/server@1.5.3`.

La migración programa `push` cada minuto, mantenimiento cada cinco minutos y limpieza de avisos antiguos. Para que esas llamadas salgan desde PostgreSQL:

- Habilitar `pg_net` y Vault en la instancia.
- Crear en Vault `coupleapp_functions_url`, cuyo valor termina en `/functions/v1`.
- Crear en Vault `coupleapp_scheduler_key`, con la clave secreta **default** que acepta `auth: 'secret'`. No introducirla en variables `EXPO_PUBLIC_*`, el repositorio o el móvil.
- La inserción de un aviso solicita también un envío inmediato; el cron recupera despertares fallidos y consulta receipts.

Si no se dispone de `pg_net`/Vault, un scheduler privado debe invocar `POST /functions/v1/push` cada minuto y `POST /functions/v1/maintenance` cada cinco minutos, autenticando con el encabezado `apikey`. Sin la llamada inmediata, habrá hasta un intervalo adicional de espera. Las funciones SQL de invocación devuelven `null` cuando falta configuración; comprobarlo al desplegar, no interpretar la existencia del cron como entrega activa.

En Expo/EAS configurar APNs para iOS y credenciales FCM v1 para Android. Si se habilita la protección adicional de Expo Push, establecer `EXPO_ACCESS_TOKEN` como secreto del worker.

El estado de cada entrega se consulta en `notification_deliveries`; la tabla `notifications` representa la bandeja y sus preferencias de entrega al crear el evento. Su antiguo campo `status` ya no es la fuente de verdad del envío a cada dispositivo.

## Configuración móvil

| Configuración | Uso |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Entorno público del cliente, como antes. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Clave de Maps SDK for Android, restringida al paquete y a los certificados de firma. Se incorpora al manifiesto Gradle y a la configuración Expo. |
| `GOOGLE_SERVICES_JSON` | Ruta al archivo cliente FCM; puede ser una variable de tipo archivo en EAS. Gradle lo copia a `android/app/google-services.json`, que está ignorado por Git. |
| APNs y firma iOS | Configuración de credenciales del proyecto en EAS/Apple. |
| Firma Android de producción | EAS o configuración Gradle externa. El release local ya no usa automáticamente el keystore debug. |

Sin clave de Maps, el APK compila pero el mapa Android no tiene una configuración válida. Sin archivo FCM/credenciales push, la app puede registrar la instalación para ubicación, pero mostrará que los avisos necesitan configuración.

Android permanece versionado en el repositorio. Los permisos y el servicio de ubicación están comprobados en el manifiesto fusionado. `app.config.js` también expresa la configuración para futuras generaciones nativas. Revisar el diff si se ejecuta prebuild; no regenerar el árbol nativo sin revisar cambios.

En Supabase Auth, permitir `coupleapp://auth/recovery` y `coupleapp://auth/callback` en las URL de redirección. Configurar SMTP y confirmar correos. La recuperación admite enlaces con tokens y con código de intercambio.

Android utiliza `com.esc.coupleapp`. iOS conserva `com.tuempresa.coupleapp` y debe confirmarse antes de distribuir. Configurar la firma real y ensayar la instalación en los dos sistemas. El APK debug sirve para desarrollo, requiere Metro y se instala como una app distinta del antiguo paquete Android.

## Verificación

Comandos disponibles:

```sh
npm test
npm run verify
npm run types:check
npm run typecheck
npm run lint
npm run backend:typecheck
npm run bundle:android
npm run bundle:ios
```

`npm run types:generate` regenera los tipos de tablas y RPC a partir del SQL ejecutado en PostgreSQL embebido. Tras editar la migración, ejecutar primero `node scripts/sync-backend.mjs` para actualizar la sección generada del instalador.

Las pruebas SQL usan PGlite con sustitutos de los servicios de plataforma Auth, Storage y cron. Ejecutan SQL real, RLS, RPC, instalación repetida y migración con datos existentes. No sustituyen una prueba contra Realtime, Vault, pg_net, Storage ni Auth desplegados.

Se han comprobado los bundles Hermes para Android/iOS y una compilación nativa Android debug arm64. No hay un teléfono conectado y este entorno Windows no compila un binario iOS con Xcode. Queda por validar en dispositivos reales: entrega push, enlaces de correo, permisos, cierre forzado, ahorro del sistema, precisión y consumo energético. No se ha medido ni se promete un porcentaje de ahorro o una latencia constante.

## Límites que deben conservarse en producto

- El sistema operativo puede retrasar o detener la ubicación, especialmente tras cierre forzado; iOS puede suspender timers JS. La caducidad también se valida en servidor y al recibir eventos nativos.
- La sesión en vivo finaliza localmente mediante timer o siguiente evento nativo, según ejecución permitida por el sistema. No existe una garantía de parada nativa al milisegundo con la app suspendida.
- La eliminación de cuenta es un proceso de servidor: requiere el mantenimiento activo. La solicitud cierra la relación e impide volver a crearla mientras se completa el borrado.
- Las URLs firmadas de fotos ya emitidas pueden seguir siendo válidas durante su corta vigencia; revocar la pareja no invalida instantáneamente una URL previamente emitida.
- La bandeja muestra los 100 avisos más recientes; historias, las 50 fotos activas más recientes. El chat sí permite cargar páginas anteriores.
- Widgets, confirmaciones de lectura del chat y batería remota permanecen fuera de esta entrega, como ampliaciones opcionales del plan.

El protocolo de ensayo energético y los objetivos de latencia a contrastar siguen descritos en `PLAN_COMPLETAR_APP.md`.
