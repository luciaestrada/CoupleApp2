# Revisión de iOS y notificaciones sin APNs

La aplicación utiliza Expo y React Native, con un módulo iOS de CoreMotion,
mapa nativo y ubicación en segundo plano. La configuración declara los permisos
de ubicación y movimiento. La revisión en Windows cubre código, configuración,
pruebas y exportación JavaScript; no equivale a ejecutar una compilación en un iPhone.

## Servicio implementado

En iOS, `registerForPushNotifications` registra el dispositivo sin token push y
solicita permisos de notificaciones locales cuando el usuario los activa.
El plugin `withLocalIosNotifications` elimina el entitlement `aps-environment`
añadido por Expo y el modo de ejecución `remote-notification`. Se conserva
el modo `location` para el seguimiento consentido. `expo-background-task` añade
`processing` y el identificador permitido `com.expo.modules.backgroundtask.processing`.

El servicio se inicia al tener un perfil autenticado y se detiene al cerrar o
cambiar la sesión. Lee la bandeja `notifications` y las preferencias
`user_settings` mediante Supabase y sus políticas RLS existentes; no requiere
migraciones ni otra función de servidor. Realtime actualiza la bandeja y una
consulta cada 30 segundos recupera eventos si el canal falla, con la app activa.

La tarea `COUPLEAPP_NOTIFICATION_SYNC_V1` se define al cargar el módulo, antes
de montar pantallas, y se registra para la cuenta autenticada con permiso de
notificaciones. Solicita un intervalo mínimo de 15 minutos; iOS decide cuándo
ejecutarla y puede retrasarla considerablemente. No necesita activar la ubicación.
También revalida las solicitudes del mapa con `syncTrackingConfig` sin otorgar
consentimiento ni iniciar seguimiento si falta una configuración autorizada.

Las tareas de ubicación y geofencing consultan los avisos después de procesar
sus eventos reales. Estas consultas se limitan a una por minuto; no modifican
frecuencia, precisión ni pausa del GPS. Los tres ejecutores comparten una cola,
estado persistente por cuenta y deduplicación. Las consultas de datos tienen
cancelación por plazo y la tarea de fondo atiende la expiración del sistema.

Cada aviso se presenta mediante `scheduleNotificationAsync` y al tocarlo utiliza
la validación y navegación existentes. Se oculta el cuerpo salvo consentimiento
de previsualización, se respetan categorías y se omiten avisos leídos, caducados,
controles de seguimiento y mensajes de la conversación ya abierta.
Los identificadores presentados se guardan por cuenta para evitar repeticiones.
La pantalla Chat suprime avisos de esa conversación únicamente en primer plano;
dejar esa pantalla abierta antes de bloquear el móvil no silencia los mensajes.

La primera activación comienza desde ese momento para no mostrar el historial
como avisos nuevos. Las siguientes aperturas recuperan hasta 100 avisos recientes
no leídos desde la activación y de las últimas 24 horas. La bandeja Avisos
continúa siendo la vía para consultar el historial completo.

## Recordatorios programados

Se programan hasta 40 recordatorios próximos a las 09:00, hora de Madrid,
incluidos cambios de horario de verano. Las fechas especiales respetan su
recurrencia y `notify_days_before`, y los planes pendientes con fecha avisan el
mismo día. Ambos dependen de «Fechas especiales y planes» en Ajustes.
Los días y horas que ya han pasado no generan recordatorios retroactivos.

iOS entrega los recordatorios descargados y programados aunque la aplicación
no esté ejecutándose. Las modificaciones, eliminaciones, planes completados,
preferencias y cambios de pareja se reconcilian al sincronizar. Al editar desde
este dispositivo se retiran las programaciones anteriores inmediatamente;
las ediciones desde la pareja requieren una sincronización para llegar al iPhone.
Cerrar o cambiar sesión cancela los recordatorios de la cuenta anterior.
Los títulos del plan o fecha se ocultan salvo permiso de previsualización.
La navegación al tocar el aviso vuelve a validar cuenta, pareja y entidad.
Los avisos de fechas enviados por el servidor no duplican recordatorios locales
ya programados para la misma fecha y antelación.

## Límite de iOS

Sin APNs, el servidor no puede despertar la app suspendida o cerrada para
presentar nuevos mensajes. Cambiar Expo por Firebase u otro proveedor no elimina
esta dependencia. Este servicio obtiene tiempo de ejecución mediante tareas de
fondo y actualizaciones legítimas de ubicación; durante esas ventanas consulta
Supabase y presenta avisos locales. No mantiene una conexión permanente ni
garantiza mensajería instantánea con la app suspendida.

Si el usuario desliza la app para cerrarla, las tareas periódicas se detienen
hasta volver a abrirla. Desactivar la actualización en segundo plano, el ahorro
de energía o la falta de conexión también pueden limitar las oportunidades de
ejecución. Los recordatorios que ya se programaron siguen siendo locales.

Referencias: [Apple User Notifications](https://developer.apple.com/documentation/usernotifications)
y [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/).

## Comprobación en iPhone

1. Generar e instalar una nueva compilación iOS con esta configuración; una
   actualización JavaScript no modifica entitlements de una instalación anterior.
2. Iniciar sesión y entrar en Ajustes → Notificaciones → Comprobar y activar
   notificaciones. Debe indicar que los avisos locales están activados.
3. Pulsar Enviar aviso local de prueba y comprobar banner y sonido según los
   ajustes del iPhone, incluyendo los modos de concentración.
4. Con la app abierta fuera de Chat, enviar un mensaje desde la cuenta de la
   pareja. Comprobar aviso, cuerpo oculto y navegación a Chat al tocarlo.
5. Activar previsualización y verificar que los nuevos avisos muestran el cuerpo.
6. Desactivar mensajes y comprobar que dejan de mostrarse. En Chat no debe
   aparecer otro aviso de la misma conversación.
7. Cambiar de pantalla, desconectar y recuperar red; no deben repetirse avisos.
8. Con la actualización en segundo plano permitida en Ajustes del iPhone,
   suspender la app sin deslizarla para cerrarla y enviar mensajes. Comprobar
   consultas nativas en un dispositivo físico y recuperación al volver.
   En una compilación de desarrollo se puede forzar el worker mediante
   `BackgroundTask.triggerTaskWorkerForTestingAsync()`; que esta prueba pase
   no confirma la frecuencia de ejecución espontánea de iOS.
9. Activar ubicación en segundo plano, salir de Chat, bloquear el móvil y moverse.
   Comprobar que una actualización real sincroniza avisos sin repetirlos.
10. Crear una fecha especial y un plan para un día próximo. Comprobar los
    recordatorios de las 09:00 y la navegación; completar/archivar el plan,
    borrar la fecha o desactivar avisos debe retirar su programación.
11. Denegar permisos y cambiar o cerrar sesión. No deben mostrarse recordatorios
    de la cuenta anterior. Con previsualización desactivada no aparece su título.
12. Deslizar para cerrar la app: no esperar mensajes nuevos; comprobar que los
    recordatorios previamente programados siguen siendo entregados por iOS.

## Validación local

Pruebas de entrega, ejecución en segundo plano, cuentas, concurrencia, permisos,
expiración, reconciliación y calendario de Madrid. Comprobación de tipos,
arquitectura, lint y exportación iOS con Hermes. La introspección de configuración
confirma `processing`, el identificador de BGTaskScheduler y ausencia de APNs.
`expo install --check` también informa de actualizaciones recomendadas de otros
paquetes del proyecto; no se ha realizado una actualización general del SDK.

También queda por comprobar físicamente el mapa, el selector de fotos, sensores,
ubicación con permiso aproximado/permanente y reanudación tras suspensión de iOS.
