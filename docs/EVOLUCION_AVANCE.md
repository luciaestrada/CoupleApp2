# Avance de implementación: fases 0–8

Objetivo: implementar por orden las fases 0 a 8 de `PLAN_EVOLUCION_COUPLEAPP.md`. La fase 9 no forma parte de esta entrega.

## Fase 0 — Versión actual confirmada por el usuario

El 11 de septiembre el usuario confirma que la versión actual funciona e indica continuar. Se toma esa confirmación para avanzar a la fase 1. Los fallos de arranque registrados debajo corresponden a ensayos anteriores; no se consideran un bloqueo vigente. La entrega push entre teléfonos, iOS y la medición energética siguen necesitando su propia validación.

- Compilación Android del panel nuevo: completada (`.expo/map-sheet-build.log`). APK instalado correctamente en `emulator-5554`.
- Prueba de arranque: detectó pantalla blanca. El registro del proceso identifica `ClassNotFoundException: expo.modules.splashscreen.SplashScreenManager` en el cliente de desarrollo. Se ha añadido `expo-splash-screen` compatible con el SDK instalado; nueva compilación correcta e instalada, registrada en `.expo/phase0-splash-build.log`. El error ya no aparece, pero la pantalla continúa en blanco: no se ha demostrado que ese error fuera la causa única del problema.
- El temporizador visual del mapa ahora se detiene al perder foco o pasar la app a segundo plano. No cambia la política de captura GPS.
- Las 24 pruebas existentes pasan; ESLint, TypeScript y comprobación de arquitectura pasan tras el cambio de temporizador. Estos resultados no sustituyen las pruebas nativas.
- Pendientes: comprobar arranque tras recompilar, gestos del panel, teclado, entrega push entre teléfonos, compilación/pruebas iOS y medición energética.
- El nuevo ensayo produjo un ANR por falta de ventana enfocada (`.expo/phase0-last-anr.txt`). Metro responde en el puerto 8082. Se está aislando el arranque normal del enlace del cliente de desarrollo; no se han borrado datos ni credenciales del emulador.

## Fase 1 — En curso

- Añadida sección «Lo que comparto» en Ajustes, con estado de ubicación, segundo plano, batería, actividad, historial, recorridos y autorización de sesiones automáticas.
- La presentación distingue permiso ausente, pausa local, otro dispositivo autorizado, sesión caducada, falta de conexión y última publicación. No equipara una preferencia activada con recepción por la pareja.
- Se conserva la precisión aproximada/precisa de los permisos nativos al normalizarlos, sin inventar precisión cuando el sistema no la informa.
- Botón de pausa mediante el motor existente, con explicación de que los avisos de lugares tienen alcance separado.
- Añadidos pausa/reanudación explícita de avisos de lugares y pausa conjunta de ubicación y lugares en este teléfono. La pausa local se persiste antes de operaciones asíncronas, limpia eventos pendientes e impide que un registro tardío reactive regiones. Las pruebas cubren esa carrera y la reanudación explícita. No retira peticiones que ya se hayan enviado ni aplica todavía la pausa a otros dispositivos.
- 26 pruebas, ESLint y TypeScript correctos. Pendientes de esta fase: pausa global de geofences con protección en servidor, precisión elegida y aplicada en servidor, consentimiento completo y bases comunes de multimedia/eventos. La sección actual no sustituye esas implementaciones.

### Protección de lugares en servidor

El usuario confirma haber ejecutado `20260911000100_place_sharing_privacy.sql`. Desde esa confirmación se conserva esa migración y los cambios de precisión se entregan por separado.

Implementada la migración `supabase/migrations/20260911000100_place_sharing_privacy.sql`. Aplicar después de las migraciones del 9 de septiembre; no ejecutar el instalador destructivo. Conserva el comportamiento anterior hasta que el usuario pause expresamente. Añade pausa de lugares por usuario, reanudación con fecha de corte y pausa conjunta con posiciones en una transacción. Un trigger protege también las RPC antiguas contra nuevas inserciones durante la pausa. No elimina notificaciones ya emitidas.

La app guarda esa preferencia y observa sus cambios para detener regiones nativas. La pausa local permanece si falla la conexión. Una cola persistente por usuario reintenta la revocación al abrir la app y cada 30 segundos mientras está en primer plano y hay una pausa pendiente; no usa timers de reintento en segundo plano. Las reanudaciones explícitas esperan a que se confirme la pausa anterior. El servidor valida el usuario esperado para evitar aplicar una acción pendiente a otra cuenta.

Las pruebas SQL cubren pausa, reanudación, eventos anteriores y separación entre usuarios. Las pruebas de cola cubren reinicio, falta de red y ampliación de una pausa mientras se envía otra. 29 pruebas pasan. Pendientes: despliegue real y prueba concurrente entre conexiones de base de datos. La precisión compartida y las bases multimedia siguen pendientes dentro de la fase 1.

## Fases pendientes

## Fase 2 — Inicio, check-in y afecto en curso

Implementado check-in en Inicio con seis estados de ánimo, energía 1–5 y frase opcional de 280 caracteres. El editor usa un modal que se adapta al teclado. Hay una entrada editable por día de Europe/Madrid y usuario, respuestas de apoyo y mensaje compartido cuando ambos eligen el mismo estado. La caducidad se comprueba tanto en interfaz como en las políticas SQL; mantenimiento elimina las entradas caducadas y sus respuestas. No se crea todavía un recuerdo permanente.

Añadidos cuatro gestos de afecto mediante pulsación prolongada o botón accesible: Amor, Beso, Abrazo y Te echo de menos. Chat y notificaciones muestran el gesto; todos reutilizan la regla diaria de rachas individuales. El cliente conserva el UUID de envíos fallidos por cuenta, pareja y tipo para reintentar sin duplicar. El servidor limita ráfagas a diez gestos en diez segundos y rechaza reutilizar un UUID para otro tipo.

Migraciones nuevas: `20260912000100_daily_checkins.sql` y `20260912000200_affection_kinds.sql`, después de las anteriores. Hay que desplegar también mantenimiento. No se ha ejecutado SQL remoto durante esta implementación. Pasan 33 pruebas, ESLint, TypeScript, arquitectura y comprobación Deno del worker.

Pendientes de fase 2: unificar el estado anterior con check-in para evitar formularios duplicados; proyección de estado en mapa; respuestas de apoyo de texto libre; guardar check-in como recuerdo; háptica opcional; actividad «Hoy»; preferencias específicas y validación del editor/gestos en dispositivos. Las validaciones abiertas de fase 1 siguen registradas; el avance en fase 2 no las da por completadas.

### Base multimedia

Preparada `20260911000300_media_foundation.sql`: reservas idempotentes, cuota inicial de 500 MiB por pareja, límite de imagen/audio de 10 MiB y vídeo de 50 MiB, archivos separados en `memories` y `chat-media`, y borradores visibles solo para su autor. El servidor verifica tamaño y MIME de los metadatos de Storage antes de completar una carga; esto no inspecciona duración ni contenido binario. La publicación quedará vinculada a álbumes/mensajes en sus fases respectivas.

El servicio cliente ofrece reserva, subida, finalización, cancelación y URL temporal. El mantenimiento elimina cargas no publicadas caducadas y procesa una cola de borrado; la eliminación de cuenta espera sus archivos pendientes. 31 pruebas SQL/cliente pasan y Deno comprueba el worker actualizado. Pendientes: despliegue, cargas recuperables con progreso, miniaturas, inspección de duración, referencias desde contenidos, limpieza tras desvinculación y ensayo de cargas que finalizan simultáneamente con una cancelación. Esta base no significa que álbumes ni adjuntos ya estén disponibles en la interfaz.

### Precisión compartida implementada localmente

Corrección de alcance solicitada por el usuario: aproximada debe conservar utilidad. Ahora guarda historial de zonas y horas, muestra áreas en ambos mapas y expresa distancias con incertidumbre. Los eventos de lugares concretos pueden habilitarse de forma independiente mediante consentimiento explícito; el selector explica qué revelan. El servidor conserva solo coordenadas redondeadas para los nuevos puntos aproximados y sigue ocultando a la pareja el historial preciso anterior mientras se comparte de forma aproximada. El mapa descarta el historial mostrado al cambiar de nivel y evita que una petición antigua vuelva a mostrarlo.

Esta corrección sustituye la suspensión total de historial descrita en el párrafo histórico siguiente. La migración de precisión `20260911000200_shared_precision.sql` aún está pendiente de aplicar. Pasan 30 pruebas, ESLint, TypeScript y arquitectura. No es necesario repetir el SQL de pausa de lugares por este cambio.

La migración `20260911000200_shared_precision.sql`, posterior a la de pausa de lugares, incorpora el selector precisa/aproximada. En aproximada redondea coordenadas a una cuadrícula de 0,01 grados antes de guardar/publicar, amplía la incertidumbre y retira velocidad y rumbo. Suspende nuevos puntos de historial y eventos de lugares; la baja precisión resultante evita generar recorridos. Las políticas restrictivas ocultan a la pareja el historial y los recorridos anteriores mientras se use aproximada, conservándolos para su propietario. La app detiene regiones y evita el muestreo GPS de alta precisión en este modo.

Las pruebas consultan datos como la pareja después de publicar una muestra y verifican coordenadas redondeadas, ausencia de velocidad/rumbo y restricciones de historial/recorridos. Pendiente: despliegue, prueba nativa, tratamiento de cachés y proyecciones antiguas de eventos en chat/avisos, precisión aproximada impuesta exclusivamente por el sistema y etiquetado de distancias aproximadas. No se considera cerrada toda la fase 1.

1. Privacidad efectiva, pausa completa y bases comunes de eventos y multimedia.
2. Inicio, check-in y variantes de afecto.
3. Preguntas diarias y planes compartidos.
4. Álbumes, cronología y efemérides.
5. Chat: respuestas, reacciones, fijados, multimedia y voz.
6. Sesiones temporales de llegada con consentimiento y caducidad.
7. Resumen semanal.
8. Widgets Android/iOS informativos y acciones autenticadas.

No se consideran completadas las fases pendientes por disponer de este registro. Cada entrega requiere la evidencia especificada en el plan, incluido despliegue y prueba en dispositivos cuando corresponda.

### 12 de septiembre: estado unificado y apoyo escrito

Estado e Inicio comparten ahora el editor de check-in. El ánimo y la frase se proyectan al perfil que usa el marcador del mapa, con la misma caducidad al terminar el día de Madrid. Retirar el check-in adelanta su caducidad; volver a publicarlo el mismo día conserva su identificador y no duplica el aviso. Las respuestas permiten texto libre de hasta 280 caracteres además de los gestos rápidos. La pantalla de Estado actualiza la caducidad solo mientras está visible y la app está activa.

Preparada la migración `20260912000300_checkin_status.sql`, pendiente de aplicar después de las anteriores. También se ajustó `20260912000100_daily_checkins.sql` (sin despliegue confirmado) para restaurar la caducidad al volver a publicar. No se ha modificado la migración de lugares ya ejecutada por el usuario. Las pruebas verifican proyección al perfil, caducidad, retirada solo por el autor, restauración, frases de 280 caracteres, ausencia de avisos de estado duplicados y conservación de un estado posterior escrito por un cliente antiguo.

Validación local: 33 pruebas, ESLint, TypeScript y comprobación de arquitectura/SQL correctos. No se ha aplicado SQL remoto ni validado esta interfaz nueva en un móvil. Siguen pendientes el feed Hoy, preferencias de gestos y las restantes fases del plan; este avance no cierra la fase 2.

### 12 de septiembre: actividad Hoy y observadores visibles

Inicio presenta días juntos, rachas, check-in, gestos, actividad Hoy y la tarjeta secundaria de ubicación. Hoy muestra hasta cinco elementos del día de Madrid a partir de los últimos 50 mensajes/eventos, con autor, hora y acceso al chat. Reutiliza `watchMessages` mediante `homeService`; no copia acontecimientos a otra tabla. Los títulos de eventos se comparten con Chat y el resumen no replica el texto privado de mensajes ni direcciones.

Inicio y Chat suscriben sus datos únicamente al estar enfocados. Los componentes de check-in e historial Hoy se desmontan al ocultarse; Estado aplica la misma regla. Los observadores compartidos descartan eventos tardíos de conexiones cerradas, incluida la reconexión después de segundo plano. La última suscripción libera el canal. No se ha medido todavía el impacto energético real de este cambio.

Validación local: 36 pruebas, ESLint, TypeScript y arquitectura/SQL correctos. Las nuevas pruebas cubren medianoche de Madrid, cambio de hora, orden/deduplicación del feed y reutilización/cierre de canales. Este bloque no necesita otra migración SQL. Pendientes: interfaz en dispositivos, háptica opcional y preferencias de gestos; las preguntas del día, planes y fases siguientes conservan el alcance del plan.

### 12 de septiembre: respuesta háptica opcional

Ajustes incorpora Gestos de afecto, con dos opciones locales por cuenta y teléfono: vibrar al enviar y vibrar al recibir con la app abierta. Ambas empiezan desactivadas. La recepción reutiliza el observador compartido de mensajes y lo desconecta cuando se desactiva la opción o la app pasa a segundo plano. No hay un servicio de vibración en segundo plano. La carga inicial y las reconexiones establecen una referencia sin reproducir el historial; se recuerdan hasta 100 identificadores, sin texto, para descartar duplicados. Los fallos del módulo háptico no cambian el resultado de un envío.

Se añadió `expo-haptics ~57.0.3`; para usarlo hace falta un cliente nativo que lo incluya. Los clientes anteriores omiten el efecto si el módulo no está disponible. Se usan efectos del sistema recomendados por la documentación de Expo (https://docs.expo.dev/versions/latest/sdk/haptics/); su resultado depende del dispositivo y de sus ajustes. El interruptor de avisos se renombró Gestos de afecto para incluir los cuatro tipos. Los avisos de check-in ahora reconocen Inicio como destino válido.

Validación local: 37 pruebas, ESLint, TypeScript y arquitectura correctos. Prueba añadida: historial inicial, duplicados, gesto propio, antigüedad, fecha futura, reinicio y regreso desde segundo plano. Pendiente la comprobación física de la vibración en Android/iOS. La compilación nativa se registra por separado al terminar.

### 15 de septiembre: compilación Android y primera integración de preguntas

Se volvió a ejecutar `:app:assembleDebug -Pkotlin.incremental=false --console=plain --quiet` después de comprobar que la sesión anterior ya no existía. Gradle terminó con código 0; el cliente de desarrollo en `android/app/build/outputs/apk/debug/app-debug.apk` incluye `expo-haptics` en la lista generada de módulos. No equivale a una prueba física de vibración ni a una compilación iOS.

Preparada `20260915000100_daily_questions.sql`, pendiente de despliegue: catálogo inicial de seis preguntas, selección única por pareja/día de Madrid, categorías divertida/romántica/profunda, respuestas privadas mediante RLS y revelación transaccional bajo bloqueo de la pregunta. La respuesta tiene versión para rechazar ediciones obsoletas. Los reintentos con el mismo contenido no duplican la revelación, el evento en chat ni los avisos. La tabla de respuestas no se publica por Realtime: el cliente vuelve a consultarla con RLS cuando cambia la pregunta.

La nueva pantalla Preguntas se abre desde Inicio sin otra pestaña principal. Permite elegir categoría, publicar, editar antes de revelar y consultar ambas respuestas después. Usa teclado adaptado, estados de carga/error, aviso de servidor pendiente y suscripción/timer solo en pantalla visible. Cambiar de día crea un observador con identidad distinta para no recuperar la pregunta anterior de caché.

Validación: 38 pruebas locales pasan, incluida lectura directa como pareja/tercero, prohibición de escritura directa, versiones, reintentos y pregunta caducada. Estas pruebas usan PGlite y no sustituyen pruebas con dos transacciones concurrentes en PostgreSQL desplegado. Pendientes de fase 3: categorías personalizadas, preferencias y consentimiento íntimo mutuo, saltar explícitamente, recuerdo opcional, planes compartidos, navegación a preguntas históricas desde eventos y validación real de interfaz/notificaciones. No se considera completa esta fase.

### 15 de septiembre: pasar y retomar preguntas

La pantalla permite pasar la pregunta del día y retomarla antes de su cierre. Pasar elimina únicamente la respuesta propia todavía privada. La elección de pasar solo puede leerla su autor; no produce avisos ni modifica rachas. La operación toma el mismo bloqueo que responder, de modo que no puede retirar una respuesta después de una revelación ya confirmada. Se amplió la migración de preguntas todavía pendiente de despliegue con `question_skips` y `skip_daily_question`.

Las pruebas cubren retirada, reintento, privacidad de la elección, impedimento de responder hasta retomar y ausencia de revelación mientras falta una respuesta. Siguen pendientes categorías personalizadas, consentimiento íntimo, recuerdos y planes, además de despliegue y validación física.

### 15 de septiembre: pregunta personalizada

Se puede escribir una pregunta propia de hasta 500 caracteres desde Preguntas, antes de elegir la del día. Conserva el mismo flujo de respuestas privadas y revelación. `20260915000200_custom_questions.sql` es una migración aditiva pendiente de aplicar después de la base de preguntas. La RPC verifica pareja, usuario esperado y día esperado, toma el bloqueo de pareja que utiliza la selección del catálogo y rechaza sustituir una pregunta existente. Repetir el mismo texto devuelve la pregunta ya creada.

La prueba SQL de preguntas incluye creación personalizada, reintento, elección ya ocupada, día anterior, cambio de cuenta y acceso de terceros. Pendientes: consentimiento y preferencias de la categoría íntima, recuerdos opcionales, planes y la validación real de toda la fase 3. No se ha ejecutado esta migración en el servidor.

### 15 de septiembre: categorías de preguntas y consentimiento mutuo

Ajustes permite activar o desactivar cada categoría. Las opciones disponibles para elegir una pregunta son la intersección de las preferencias de ambos miembros. Íntimas comienza desactivada y exige que cada persona confirme expresamente tener al menos 18 años y querer participar. Se guarda la fecha de esa declaración; no es una verificación documental de edad. Desactivar retira la disponibilidad para elecciones futuras. La pregunta ya elegida se conserva, como explica la interfaz, y puede pasarse.

Preparada `20260915000300_question_preferences.sql`, pendiente de despliegue tras las dos migraciones de preguntas. El servidor comprueba categorías al insertar cualquier pregunta, incluidas las personalizadas, bajo el bloqueo de pareja utilizado por las operaciones de selección y preferencias. El cliente solo recibe sus preferencias y las categorías disponibles en común; no puede leer directamente las preferencias individuales de otro usuario. No se emiten avisos por cambiar opciones.

Pruebas añadidas al caso SQL de preguntas: consentimiento ausente, declaración de edad omitida, aceptación unilateral, aceptación mutua, revocación para nuevas elecciones, cuenta equivocada, categoría personalizada desactivada y aislamiento de terceros. ESLint, TypeScript y arquitectura pasan. Continúan pendientes recuerdos opcionales, planes, navegación histórica y validación desplegada/en dispositivos de esta fase.
