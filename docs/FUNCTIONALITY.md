# Inventario histórico de CoupleApp (2026-08-13)

Este documento conserva la revisión anterior. Para el comportamiento actual, los cambios de septiembre y las pruebas, consultar [IMPLEMENTACION_ESTADO.md](IMPLEMENTACION_ESTADO.md). Las frecuencias de ubicación y el sistema de notificaciones descritos aquí han sido sustituidos.

Documento de referencia del comportamiento implementado en el repositorio. La fecha del inventario
es 2026-08-13. El estado describe lo que puede demostrarse en el código actual; no presupone que
`supabase/setup.sql` o la Edge Function ya estén desplegados en una instancia concreta.

## Leyenda

- **Operativa**: el flujo está implementado de extremo a extremo y tiene una comprobación local.
- **Parcial**: existe y funciona en el caso principal, pero conserva una carencia identificada.
- **Externa**: el código está preparado, pero el resultado depende de infraestructura o permisos.
- **No implementada**: el modelo puede contener datos relacionados, pero no existe un flujo de uso.

## Resumen funcional

| Área | Estado actual | Implementación | Evidencia o dependencia |
| --- | --- | --- | --- |
| Configuración de entorno | Operativa | Valida URL HTTPS/base y clave `sb_publishable_...` antes de crear el cliente | `src/config/environment.js`, bundle Android/iOS |
| Persistencia de sesión | Operativa | Supabase Auth persiste en SQLite y refresca tokens solo con la app activa | `src/supabase/client.js` |
| Registro y acceso | Operativa | Alta con nombre, email y contraseña; acceso por email; contempla confirmación por correo | `AuthScreen`, `AuthContext` |
| Recuperación de errores de cuenta | Operativa | La pantalla global permite reintentar la sesión o el perfil y evita acciones duplicadas | `AuthContext`, `AppNavigator`, `FullScreenError` |
| Perfil | Operativa | El trigger crea el perfil y Realtime actualiza el perfil propio | `profileService`, `handle_new_user` |
| Avatar | No implementada | Existe `profiles.avatar_url`, pero no hay carga ni edición en la app | `supabase/setup.sql` |
| Crear pareja | Operativa | Genera código hexadecimal de 8 caracteres y guarda fecha de inicio | `PairingScreen`, RPC `create_couple` |
| Unirse a pareja | Operativa | Valida, bloquea y consume el código de forma transaccional | RPC `join_couple` |
| Espera de emparejamiento | Operativa | Realtime detecta al segundo miembro y cambia automáticamente a la app principal | `watchMyCouple` |
| Cancelar invitación | Operativa | Solo el creador puede eliminar una pareja aún incompleta | RPC `cancel_pending_couple` |
| Cuenta, permisos y cierre de sesión | Operativa | Muestra perfil/relación, servicios del dispositivo, notificaciones y dos niveles de ubicación, reparación mediante Ajustes y cierre de Auth | `AccountScreen`, `permissionService`, `AuthContext` |
| Días de relación | Operativa | Diferencia de días de calendario desde `start_date` | `dateUtils`, `HomeScreen` |
| Rachas diarias individuales | Operativa | Cada miembro tiene su propio contador; enviar amor avanza solo el suyo una vez al día | `couple_members`, `send_love`, `reset_broken_streaks` |
| Mensajes de amor | Operativa | Una confirmación nueva también crea un mensaje de tipo `love` | RPC `send_love` |
| Chat | Operativa | Mensajes en vivo, validación y límite de 200; la lista abre por el mensaje más reciente | `ChatScreen`, `chatService` |
| Ubicación y distancia | Operativa en primer plano | Solicitud contextual, acceso a Ajustes si se bloquea, publicación cada 5 minutos y caducidad a los 15 | `permissionService`, `locationService`, `HomeScreen` |
| Historias | Operativa | Selección, subida privada, registro por RPC, URL firmada y caducidad a las 24 horas | `StoriesScreen`, `storiesService` |
| Limpieza de historias | Externa | `maintenance` elimina archivo y fila en lotes; requiere despliegue e invocación periódica | Edge Function y scheduler externo |
| Estados de 24 horas | Operativa | Texto/emoji propio, lectura del estado de la pareja, caducidad y retirada manual | `StatusScreen`, `statusService` |
| Fechas especiales | Operativa | Alta, lista y borrado; recurrencia y aviso entre 0 y 365 días configurables | `SpecialDatesScreen`, `specialDatesService` |
| Avisos de fechas | Externa | `pg_cron` encola a las 09:00 de Madrid y `maintenance` entrega por Expo Push | `queue_special_date_notifications` |
| Lugares/geofences | Operativa con permisos nativos | Alta/borrado, máximo de 20, sincronización al arrancar y ventana anti-duplicados de 15 minutos | `App`, `GeofenceSetupScreen`, `locationTask` |
| Avisos de llegada | Externa | Un evento encola una notificación para la pareja; requiere permisos permanentes, build nativo y `maintenance` | `record_geofence_entry`, trigger SQL |
| Notificaciones push | Operativa con infraestructura | No muestra prompts al arrancar; registra el token tras autorización explícita y reintenta entregas hasta 5 veces | `AccountScreen`, `notificationService`, `maintenance` |
| Realtime | Operativa | Recarga inicial, por cambios y tras reconectar; cada watcher usa una instancia de canal única para admitir observadores simultáneos y remontajes | `realtimeService`, `realtimeChannel`, `coupleService` |
| RLS y escrituras | Operativa | El cliente solo consulta tablas; las escrituras derivan identidad y pareja desde `auth.uid()` | Políticas y funciones `security definer` |
| Storage privado | Operativa | Bucket privado, 10 MiB, MIME limitado, lectura por pareja y escritura en carpeta propia | Políticas de `storage.objects` |
| Widgets Android/iOS | No implementada | Los prototipos heredados se eliminaron y no existe integración nativa activa | Estado del repositorio |

## Flujos de usuario

### 1. Arranque y autenticación

1. El cliente valida las dos variables públicas y crea una sola instancia de Supabase.
2. Auth recupera la sesión persistida y activa/refrena el auto-refresh con `AppState`.
3. Sin sesión se muestra registro/acceso. Con sesión se observa el perfil propio.
4. El registro envía `name` como metadata; un trigger crea `public.profiles`.
5. Al cerrar sesión se elimina el token Expo Push asociado antes de invalidar Auth.

Dependencias externas: proveedor SMTP y política de confirmación configurados en Supabase Auth.

### 2. Pareja

- Una cuenta solo puede pertenecer a una pareja gracias a `unique (user_id)`.
- La creación usa un código aleatorio y reintenta colisiones.
- La unión bloquea la fila de pareja para impedir que dos usuarios consuman el mismo código.
- Una pareja pendiente puede cancelarse únicamente por quien la creó.
- Todas las pantallas principales exigen exactamente dos miembros.

No existe actualmente un flujo para abandonar o disolver una pareja completa.

### 3. Inicio, racha y distancia

- `daysTogether` usa días de calendario y nunca devuelve valores negativos.
- `send_love` es idempotente por usuario/día mediante una restricción única.
- Cada fila de `couple_members` conserva su contador y última fecha de amor; la del usuario se
  bloquea antes de calcular su siguiente valor.
- La actividad de la otra persona no condiciona ni incrementa la racha propia.
- Un cron diario pone a cero solamente las rachas personales que hayan perdido un día.
- La distancia usa Haversine y solo se muestra si ambas ubicaciones tienen menos de 15 minutos.
- La ubicación normal se solicita desde Inicio y publica solo en primer plano; geofencing solicita
  por separado el acceso permanente y usa una tarea nativa.

### 4. Chat

- Solo una pareja completa puede enviar mensajes.
- El servidor deriva `sender_id`; el texto se recorta y limita a 2000 caracteres.
- Se cargan los últimos 200 mensajes y se actualizan con Realtime.
- Los mensajes `love` comparten la misma lista y se representan con un corazón.

No hay paginación, adjuntos, edición, borrado ni confirmaciones de lectura.

### 5. Historias

- Admite JPEG, PNG, WebP, HEIC y HEIF hasta 10 MiB.
- La ruta es `couple_id/user_id/timestamp.ext`; SQL comprueba ruta y existencia del objeto.
- Si falla el registro SQL, el cliente intenta eliminar el archivo subido.
- Las lecturas usan URL firmada con una vida máxima igual al tiempo restante de la historia.
- El cliente retira historias al vencer y `maintenance` elimina los datos persistentes.

No hay borrado manual, texto, vídeo ni reacciones.

### 6. Estados

- Texto máximo de 60 caracteres y emoji máximo de 16.
- Se exige al menos texto o emoji.
- La caducidad es calculada como 24 horas desde `status_updated_at`.

El usuario puede retirar su estado antes de la caducidad; hacerlo borra texto, emoji y marca temporal.

### 7. Fechas especiales

- El modelo soporta fecha, recurrencia y antelación de 0 a 365 días.
- La interfaz expone recurrencia y antelación, calcula la próxima aparición y permite borrar.
- Para recurrencias del 29 de febrero, un año no bisiesto usa el último día de febrero.
- La cola evita duplicados por usuario, fecha objetivo y tipo de aviso.

No hay edición directa; para cambiar una fecha hay que borrarla y crearla de nuevo.

### 8. Lugares y geofencing

- Requiere ubicación permanente; antes de solicitarla se explica por qué y se obtiene primero el
  permiso de primer plano exigido por iOS/Android.
- Cada lugar guarda nombre, coordenadas y radio; la UI usa 150 metros.
- La tarea nativa solo procesa entradas y refresca la sesión antes de invocar SQL.
- La sesión emparejada sincroniza las regiones al arrancar y tras altas o bajas.
- Cliente y SQL limitan cada cuenta a 20 lugares, el máximo monitorizable de iOS.
- Entradas repetidas en una misma región durante 15 minutos reutilizan el evento previo.
- El trigger dirige el aviso al otro miembro de la pareja.

No hay edición directa del nombre, radio o coordenadas; se puede borrar y volver a guardar el lugar.

### 9. Permisos del sistema

- Cuenta muestra por separado notificaciones, servicios generales de ubicación, ubicación al usar
  la app y ubicación permanente.
- El arranque solo sincroniza tokens si notificaciones ya estaban autorizadas; nunca abre un prompt.
- Cada función solicita su permiso cuando el usuario la activa y respeta `canAskAgain`.
- Cuando el sistema bloquea nuevas solicitudes, la app ofrece abrir sus Ajustes directamente.
- Al volver a primer plano se releen los permisos y se reanudan token push y ubicación cuando procede.
- Denegar un permiso desactiva únicamente la función relacionada; no bloquea el resto de la app.
- Historias abre el selector de imágenes del sistema, que no requiere acceso global a la fototeca.

## Backend y seguridad

### Tablas

`profiles`, `push_tokens`, `couples`, `couple_members`, `messages`, `love_events`, `stories`,
`special_dates`, `locations`, `geofences`, `geofence_events` y `notifications`.

### Escrituras invocables por el cliente

`create_couple`, `join_couple`, `cancel_pending_couple`, `send_message`, `send_love`, `set_status`,
`set_push_token`, `publish_location`, `create_story`, `create_special_date`, `delete_special_date`,
`create_geofence`, `delete_geofence` y `record_geofence_entry`.

Las funciones revocan ejecución a `public` y solo se conceden a `authenticated`. Las funciones de
mantenimiento se conceden exclusivamente a `service_role`, que es el rol usado internamente por el
cliente administrativo creado desde una clave `sb_secret_...`.

### Edge Function

- Importa `withSupabase` desde `npm:@supabase/server`.
- Usa `auth: 'secret'`; `supabase/config.toml` declara `verify_jwt = false`.
- Reserva notificaciones con `for update skip locked` para impedir entregas concurrentes.
- Reintenta reservas abandonadas y errores temporales hasta cinco intentos.
- Considera `sent` un ticket aceptado por Expo Push; no consulta recibos posteriores de entrega.

## Configuración y operación externas

1. En una instalación nueva, ejecutar el instalador destructivo `supabase/setup.sql` tras realizar
   copia de seguridad. En una instancia existente, aplicar por orden solo los archivos pendientes de
   `supabase/migrations/`.
2. Habilitar `pg_cron` en PostgreSQL.
3. Configurar SMTP y confirmación de correo en Supabase Auth.
4. Desplegar `maintenance` sin verificación JWT de plataforma.
5. Invocar `maintenance` periódicamente con una clave `sb_secret_...` en `apikey`.
6. Configurar credenciales push de Apple/Google en EAS/Expo.
7. Usar development build o binario nativo para geofencing.

## Incidencias corregidas durante el inventario

| Prioridad | Incidencia corregida | Evidencia de cierre |
| --- | --- | --- |
| Alta | No se podía cerrar sesión desde la app emparejada | Pestaña `Cuenta` con progreso y tratamiento de error |
| Alta | Los geofences no se registraban hasta abrir `Lugares` | Sincronización ligada al arranque y estado de la pareja en `App` |
| Alta | No se limitaba ni protegía el número de geofences | Límite 20 en cliente/SQL, bloqueo transaccional y ventana anti-spam |
| Media | El chat abría por el inicio del historial cargado | Lista invertida alimentada en orden descendente por la consulta |
| Media | Fechas especiales ignoraba recurrencia y antelación | Controles, validación, cálculo de próxima aparición y borrado |
| Media | Un error temporal de Auth no tenía reintento | Recarga explícita de sesión o perfil en la pantalla global |
| Media | `maintenance` procesaba también GET/otros métodos | Solo POST ejecuta efectos; los demás métodos responden 405 |
| Media | Fallos de limpieza podían impedir entregar notificaciones | Las fases se aíslan, informan errores y conservan reintentos |
| Media | Watchers simultáneos o remontados reutilizaban un canal ya suscrito | Los nombres reciben un sufijo persistente por instancia antes de registrar callbacks |
| Alta | La racha era compartida y dependía de que ambos confirmaran | Contador y fecha viven en cada miembro; `send_love` actualiza solo `auth.uid()` |
| Alta | Los permisos se pedían al arrancar y los bloqueos no tenían recuperación | Solicitud contextual, panel de estado y acceso directo a Ajustes |
| Baja | La documentación sugería distancia en segundo plano | Se distingue publicación activa de geofencing nativo |

## Verificación local

Resultados de la pasada del 2026-08-13:

| Comprobación | Resultado | Cobertura |
| --- | --- | --- |
| `npm run doctor` | Correcta | Compatibilidad de versiones con Expo SDK |
| `npm run verify` | Correcta | SQL canónico, RLS, permisos de RPC, pantallas y contrato Edge |
| `npm test` | 8/8 | Fechas, zona Europe/Madrid, validación, distancia, Realtime y estados de permisos |
| `npm run typecheck` | Correcta | Configuración TypeScript del cliente |
| `npm run lint` | Correcta | Reglas Expo/React/JavaScript |
| `npm run bundle:android` | Correcta | Metro y bytecode Hermes Android |
| `npm run bundle:ios` | Correcta | Metro y bytecode Hermes iOS |
| Gradle `assembleDebug` | Correcta | Compilación nativa Android |
| Deno typecheck | No ejecutada | Deno no está instalado en el entorno local |

La comprobación no sustituye una prueba contra un proyecto Supabase desplegado, dos dispositivos
reales, credenciales push válidas y el scheduler de producción. `npm audit` también señala avisos
sin corrección disponible en dependencias transitivas del toolchain Expo/Metro; no se ha forzado una
actualización incompatible con el SDK validado por Expo Doctor.
