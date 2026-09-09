# Plan para completar CoupleApp

Revisión del 8 de septiembre de 2026. Alcance: código y configuración locales, sin consultar ni modificar la instancia desplegada. Este documento propone implementaciones; no significa que estén realizadas.

## Diagnóstico

La base Expo/React Native + Supabase es aprovechable. Hay separación entre pantallas y servicios, un cliente Supabase único, permisos centralizados, RLS, RPC con identidad derivada del usuario autenticado, Storage privado y migraciones incrementales. Mantendría esta arquitectura y completaría los flujos antes de plantear una reescritura.

| Prioridad | Hallazgo comprobado | Consecuencia y cambio |
| --- | --- | --- |
| P0 | `src/services/locationService.js:9` publica cada cinco minutos; `HomeScreen.js:51` controla el arranque. | No permite seguimiento fluido. Extraer el ciclo de vida a un coordinador independiente de las pantallas. |
| P0 | `src/services/locationTask.js:11` solo registra entradas en geofences. | No existe publicación continua de coordenadas en segundo plano. Incorporar una tarea de ubicación distinta. |
| P0 | No hay `MapView` en `src`; `react-native-maps` está instalado y existe `location_history` en SQL. | Falta la pantalla del mapa, sus componentes y la consulta del historial. `Lugares` solo guarda la ubicación actual. |
| P0 | `app.json:28` desactiva el servicio foreground de ubicación Android; `scripts/verify-architecture.mjs:243` exige ese valor. | El nuevo seguimiento necesita revisar configuración nativa y la regla del verificador en el mismo cambio. |
| P0 | `locations` almacena latitud, longitud y hora del servidor. | Falta hora de captura y precisión: una muestra enviada con retraso podría aparentar ser reciente. |
| P0 | Las notificaciones SQL se generan para llegadas y fechas; no hay generación para mensajes ni amor. | Completar eventos, preferencias y navegación al pulsar cada aviso. |
| P0 | `maintenance/index.ts:144` marca `sent` cuando Expo acepta el ticket; no guarda su ID ni consulta receipts. | No detecta fallos posteriores de APNs/FCM ni elimina tokens inválidos. |
| P1 | `push_tokens.user_id` es clave primaria y el worker usa un token por usuario. | Dos dispositivos se sobrescriben; cerrar sesión o denegar permisos puede retirar el token del otro dispositivo. |
| P1 | `watchQuery` vuelve a consultar por cada evento; el chat recarga hasta 200 mensajes y las historias vuelven a firmar sus URLs. | Reducir consultas, procesar cambios incrementales y compartir observadores. |
| P1 | Los efectos de pantallas no están ligados al foco ni hay pausa global de Realtime al pasar a segundo plano. | Al visitar pestañas pueden acumularse observadores; desmontar una vista nativa no equivale a detener sus efectos. |
| P1 | El heartbeat no se detiene explícitamente al pasar a background; puede solapar publicaciones y, si falla la primera, no inicia el intervalo. | Estados explícitos, exclusión de operaciones simultáneas, cancelación y recuperación con espera progresiva. |
| P1 | Falta cola local para ubicación y geofences. | Con mala cobertura se pierden eventos; añadir persistencia acotada, idempotencia y recuperación. |
| P1 | No aparecen recuperación de contraseña, edición de avatar, desvinculación ni eliminación de cuenta. | Completar el ciclo de vida de cuenta y pareja antes de considerar terminada la app. |
| P1 | Android está versionado; `android/app/build.gradle:115` usa la firma debug para release local. | Verificar estrategia de generación nativa y firma real del artefacto de distribución; no asumir que cambiar app.json actualiza Android automáticamente. |
| P1 | Hay ocho pruebas de utilidades. TypeScript no activa `checkJs` y excluye Edge Functions. | Las comprobaciones actuales no validan seguimiento, push, RPC ni comportamiento nativo. |

## Comportamiento objetivo de ubicación y batería

Propuesta inicial: compartir de forma consentida la última ubicación disponible, precisión, hora de captura, estado de actualización y distancia. Nombre/avatar y estado de la pareja completan la ficha. Batería y carga del otro dispositivo serían opcionales, con fecha propia; no están implementadas. Velocidad y rumbo solo se muestran cuando la muestra los proporciona con calidad suficiente.

No se debe presentar una ubicación antigua como «en directo» ni equiparar una conexión Realtime con una persona localizable. Sin datos nuevos mostrar «Última ubicación hace…»; si el motivo remoto se desconoce, no afirmar que la persona ha apagado el GPS o está desconectada.

| Modo propuesto | Captura y envío iniciales para experimentar | Condiciones |
| --- | --- | --- |
| Compartir desactivado | Sin capturas ni envíos de seguimiento. | Pausa visible, revocable; política explícita sobre conservar u ocultar el último punto. Geofences con interruptor independiente. |
| Cotidiano, app activa | Precisión equilibrada y filtros de movimiento; agrupar envíos. Punto de partida: 30–60 s y desplazamientos de 25–50 m. | Son parámetros de ajuste, no intervalos garantizados. Si no se mueve, reducir actividad. |
| Cotidiano, segundo plano | Actualizaciones nativas de baja frecuencia, distancia mayor, pausas y lotes donde estén disponibles. | Geofencing para llegadas. En reposo priorizar suspensión; no programar despertares GPS constantes. |
| Sesión en vivo | Punto de partida: muestras cada 5–10 s cuando el sistema las proporcione y el dispositivo se mueva. | Activación voluntaria, duración limitada, por ejemplo 15 min; botón de parar y expiración persistida. Mayor gasto esperado. |
| Ahorro o batería baja | Degradar precisión/frecuencia, suspender historial y terminar o rebajar sesiones intensivas según preferencia. | Leer eventos de batería/ahorro, evitando sondeos de alta frecuencia. |

Android restringe la ubicación ordinaria en background, que puede recibirse solo unas pocas veces por hora. El seguimiento frecuente requiere evaluar un foreground service de ubicación visible e iniciado desde un flujo permitido. No se debe prometer una actualización cada pocos segundos en modo cotidiano. [Android: ubicación y batería](https://developer.android.com/develop/sensors-and-location/location/battery).

En iOS hay que reducir precisión y duración, permitir pausas y adaptar filtros de distancia. Algunas mejoras de Core Location pueden requerir un módulo nativo si la versión de Expo instalada no las expone. Primero medir Expo Location, después justificar cualquier extensión. [Apple: uso eficiente de ubicación](https://developer.apple.com/documentation/xcode/accessing-the-device-s-location-efficiently).

Expo documenta límites al terminar la aplicación y diferencias entre plataformas, incluido el reinicio por geofences en iOS. Una tarea JS periódica no garantiza seguimiento con la app suspendida o forzada a cerrar. Probar background con builds nativos y verificar las opciones contra la versión instalada. [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/).

Abrir el mapa de un usuario no aumenta por sí solo la frecuencia del teléfono de su pareja. Para una sesión remota se necesita una solicitud autenticada, consentimiento previo o aceptación, y vencimiento. Si el teléfono emisor está suspendido, mostrar la solicitud pendiente; una push no garantiza despertarlo ni activar GPS. La primera entrega debe permitir iniciar la sesión desde el teléfono que comparte.

## Implementación por fases

### 1. Contratos, privacidad y base técnica — P0

- Definir los estados `off`, `balanced`, `live`, `paused` y `unavailable`, las transiciones por sesión, permisos, red, batería y ciclo de vida. Separar modo deseado de disponibilidad observada.
- Crear contratos tipados para ubicación, sesión en vivo, dispositivo y notificación. Migrar primero los servicios críticos a TypeScript y generar tipos SQL.
- Añadir migraciones no destructivas: preferencias de compartición; `captured_at`, `received_at`, `accuracy_m`, secuencia/ID de muestra y dispositivo emisor; velocidad/rumbo opcionales. Mantener el instalador limpio coherente con el resultado de las migraciones.
- Preservar `auth.uid()` y comprobación de pareja en RPC. Limitar frecuencia, tamaño y coordenadas; aceptar muestras fuera de orden solo para historial cuando proceda, nunca para reemplazar el punto actual por uno más antiguo. Validar también fechas futuras anómalas.
- Definir un único teléfono emisor activo por persona para evitar saltos entre dispositivos. Preferencias y revocación verificadas en servidor y cliente; borrar colas del usuario al salir.
- Probar aislamiento con dos parejas distintas, revocación de acceso, desvinculación y lectura de historial. Los filtros del canal no sustituyen a RLS.

**Aceptación:** ninguna muestra de otra pareja es accesible, la pausa detiene envíos y una muestra retrasada no sustituye una más reciente.

### 2. Motor adaptativo de ubicación — P0

- Extraer el heartbeat de `HomeScreen`. Crear un coordinador único ligado a la sesión y al modo de compartir, con arranque/parada idempotentes y sin productores duplicados foreground/background.
- Usar observación de ubicación en primer plano y una tarea registrada a nivel de módulo para segundo plano. Revalidar permisos y servicios al volver de Ajustes.
- Filtrar ruido GPS usando precisión y desplazamiento; reutilizar una muestra reciente válida para la carga inicial. No solicitar máxima precisión siempre.
- Persistir cola SQLite acotada. Para ubicación actual, conservar preferentemente el punto más reciente; para eventos de llegada, conservar IDs y hora original. Reintentar con espera exponencial y variación aleatoria; no reproducir horas de recorrido como movimiento actual.
- Introducir generación de sesión/cancelación para descartar resultados que terminen después de pausa, logout o cambio de cuenta.
- Configurar Android foreground service y su notificación, inicio/parada, permisos y manifiesto fusionado. Actualizar el verificador para comprobar estas condiciones en lugar de prohibir el servicio.
- Configurar background iOS, permisos contextuales y pausas. Mantener los geofences separados; no volver a registrarlos si la lista no cambió. Distinguir estado inicial de una llegada nueva para evitar avisos espurios.
- Instrumentar tiempo con GPS activo, muestras capturadas/descartadas, envíos y fallos, sin registrar coordenadas en logs ordinarios.

**Aceptación:** una sola fuente de publicación, parada inmediata local, recuperación de red sin duplicados funcionales, degradación visible por permisos y sesión intensiva con expiración.

### 3. Mapa y datos actualizados — P0

- Crear `MapScreen` con `react-native-maps`, marcador por persona, círculo de precisión, encuadre de ambos, recentrado y ficha con última actualización.
- Configurar y verificar el proveedor de mapas Android y sus claves restringidas. En iOS, usar el proveedor nativo salvo necesidad concreta de otro. Comprobar en binarios reales, no solo Metro.
- Cargar primero el último snapshot y suscribirse a cambios autorizados de ubicación. Mantener Postgres Changes para la primera versión, actualizar la entidad desde el evento y recuperar snapshot al reconectar.
- Limitar suscripciones al estado activo/foco, compartir caché entre Inicio y Mapa y conservar un único observador por dato. Realtime distribuye los puntos recibidos; no obtiene coordenadas del dispositivo.
- Animar únicamente la transición entre posiciones recibidas, sin extrapolar recorridos. No recentrar mientras el usuario explora el mapa; ofrecer un control para retomar seguimiento.
- Consultar historial bajo demanda, por rango y con paginación. Ya hay muestreo de 15 minutos y retención de 30 días en SQL: sirve como registro aproximado, no como recorrido preciso. Hacerlo opcional y ajustar retención/decimación sin persistir cada frame.
- Añadir estados de carga, permiso denegado, ubicación aproximada, error, pausa y dato antiguo. La ubicación propia puede mostrarse localmente con indicación de si ya fue compartida.

**Aceptación:** con sesión en vivo iniciada en el emisor y red estable, objetivo experimental p95 de captura a visualización ≤15 s. Medir aparte captura→servidor y servidor→mapa; este objetivo no se extiende a app forzada a cerrar ni al modo de ahorro. Al reconectar se recupera el punto más reciente.

Para una escala mayor, evaluar Broadcast privado desde la base de datos, con autorización y snapshot persistente. No añadir ese salto hasta medir carga y latencia; Supabase documenta ambas alternativas y recomienda Broadcast para escalabilidad. [Supabase Realtime](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).

### 4. Notificaciones completas — P0/P1

| Evento | Comportamiento propuesto |
| --- | --- |
| Mensaje de chat | Avisar al destinatario; agrupar y evitar banner duplicado cuando ese chat esté visible. |
| Amor diario | Un aviso por confirmación válida; evitar doble push por evento y mensaje `love`. |
| Llegada a lugar | Reutilizar cola existente; conservar fecha real del evento, descartar avisos demasiado antiguos y mantener deduplicación. |
| Fecha especial | Respetar recurrencia, antelación y zona horaria; recuperar vencimientos tras caída del scheduler con una ventana de gracia. |
| Historia o cambio de estado | Preferencia opcional para evitar ruido. |
| Solicitud de sesión en vivo | Solicitud temporal, aceptable/rechazable; nunca etiquetarla como seguimiento activo antes de confirmación. |

- Separar registro lógico de notificación y entregas por dispositivo. Añadir instalaciones con token único, plataforma, usuario actual, estado y última actualización. Logout revoca solo esa instalación; manejar rotación del token y cambios de cuenta.
- Añadir `type`, referencia al recurso, `data`, `read_at`, vencimiento y preferencias por categoría/horario. Encolar eventos desde transacciones o triggers autorizados, sin confiar en destinatarios arbitrarios enviados por el móvil.
- Separar envío de push de limpieza de historias. Disparar el worker al encolar y conservar un scheduler de recuperación: un cron cada pocos minutos añade esa espera a mensajes y llegadas.
- Mantener reserva atómica; añadir vencimiento, `next_attempt_at`, backoff, ID de intento/reserva y límite de trabajo por ejecución. Una caída después de enviar y antes de guardar puede causar duplicados: no prometer entrega exactamente una vez.
- Guardar ticket Expo, consultar receipts en una tarea diferida y retirar `DeviceNotRegistered`. Diferenciar aceptación por Expo, entrega a APNs/FCM y apertura por el usuario. Un receipt correcto tampoco demuestra recepción en el teléfono. [Expo: envío y receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
- Implementar apertura desde app activa, background y arranque en frío; esperar a Auth/pareja/navegador y validar que el recurso sigue autorizado. Incluir `notificationId` para deduplicar acciones.
- Añadir bandeja de avisos y estado leído; elegir suscripción/paginación explícitamente porque la publicación Realtime actual no incluye `notifications`. Canales Android por categoría y preferencias de vista previa del contenido.
- Evitar obtener y reescribir el token en cada regreso a foreground si no ha cambiado. Sustituir alertas repetitivas de red por estado recuperable.
- Verificar APNs, FCM, configuración EAS, permisos y worker/scheduler desplegados. La revisión local no confirma su existencia en producción. Mantener autenticación de servidor con `@supabase/server`, clave secreta fuera del cliente y `verify_jwt` coherente.

**Aceptación:** chat, amor, llegada y fecha generan el aviso correcto, abren su recurso y respetan preferencias; pruebas con dos dispositivos por cuenta, token inválido, sesión cerrada, worker interrumpido y avisos vencidos. Objetivo medido del tramo evento→aceptación Expo p95 ≤5 s con infraestructura saludable; recepción final depende del proveedor y del dispositivo.

### 5. Completar producto y reducir trabajo innecesario — P1

- Recuperación y cambio de contraseña con enlaces de Auth; perfil editable y avatar con límites, compresión y Storage privado cuando corresponda.
- Desvinculación y eliminación de cuenta con tratamiento transaccional de pareja, recursos, geofences, notificaciones y dispositivos. Revisar la FK `couples.created_by` con `on delete restrict` antes de implementar borrado.
- Chat paginado por cursor, estados pendiente/error/reintento y clave idempotente por mensaje. Indicadores de lectura si se incluyen en el alcance final.
- Historias con miniaturas, compresión antes de subir, paginación, firma en lote/caché hasta vencimiento y limpieza de archivos huérfanos. No regenerar todas las URLs en cada evento.
- Reordenar las siete pestañas actuales: propuesta Inicio, Mapa, Chat, Recuerdos y Cuenta; agrupar historias/fechas y mantener Lugares accesible desde Mapa.
- Homogeneizar componentes, accesibilidad, tamaño de texto, teclado, estados vacíos y errores. Sustituir mensajes técnicos crudos por acciones recuperables.
- Preferencias de ubicación, historial y notificaciones en Cuenta; política clara de almacenamiento y borrado. Widgets y mejoras decorativas quedan para después del núcleo funcional.

## Estructura propuesta, mediante cambios graduales

```text
src/app/                       providers, bootstrap y ciclo de vida
src/features/location/         coordinador, políticas, tareas, cola y contratos
src/features/map/              pantalla, marcadores, ficha e historial
src/features/notifications/    registro, preferencias, bandeja y navegación
src/features/chat/             consultas, mutaciones y componentes
src/features/account/          Auth, perfil y dispositivos
src/shared/                    permisos, UI común, red y observabilidad
src/supabase/                  cliente y tipos generados
supabase/migrations/           cambios incrementales de contratos y RLS
supabase/functions/            envío, receipts y mantenimiento separado
tests/                         políticas, servicios e integración
```

No mover todo de una vez. Empezar por ubicación/notificaciones, dejar adaptadores para los servicios existentes y unificar `context/` y `contexts/` cuando se extraiga el arranque. Actualizar `verify-architecture.mjs`, que actualmente presupone rutas y busca texto en `setup.sql`, con pruebas de contratos y migraciones ejecutables.

## Validación y orden de entrega

1. **Contratos y privacidad:** migraciones, RLS, estados y pruebas con usuarios de distintas parejas.
2. **Ubicación y mapa:** coordinador, tarea nativa, UI, reconexión y primera medición energética. Validar temprano la viabilidad en iOS y Android.
3. **Push completo:** dispositivos, eventos, worker, receipts y navegación; puede prepararse una vez definidos los contratos.
4. **Cierre funcional:** cuenta, pareja, historial/chat, optimización de historias y navegación.
5. **Publicación:** firma de producción, builds, credenciales, migraciones ensayadas, monitorización y beta con dispositivos reales.

Cada entrega debe ser pequeña y reversible mediante flags de funcionalidad. Las migraciones deben ensayarse sobre una copia con datos; `setup.sql` elimina datos y no es una vía de actualización. Verificar restauración y compatibilidad entre app anterior/nueva antes de activar nuevos modos.

### Ensayo de batería

Comparar builds release en el mismo dispositivo, con condiciones de señal, pantalla, temperatura y recorrido controladas. Tres repeticiones por escenario y plataforma: compartir apagado, reposo 8 h, trayecto 60 min en modo cotidiano, mapa/sesión en vivo 30 min, pantalla bloqueada y batería baja. Incluir Android de Google y un fabricante con restricciones adicionales, además de iPhone.

Registrar consumo por hora y diferencia frente al control, actividad GPS, red, CPU, despertares, memoria y latencia/frescura. Usar herramientas de energía de Android y Xcode/Instruments; el porcentaje de batería por sí solo es poco preciso. Escoger el modo de menor consumo que cumpla la frescura acordada. No hay mediciones todavía para prometer un porcentaje de ahorro.

Añadir pruebas de permisos aproximados/revocados, GPS apagado, reinicio, cierre forzado, cambios Wi-Fi/datos, modo avión, Doze/ahorro, múltiples dispositivos, retorno de Ajustes y cambio de cuenta. Verificar límites observados y explicarlos en la UI.

### Comprobaciones realizadas en esta revisión

| Comprobación | Resultado y límite |
| --- | --- |
| `npm run verify` | Correcta; verificación estática del contrato actual. |
| `npm test` | 8/8 correctas; cubren utilidades, no flujos móviles. |
| `npm run typecheck` | Correcta; no equivale a tipado exhaustivo de los archivos JS ni del backend. |
| `npm run lint` | Correcta. |
| `npm run doctor` | La ejecución normal encontró un error EPERM en la caché externa de Expo. Con `EXPO_OFFLINE=1` terminó correctamente; Expo advierte que esa validación es menos fiable y no confirma el catálogo remoto actual. |
| Dispositivos, batería, push real y SQL desplegado | No verificados en esta revisión. |

Las credenciales y servicios externos se comprobarán durante la implementación. La definición de «completa» propuesta cubre el núcleo existente, mapa, seguimiento y notificaciones; campos como batería remota, lectura del chat y widgets pueden ajustarse sin retrasar el núcleo.
