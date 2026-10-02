# Comprobación de ubicación Android — 28/09/2026

## Versión probada

- Xiaomi 24115RA8EG, Android 16, aplicación `com.esc.coupleapp`.
- APK release compilada con `npm run android:release:apk` e instalada mediante
  actualización (`adb install -r`), conservando la sesión y los datos.
- SHA-256: `2C8E2CA47CB742EF15FA6818037E7BA59869906C7CA6C0FA879D7212024581A2`.
- Ubicación precisa, ubicación permanente y notificaciones concedidas.
- La app ya estaba en la lista de excepciones de ahorro estándar de Android.

## Correcciones incluidas

- Conserva el servicio de ubicación de Android al cambiar las opciones de
  seguimiento; evita detenerlo antes de actualizar la tarea de Expo.
- Arranca el servicio mientras la app está visible también en modo en vivo,
  cuando está autorizado el seguimiento en segundo plano.
- Elimina los filtros nativos de distancia y diferimiento en Android para que
  un teléfono quieto pueda entregar posiciones. La política de publicación
  sigue filtrando ruido y limitando los envíos.
- No solicita detener el servicio al retirar la app de recientes. La pausa
  explícita, la revocación de permisos y el modo desactivado sí lo detienen.

## Evidencia en el dispositivo

- Instalación confirmada por Android a las 13:43:26 (Europe/Berlin).
- Servicio `expo.modules.location.services.LocationTaskService` iniciado a las
  13:44:09 aproximadamente, con `isForeground=true` y tipo location.
- Pantalla apagada a las 13:44:29; Android informa `mWakefulness=Dozing`.
- Google Play Services mantiene una solicitud `@2m BALANCED_POWER_ACCURACY`
  para esta app, sin distancia mínima.
- A las 13:50:51, tras 6 minutos y 22 segundos con la pantalla apagada, el mismo
  servicio sigue activo, sin reiniciarse. JobScheduler registra tres tareas de
  Expo completadas aproximadamente a las 13:46:08, 13:48:08 y 13:50:08.
- Sin errores en los registros consultados de AndroidRuntime, ReactNativeJS y
  LocationTaskConsumer durante esta comprobación.

## Alcance

Esta prueba comprueba la continuidad del servicio y la ejecución de tareas en
segundo plano. No verifica directamente cada publicación en Supabase ni su
recepción por el otro teléfono. El dispositivo está conectado y cargando por
USB: pantalla apagada no equivale a probar reposo profundo durante horas sin
cargador. Quedan por comprobar ese escenario, el cierre desde recientes y los
cambios de modo en el dispositivo real. Las regresiones de cambios de modo,
posición estacionaria, pausa y permisos están cubiertas por pruebas automáticas.

Validación automática previa: 45 pruebas correctas, TypeScript y ESLint correctos.

## Segunda comprobación sin abrir la app (14:29–14:30)

Ante una sospecha de corte, se consultaron exclusivamente los registros y el
estado del dispositivo: no se abrió la actividad, no se reinstaló la APK ni se
reinició el seguimiento.

- Mismo proceso (25807) y mismo servicio (`62fbe69`), activo desde las 13:44:09.
- Google Play Services registra entregas a esta app a las 14:20:15, 14:22:15,
  14:24:15, 14:26:15, 14:28:15 y 14:30:15.
- Expo registra la finalización de `COUPLEAPP_LOCATION_V2` a las 14:30:16.
- La última posición fina del proveedor tiene fecha 14:30:15 y precisión de
  100 m; no se guardan coordenadas en este informe.
- No se observa una interrupción de la adquisición nativa. Estos registros
  siguen sin demostrar la publicación en Supabase o la recepción en la pareja.
- El teléfono está despierto y cargando en esta segunda comprobación.
