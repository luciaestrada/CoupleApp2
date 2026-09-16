# Plan completo de evolución de CoupleApp

Fecha: 10 de septiembre de 2026. Documento de planificación; no activa ni implementa las funciones propuestas.

## 1. Objetivo y alcance

Convertir CoupleApp en un espacio privado de pareja para compartir emociones, conversar, organizar planes y conservar recuerdos. La ubicación será una herramienta voluntaria para situaciones concretas, con controles visibles.

Se mantienen cinco pestañas: Inicio, Mapa, Recuerdos, Chat y Cuenta. No se añadirán pestañas principales para cada función. Ajustes seguirá concentrando preferencias y permisos.

Este plan cubre las diez propuestas recibidas, la pantalla «Lo que comparto» y el rediseño de Inicio. Las funciones citadas como futuras —vídeo automático de aniversario y Live Activities— tienen una fase propia; no se consideran parte de la primera entrega.

## 2. Punto de partida comprobado

| Área | Base existente | Trabajo pendiente o nuevo |
| --- | --- | --- |
| Inicio | Días juntos, amor, rachas y resumen de ubicación | Check-in, estado de la pareja y actividad reciente integrada |
| Mapa | Ubicaciones, información compacta junto al marcador, modos de seguimiento y panel inferior | Validación del nuevo panel, sesiones con destino y avisos temporales |
| Privacidad | Pausa, segundo plano, historial, actividad, batería y autorización de sesiones automáticas | Vista unificada de permisos efectivos y control explícito de precisión compartida |
| Chat | Texto, amor, eventos de lugares, actividad, historias y recorridos | Respuestas, reacciones, adjuntos, audio y fijados |
| Recuerdos | Historias de 24 horas, estados y fechas | Álbumes permanentes, línea temporal, planes y efemérides |
| Backend | Supabase, RLS, RPC, almacenamiento privado y cola de notificaciones | Nuevas entidades, políticas, trabajos periódicos y migraciones |
| Nativo | Android e integración de movimiento; código iOS | Ensayo real en ambos sistemas, widgets y Live Activities |

Las comprobaciones automáticas existentes no demuestran todavía entrega push entre dos móviles, precisión de trayectos ni ahorro energético. La compilación Android del nuevo panel quedó interrumpida por almacenamiento; en esta revisión vuelve a haber aproximadamente 45 GiB libres en C:, por lo que debe reintentarse. iOS requiere un entorno de compilación y firma compatible con Apple.

## 3. Reglas de producto

- Compartir ubicación es opcional y pausarla nunca afecta a las rachas.
- No habrá clasificaciones ni comparaciones de esfuerzo entre los miembros.
- Los datos antiguos se mostrarán como antiguos. Una estimación no se presentará como una posición GPS o una llegada confirmada.
- Las nuevas funciones sensibles tendrán activación explícita; una migración no cambiará el consentimiento existente.
- Las notificaciones serán configurables, agrupadas cuando proceda y sin información sensible en su vista previa por defecto.
- La aplicación debe seguir siendo útil sin ubicación, sin micrófono y sin notificaciones.
- Los cambios de pareja y el cierre de sesión invalidarán accesos, cachés y acciones pendientes de la relación anterior.
- Los reintentos de una acción conservarán su identificador para no duplicar publicaciones, gestos ni avisos.

## 4. Experiencia por pantalla

### Inicio

Orden propuesto: días juntos; rachas actuales; estado/check-in de la pareja; envío de afecto; pregunta del día; actividad reciente. La ubicación se presenta como una tarjeta secundaria, con antigüedad y distancia cuando existan datos válidos.

«Hoy» mostrará una lista corta de acontecimientos, con acceso al chat o al elemento original. No abrirá nuevas conexiones independientes para cada tarjeta: un servicio agregará la carga inicial y compartirá las suscripciones necesarias.

### Mapa

Se conserva el marcador compacto con información alternante y expansión al tocar. La barra inferior mantiene Compartir/Pausar y se despliega por arrastre con dos posiciones estables. El contenido se organiza en «Mi ubicación», «Sesiones y llegadas», «Lugares» e «Historial»; las preferencias extensas remiten a Ajustes.

Una sesión con destino tendrá una tarjeta específica con destino, estado, hora prevista si existe y botón Terminar. El mapa no será requisito para consultar las demás funciones.

### Recuerdos

Será el acceso a Línea temporal, Álbumes, Planes, Historias y Fechas. Los estados se publicarán principalmente desde Inicio, manteniendo el acceso actual durante la transición.

### Chat

Conversación y cronología privada. Los eventos tendrán tarjetas consistentes, reacciones y enlaces a su contenido. Las acciones de responder, reaccionar y fijar se ofrecerán mediante pulsación prolongada y alternativas accesibles.

### Cuenta y Ajustes

Se incorpora «Lo que comparto con [nombre]», con preferencias y estado efectivo. Los permisos del teléfono, la elección del usuario y la disponibilidad del servicio se distinguirán claramente.

## 5. Especificación funcional

### 5.1 Check-in emocional

**Alcance:** emoji/ánimo, energía de 1 a 5 y frase opcional de hasta 280 caracteres. Una entrada editable por persona y día de la pareja. Se amplía el estado actual, evitando dos formularios para expresar lo mismo.

**Interacción:** publicar desde Inicio; responder a la pareja con una reacción de apoyo o un texto breve. «Hoy ambos estáis…» solo aparece cuando los dos han publicado y sus elecciones permiten esa descripción. No se deducirá el estado emocional mediante sensores o mensajes.

**Datos propuestos:** `daily_checkins` y `checkin_responses`, con pareja, autor, fecha local y marcas temporales UTC. La publicación actualiza la proyección de estado existente. El check-in visible caduca al finalizar el día; por defecto no crea un historial emocional permanente. «Guardar como recuerdo» será una acción explícita del autor.

**Aceptación:** editar no duplica el check-in ni el aviso; reintentar una respuesta no la duplica; no publicar no provoca avisos de reproche; la vista respeta la fecha de la pareja y la revocación de acceso.

### 5.2 «Avísame cuando llegues» y trayecto temporal

**Alcance inicial:** seleccionar un lugar compartido y solicitar un aviso para la próxima llegada. Se ofrecerá al mantener pulsado el lugar y mediante un botón accesible equivalente. La persona que viaja puede aceptar o iniciar por sí misma «Voy de camino».

**Consentimiento:** solicitar no activa seguimiento por sí solo. El viajero elige entre compartir solo el evento de llegada o también la posición durante el trayecto. Una autorización de sesiones automáticas del mapa no se reutiliza silenciosamente como autorización de un destino nuevo.

**Estados:** pendiente, activa, llegada, cancelada y caducada. Una sesión activa por viajero y dispositivo autorizado; duración inicial propuesta de dos horas, ampliable explícitamente. Al finalizar vuelve a la política de seguimiento que corresponda, sin reactivar una pausa posterior.

**Llegada:** geofence o posición válida dentro del radio y una política de confirmación que reduzca falsos positivos. Si ya estaba en el lugar al iniciar, se indica «Ya estás aquí» sin simular un trayecto. Sin datos suficientes, se caduca como no confirmada; nunca se inventa una llegada. Debe resolverse la coordinación con las regiones guardadas y los límites nativos de geofencing.

**Hora de llegada:** primera versión con hora aproximada introducida por el viajero. La ETA automática necesita un proveedor de rutas, modo de transporte, conectividad y evaluación de coste/privacidad; se añade después mediante un adaptador. No se calcula una hora aparentemente precisa dividiendo distancia en línea recta entre velocidad instantánea.

**Datos:** `arrival_sessions`, destino y radio fijados al inicio, alcance del consentimiento, vencimiento y referencia al recorrido. Los eventos se insertan una vez en chat y cola push.

**Aceptación:** cancelar, pausar, caducar o desvincular impide nuevos envíos; un evento repetido produce un solo aviso; el trayecto termina con el permiso adecuado; se prueba sin red, con app suspendida y tras recuperar conexión.

### 5.3 Widgets Android/iOS y Live Activities

**Entrega A:** widget pequeño con días juntos y rachas; mediano con estado compartido y último gesto, sujeto a preferencias. Los datos muestran antigüedad. El botón de afecto abre la app en la acción correspondiente.

**Entrega B:** envío directo desde el widget, con acción idempotente, estado pendiente/error y autenticación del usuario. La operación debe comprobar la relación vigente. No se guarda una clave de servidor en el widget ni se incluye un token de sesión en el archivo de datos visuales.

**Implementación:** módulo Android con App Widgets/Glance; extensión WidgetKit con SwiftUI y App Intents en iOS. Una capa nativa genera una instantánea mínima y privada. Al cerrar sesión se borra y se solicita actualizar los widgets. Con la app sin conexión se muestra una instantánea antigua identificada, no una confirmación falsa de actualidad.

**Live Activities:** solo para una sesión temporal aceptada. Inicio, actualización, caducidad y fin vinculados a esa sesión; actualización desde la app o mediante APNs/ActivityKit, según el diseño de entrega. Es una integración distinta del push habitual y requiere validar credenciales, tokens y firma. ActivityKit no obtiene ubicación por sí mismo. [Documentación de Apple](https://developer.apple.com/documentation/ActivityKit).

**Aceptación:** tamaños y textos grandes, sesión caducada, widget sin cuenta, cierre de sesión, dispositivo bloqueado y ausencia de red. El widget no mantiene un GPS ni un socket Realtime continuos; la frecuencia de actualización queda sujeta al sistema. [Actualizaciones de widgets Android](https://developer.android.com/develop/ui/compose/glance/glance-app-widget?hl=en).

### 5.4 Historia de la relación y «Hace un año…»

**Alcance:** línea temporal paginada, agrupada por meses/años, que reúne comienzo de la relación, fechas, recuerdos guardados, álbumes y planes completados. Filtros por tipo y elementos destacados.

No se transformará automáticamente cada ubicación, check-in o historia efímera en un recuerdo permanente. Las historias solo entran si se guardan antes de caducar, conservando el archivo bajo la política de recuerdos.

**Datos:** `memory_entries`, con tipo, autor, fecha del acontecimiento, referencia de origen y texto. Restricción única por origen para impedir duplicados. La fecha del acontecimiento se distingue de la fecha de subida.

**Efemérides:** consultar recuerdos permanentes de la misma fecha en años anteriores. Tratar el 29 de febrero y cambios de zona horaria. No emitir una notificación por cada foto: tarjeta conjunta y aviso opcional.

**Aceptación:** borrar el origen no deja enlaces rotos; retirar un recuerdo elimina sus proyecciones; la paginación es estable; no reaparecen datos de una pareja anterior ni archivos efímeros caducados.

### 5.5 Álbumes compartidos

**Alcance:** título, descripción, portada, fecha y lugar opcionales. Ambos pueden añadir fotos y vídeos, con progreso, cancelación y reintento. Cada autor puede borrar su contenido; borrar un álbum completo se reserva a su creador y requiere confirmación clara. Estas reglas se muestran antes de publicar.

**Datos:** `albums`, `album_items` y una entidad común `media_assets` para archivos, miniaturas, autor, tamaño, formato y estado de carga. Los archivos de recuerdos se almacenan separados de historias efímeras.

**Límites iniciales propuestos:** fotos de hasta 10 MiB tras compresión, vídeos de hasta 60 segundos y 50 MiB, reutilizando límites actuales. Se validan tamaño y tipo en servidor; la duración requiere inspección del archivo si se quiere imponer como límite fiable. Cuota total por pareja definida antes de lanzar esta función.

**Privacidad:** no publicar coordenadas EXIF automáticamente; el lugar se añade voluntariamente. Guardar una historia como recuerdo debe preservar el archivo de forma transaccional antes de que el mantenimiento lo elimine.

**Aceptación:** carga interrumpida recuperable, archivo huérfano limpiado, cambio de cuenta durante subida, eliminación consistente y acceso privado al multimedia.

**Ampliación posterior:** vídeo de aniversario generado a partir de una selección confirmada. Requiere procesamiento multimedia, presupuesto de recursos y gestión de fallos. No se presupone IA ni un proveedor externo.

### 5.6 Pregunta del día

**Alcance:** categorías divertida, romántica, profunda y personalizada. La categoría íntima será opcional, desactivada inicialmente y con aceptación de ambos; su contenido se limitará a un público adulto.

Una pregunta por pareja y día. Cada persona responde en privado y puede editar su respuesta hasta la revelación. Las dos respuestas se revelan en una única operación del servidor cuando ambos han respondido; después quedan cerradas a edición. Se puede saltar una pregunta sin perder rachas.

**Datos:** catálogo `question_bank`, selección `couple_daily_questions`, respuestas `question_answers` y preferencias por categoría. La zona horaria de la pareja decide el día. Las respuestas incompletas de un día anterior no se revelan al cambiar de fecha.

**Seguridad:** el cliente no descarga las dos respuestas para ocultar una con la interfaz. Las políticas/RPC impiden leer la respuesta de la otra persona antes de la revelación; Realtime, notificaciones y vistas agregadas tampoco incluyen su texto.

**Aceptación:** intentos de lectura directa fallan; dos envíos simultáneos producen una sola revelación; reintentos no duplican; cambiar preferencias no altera preguntas ya contestadas. Guardar como recuerdo es opcional.

### 5.7 Planes compartidos

**Alcance:** lista ligera de cosas por hacer, con título, categoría, nota, enlace y fecha opcional. Estados pendiente, completado y archivado. Ambos pueden añadir y actualizar; el servidor controla versiones para detectar ediciones concurrentes.

**Completar:** marcar como hecho y ofrecer «Crear recuerdo», añadiendo fecha y fotos opcionales. El proceso es idempotente y conserva un enlace al plan original.

**Datos:** `couple_plans`, con creador, estado, versión y referencia al recuerdo. No se incorporan calendarios externos ni gestión compleja de tareas en esta entrega.

**Aceptación:** dos personas completando a la vez no crean dos recuerdos; reabrir un plan no borra silenciosamente el recuerdo; archivar no genera notificaciones repetidas.

### 5.8 Resumen semanal

**Alcance:** tarjeta de celebración conjunta con gestos enviados, mensajes, recuerdos añadidos y planes completados. Disponible aunque alguno no comparta ubicación.

Los «lugares juntos» solo se añadirán cuando exista una definición y comprobación fiables de coincidencia temporal con consentimiento de ambos. Dos visitas al mismo lugar en horas diferentes no cuentan como estar juntos. Este dato queda fuera de la primera versión del resumen.

**Generación:** por semana y zona horaria de la pareja, con clave única de pareja/periodo. Predeterminado propuesto: domingo por la tarde, notificación opcional y horario configurable. Si el trabajo se retrasa, publica una sola vez el periodo correcto.

**Datos:** `weekly_summaries`, agregados y versión del cálculo. No se almacenan mensajes completos ni rutas dentro del resumen. Borrar datos de origen exige recalcular o retirar los agregados afectados según la política elegida.

**Aceptación:** mismo resultado para los dos, sin rankings; semana con cero actividad sin reproches; comprobación de cambio de año, horario de verano, reintentos y periodos sin pareja activa.

### 5.9 Gestos de afecto

**Alcance:** toque simple mantiene Amor; pulsación prolongada ofrece Amor, Beso, Abrazo y Te echo de menos. Habrá una alternativa accesible al gesto prolongado.

Todos los tipos contribuyen a la misma regla diaria de afecto, sin crear cuatro rachas. Se preservan las rachas individuales existentes. Una racha conjunta adicional requeriría definir primero si exige participación diaria de ambos; no se recalculará el histórico sin esa decisión.

**Datos:** extender el evento de afecto con `kind` y un UUID de acción; un reintento conserva el UUID y una pulsación nueva genera otro. Mantener límites de frecuencia que eviten ráfagas accidentales sin bloquear el uso repetido normal.

**Háptica:** respuesta local opcional y recepción en primer plano cuando lo permite el dispositivo. No se promete una vibración idéntica en iOS/Android ni ejecución libre en segundo plano.

**Aceptación:** tipos correctos en chat, notificación y resumen; racha una vez por día; cambios de fecha fiables; recepción duplicada no vuelve a reproducir el mismo efecto.

### 5.10 Chat ampliado

**Primera entrega:** responder con referencia a un mensaje/evento; reacciones; fijar y desfijar. Si se elimina el origen de una respuesta, se muestra una referencia retirada sin conservar texto oculto.

**Segunda entrega:** fotos y vídeos mediante la capa multimedia común; mensajes de voz con permiso de micrófono solicitado al iniciar la grabación. Controles de grabar, cancelar, escuchar y enviar. Límite inicial propuesto de dos minutos por audio. No se añade transcripción automática en esta fase.

**Eventos:** tarjetas específicas para llegada, salida, recorrido, historia, afecto, check-in y pregunta revelada. Un recorrido muestra duración/distancia solo cuando pueden calcularse con datos válidos; los interrumpidos se identifican.

**Datos:** ampliar `messages` con referencia de respuesta y tipo; tablas `message_reactions`, `message_attachments` y `pinned_messages`. Una reacción por usuario/tipo/mensaje; fijados con límite visible, propuesto de cinco. Reutilizar los UUID y reintentos actuales.

**Aceptación:** pulsación prolongada no envía; reproducir audio detiene el anterior; salir de la pantalla detiene la grabación; el teclado no oculta el compositor; cargas y mensajes offline mantienen estado; eventos no producen notificaciones duplicadas.

## 6. Privacidad: «Lo que comparto»

Mostrar por separado preferencia y estado real para ubicación aproximada/precisa, batería, actividad, sensores, historial, recorridos, avisos de lugares y solicitudes en vivo. Estados posibles: activo, pausado, falta permiso, limitado por ahorro y no disponible.

El nivel aproximado debe aplicarse a los datos que puede leer la pareja, no solo al círculo dibujado. El servidor generará una proyección de ubicación reducida; el historial, las rutas, la distancia y los eventos de lugares no podrán exponer indirectamente una precisión superior a la aceptada. Los permisos aproximados del sistema tampoco pueden elevarse mediante una preferencia de la app.

Pausa accesible desde Inicio, Mapa y esta pantalla. Definir expresamente su alcance: detiene publicación continua y sesiones temporales; los avisos de lugares tienen su propio interruptor visible. Ofrecer «Pausar toda mi información de ubicación» para detener también llegadas/salidas. No penalizar afecto ni otras funciones.

El estado inicial de funciones nuevas será preguntar o desactivado. Mostrar fecha y alcance de la autorización de sesiones automáticas. Toda operación remota vuelve a comprobar consentimiento y dispositivo autorizado. Explicitar que las protecciones de acceso no equivalen a cifrado de extremo a extremo, que no existe actualmente.

Pruebas obligatorias: acceso con otra cuenta, relación revocada, sesión pendiente, cambio de dispositivo, enlace temporal ya emitido, caché offline y permisos retirados desde el sistema.

## 7. Arquitectura y datos comunes

### Cliente

Mantener pantallas como interfaz, servicios como acceso a datos y módulos de dominio para reglas. Incorporar servicios de check-in, preguntas, planes, recuerdos, álbumes y sesiones de llegada. Extraer componentes de tarjetas de evento compartidos entre Inicio y Chat.

Un único modelo de eventos alimentará las proyecciones visuales. Los eventos ya existentes en `messages` no se copiarán a otra tabla solo para mostrar «Hoy». Los recuerdos permanentes sí tienen ciclo de vida propio y referencias de origen.

Paginación por fecha e ID, cargas por lotes y observadores compartidos. Las pantallas ocultas no mantienen timers o conexiones adicionales. Las subidas grandes se pausan/cancelan y muestran progreso; los vídeos no se reproducen automáticamente fuera de pantalla.

### Servidor

Las mutaciones de consistencia —revelar respuestas, finalizar llegada, completar plan, enviar gesto— serán RPC transaccionales con autorización y claves de idempotencia. Las restricciones únicas garantizan la deduplicación incluso con dos móviles.

Ampliar las funciones de push y mantenimiento existentes. Los trabajos de servidor usarán `@supabase/server` con autenticación secreta apropiada; endpoints invocados por personas usarán autenticación de usuario. Ninguna función con datos privados tendrá acceso anónimo. Las claves de servidor permanecen en el servidor y no en Expo, widgets o archivos versionados.

La cola de avisos incluirá las nuevas categorías, caducidad, agrupación, reintentos y registro de entrega. Realtime no reemplaza al push para despertar aplicaciones suspendidas.

### Almacenamiento y conservación

Separar historias efímeras, recuerdos y adjuntos de chat. La base contendrá referencias, no URLs firmadas permanentes. Reglas de acceso verificadas en cada emisión de URL. El mantenimiento limpia cargas incompletas y archivos que ya no tengan referencias autorizadas.

No mantener copias invisibles de contenidos retirados. Un archivo compartido por varios elementos necesita un control explícito de referencias para no borrarlo antes de tiempo ni retenerlo indefinidamente. La eliminación de cuenta y desvinculación deben contemplar todas las entidades nuevas.

Zona horaria inicial: conservar Europe/Madrid para no romper rachas. Añadir zona por pareja de forma explícita; los cambios se aplican a periodos futuros, no reescriben días ya contabilizados.

## 8. Orden de ejecución y entregas

| Fase | Entrega | Dependencias y criterio de salida | Complejidad |
| --- | --- | --- | --- |
| 0 | Estabilización | APK con el panel nuevo; ensayos de mapa, teclado, gestos y push en dos dispositivos; compilación iOS | Alta por validación nativa |
| 1 | Base común y privacidad | Migraciones, consentimiento efectivo, categorías de avisos, reglas de fechas, media y eventos; pruebas de acceso | Alta |
| 2 | Inicio, check-in y afecto | Publicación y respuesta; nueva portada; gestos y rachas sin duplicados | Media |
| 3 | Pregunta del día y planes | Revelación protegida en servidor; planes concurrentes; creación idempotente de recuerdo | Media-alta |
| 4 | Álbumes y cronología | Carga recuperable, archivos privados, efemérides y limpieza de medios | Alta |
| 5 | Chat ampliado | Reacciones/respuestas/fijados primero; multimedia y voz después | Alta |
| 6 | Llegadas temporales | Consentimiento por sesión, fin automático, caducidad y ensayos reales; ETA manual inicial | Alta |
| 7 | Resumen semanal | Agregados fiables sobre funciones ya desplegadas, preferencias y scheduler probado | Media |
| 8 | Widgets | Widgets informativos primero; acción directa autenticada después; pruebas nativas | Alta |
| 9 | Ampliaciones | ETA por rutas, Live Activities y vídeo de aniversario, cada una con evaluación propia | Alta |

Las fases no se entregan como un único cambio masivo. Cada una incorpora interfaz, servidor, migración, pruebas y documentación. La estimación de calendario se hará tras cerrar la fase 0, porque depende de acceso al servidor, firma iOS y dispositivos; no se promete una fecha sin esa información.

Primera versión ampliada utilizable: fases 0–2. Segunda: 3–5. Tercera: 6–8. Las ampliaciones de la fase 9 son independientes y no bloquean las anteriores.

## 9. Migraciones y despliegue

1. Inventariar la versión realmente instalada del esquema y del cliente; no asumirla por la existencia de una columna.
2. Copia de seguridad y ensayo de restauración en entorno separado.
3. Migraciones nuevas, aditivas y versionadas. No usar `setup.sql` destructivo para actualizar usuarios existentes ni modificar retrospectivamente una migración ya desplegada.
4. Comprobar tipos, restricciones y permisos del esquema existente. Un `IF NOT EXISTS` no sustituye verificar que la columna tiene la definición esperada.
5. Desplegar primero estructura y funciones compatibles; después workers y cliente. Activar cada función mediante versión/capacidad del servidor.
6. Migrar contenidos existentes con referencias de origen únicas; no reenviar notificaciones históricas ni revelar respuestas privadas durante la migración.
7. Retirar compatibilidad antigua solo cuando los clientes correspondientes estén actualizados.
8. Ante fallo, desactivar la función y volver al cliente/worker anterior compatible. Preferir una corrección hacia delante antes que revertir destructivamente datos creados por usuarios.

La aceptación incluye ejecución inicial, repetición controlada, actualización parcial, datos previos y cliente de versión anterior. Los scripts deben indicar claramente su versión mínima y si pueden repetirse.

## 10. Plan de pruebas y rendimiento

**Dispositivos:** Android físico, incluido un fabricante con restricciones agresivas de batería, e iPhone físico. Probar con ambos miembros y con cuentas de terceros de prueba. No enviar mensajes o avisos reales a la pareja para ensayar sin autorización.

**Interfaz:** pantalla pequeña, texto grande, lector de pantalla, teclado abierto, gestos desde botones/contenido, scroll largo, cambio de pestaña y rotación si se admite. El panel debe conservar dos posiciones y no tapar los controles compactos.

**Ubicación:** reposo interior, paseo, bicicleta/vehículo cuando sea seguro, llegada a un lugar, trayecto sin red, batería baja, permiso aproximado, suspensión y cierre forzado. La app debe explicar cuándo no pudo confirmar un dato.

**Servidor:** RLS por pareja; carreras y reintentos; revocación; expiraciones; reloj/zona horaria; revelación de respuestas; borrado de contenidos compartidos. Probar los workers desplegados, no solo sustitutos locales.

**Notificaciones:** envío, recepción y apertura en Android/iOS; vistas previas; categorías desactivadas; duplicados; dispositivo cerrado; token renovado; aviso caducado. La aceptación por el proveedor no equivale a recepción visible.

**Energía:** medir una línea base y comparar escenarios repetibles de reposo y trayecto, con iguales condiciones. Registrar consumo por hora, tiempo de GPS, despertares, solicitudes de red y latencia de posición. Corregir regresiones antes de añadir una nueva función de fondo; no fijar un porcentaje de ahorro sin datos.

**Multimedia:** archivos inválidos, límite excedido, red interrumpida, cancelación, batería baja y falta de espacio. Comprobar que las miniaturas y el audio no provocan descargas/reproducciones innecesarias.

**Observabilidad:** registrar códigos de fallo y latencias con identificadores mínimos. No incluir coordenadas, textos privados, respuestas ni tokens en logs de diagnóstico. Los indicadores de uso serán conjuntos y opcionales cuando corresponda.

## 11. Decisiones iniciales y puntos que requieren definición

Se puede empezar sin nuevas preguntas usando estas decisiones: preservar rachas individuales, estados diarios no permanentes, ubicación voluntaria, ETA manual inicial, álbumes privados, pregunta íntima desactivada y widgets informativos antes del envío directo.

Antes de sus respectivas fases habrá que definir: cuota de almacenamiento por pareja; política de conservación de chat y recuerdos; eliminación de un álbum completo; zona horaria configurable; horario del resumen; catálogo editorial de preguntas; racha conjunta si se desea; proveedor/presupuesto de rutas; procesamiento del vídeo de aniversario; disponibilidad de firma y dispositivos iOS.

Estas decisiones no bloquean la fase de estabilización ni el diseño de Inicio y privacidad.

## 12. Definición de terminado

Una función solo se considera terminada cuando su interfaz, permisos, servidor, migración y errores están cubiertos; funciona en los dispositivos objetivo; se han comprobado acceso privado y reintentos; no introduce una regresión de consumo apreciable en el ensayo acordado; y están documentados sus límites y recuperación.

El resultado de esta planificación es una hoja de ruta implementable. No supone que las nuevas funciones estén ya activadas, desplegadas o verificadas.

## 13. Tareas concretas por fase

Esta numeración identifica fases de implementación, no los números de las propuestas originales. Por ejemplo, los widgets se implementan en la fase 8, aunque eran la propuesta 3.

| Fase | Trabajo en el proyecto | Evidencia que debe quedar |
| --- | --- | --- |
| 0 | Recompilar el cliente nativo; revisar `MapOptionsSheet`, `MapScreen`, `OpenMap` y el compositor de `ChatScreen`; verificar registro de dispositivos, worker push y configuración instalada | Registro de compilación; pruebas de arrastre y teclado; recepción y apertura push en ambos sistemas; medición energética inicial |
| 1 | Unificar preferencias en `settingsService` y Ajustes; coordinar `TrackingContext`, `trackingEngine`, `geofenceService` y colas locales; añadir proyección de precisión autorizada, contratos multimedia y permisos de las nuevas tablas | Migración aditiva; matriz de consentimiento; pruebas de lectura directa, pausa sin red, revocación y limpieza de colas |
| 2 | Crear servicios de check-in y componentes de Inicio; ampliar `streakService`, chat y notificaciones con tipos de afecto; reutilizar eventos para la lista Hoy | Publicación, edición y apoyo entre cuentas de prueba; deduplicación; conservación de rachas existentes |
| 3 | Crear servicios y pantallas secundarias de preguntas y planes; selección diaria y revelación atómica; establecer el contrato mínimo de recuerdos para planes completados | Imposibilidad de leer respuestas ocultas; pruebas simultáneas de respuesta y de completar un plan |
| 4 | Completar servicios de medios, álbumes y recuerdos; ampliar `MemoriesScreen`; incorporar cronología paginada y efemérides | Pruebas de cargas interrumpidas, conservación explícita de historias, borrado y acceso privado |
| 5 | Ampliar `chatService` y `ChatScreen`; componentes compartidos de eventos; respuestas, reacciones, fijados, selección multimedia y grabación | Pruebas del compositor y audio; referencia borrada; reintento sin duplicados; permisos solicitados al usar la función |
| 6 | Crear servicio de llegadas; integrar selección de lugares, aceptación, tareas de ubicación y mantenimiento; tarjetas de sesión en mapa y chat | Transiciones verificadas; cancelación y caducidad; pruebas reales de llegada y pérdida de red |
| 7 | Incorporar cálculo periódico al mantenimiento, preferencias de resumen y tarjeta de Inicio | Periodos cerrados definidos; ejecución repetida sin duplicados; agregados coherentes y notificación opcional |
| 8 | Añadir módulos nativos de widget y puente de instantáneas; integrar navegación y acción autenticada de afecto | Compilación y prueba Android/iOS; cierre de sesión, estado antiguo, reintentos y cuenta desvinculada |
| 9 | Diseñar por separado integración de rutas, ActivityKit y procesamiento de vídeo | Evaluación de proveedor, costes, permisos y pruebas antes de activar cada ampliación |

### Dependencias que deben resolverse sin rehacer trabajo

- La fase 1 define el almacenamiento común; las interfaces completas de álbumes llegan en la fase 4 y el chat lo reutiliza en la fase 5.
- La fase 3 necesita una operación mínima para crear recuerdos desde planes. La fase 4 amplía su presentación y navegación, manteniendo ese contrato.
- Las llegadas de la fase 6 reutilizan privacidad, eventos y avisos; no crean un segundo motor GPS independiente.
- El resumen cuenta periodos cerrados. Si se publica el domingo por la tarde, el periodo puede ser domingo a domingo a esa hora; si se eligen semanas de lunes a domingo, se publica después del cierre. La interfaz indica el intervalo real.
- Los widgets consumen una instantánea derivada de los servicios existentes; sus acciones deben pasar las mismas comprobaciones que las de la aplicación.

### Registro de entrega

Para cada fase se anotarán versión de migración, versión de app, pruebas ejecutadas, dispositivos utilizados y verificaciones pendientes. Se distinguirá «implementado localmente», «desplegado» y «validado en dispositivo». La falta de firma iOS o de acceso al servidor puede dejar una validación pendiente, pero no debe quedar registrada como completada.
