# Diagnóstico de avisos push — 28/09/2026

## Fallo comprobado

El usuario confirma que los eventos del iPhone aparecen en el chat, pero no
recibe notificaciones push en el Xiaomi. Los canales Android de caminar,
bicicleta, vehículo, reposo, entradas y salidas están habilitados.

Consultas HTTP GET, sin credenciales y sin enviar avisos, contra el backend
configurado en el proyecto:

| Endpoint | Resultado |
| --- | --- |
| `/functions/v1/push` | HTTP 500 |
| `/functions/v1/maintenance` | HTTP 500 |

Ambos devuelven:

```text
InvalidWorkerCreation: worker boot error: failed to bootstrap runtime:
could not find an appropriate entrypoint
```

El runtime no consigue arrancar estas funciones. Es un bloqueo comprobado
anterior al envío a Expo/FCM. La presencia de eventos en el chat no verifica
el funcionamiento de ese envío. Puede haber otros problemas de configuración
que solo se podrán comprobar después de reparar el arranque.

## Siguiente intervención en el servidor

1. Identificar el despliegue y el volumen real de Edge Functions. Revisar los
   registros del servicio y la ruta de entrada que intenta cargar.
2. Comprobar que existen y son legibles `push/index.ts`,
   `maintenance/index.ts`, `_shared/database.types.ts`, `deno.json` y
   `deno.lock`, conservando la estructura de `supabase/functions`.
   En un despliegue Docker estándar, las funciones se instalan bajo
   `volumes/functions/<nombre>/index.ts`; verificar el montaje antes de copiar.
   No sustituir el enrutador `main` propio del servidor.
3. Comprobar que el runtime admite las funciones actuales y su autenticación
   de servidor. Conservar las claves secretas únicamente en servidor.
4. Tras corregir la instalación, verificar que ya no hay error de arranque.
   Las peticiones sin credenciales deben seguir siendo rechazadas.
5. Revisar el scheduler, los ajustes de entrega y `notification_deliveries`
   (estado y `last_error`); comprobar las credenciales FCM en Expo/EAS si los
   tickets o receipts informan de errores. No mostrar tokens ni claves.
6. Validar una notificación autorizada en el Xiaomi y distinguir aceptación
   por el proveedor de recepción visible en el dispositivo.

No ejecutar `setup.sql`
para reparar este fallo: reconstruye datos y no resuelve el archivo de arranque.

## Confirmación desde Supabase Studio en Chrome

El 28/09/2026 por la noche se accedió al panel autenticado y se ejecutaron
consultas SELECT de diagnóstico, sin mostrar tokens ni claves:

- El listado de Edge Functions contiene únicamente `hello`.
- `notification_deliveries` no contiene filas.
- Hay dos dispositivos Android con token push y un iPhone sin token push.
  La ausencia del token del iPhone afecta a su recepción, no a los eventos
  que genera para el Xiaomi.
- Los trabajos `coupleapp-push-worker` (cada minuto) y
  `coupleapp-maintenance-worker` (cada cinco minutos) están activos.
- En Vault no existen `coupleapp_functions_url` ni `coupleapp_scheduler_key`.
  Las funciones SQL de invocación salen sin llamar al worker si faltan.
- Existen avisos recientes de entrada, salida, caminar, reposo, chat y amor
  con `push_enabled_at_creation=true`: la preferencia no está bloqueándolos.

Studio no ofrece crear ni desplegar funciones en la interfaz observada.

## Reparación en Docker — 29/09/2026

Se accedió a la consola de Proxmox facilitada por el usuario: LXC 115,
contenedor `supabase-edge-functions`, runtime `v1.74.0`. El volumen de
funciones está en `/opt/supabase/docker/volumes/functions`.

- Se instaló `push/index.ts` como JavaScript compilado desde el TypeScript
  del repositorio, conservando el import de `@supabase/server@1.5.3` y
  `auth: 'secret'`. La compilación elimina la dependencia exclusiva de tipos
  `../_shared/database.types.ts`. Artefacto local: `.expo/push.deploy.js`.
- No se modificó el router `main` ni se reiniciaron los servicios.
- Se configuró `coupleapp_functions_url=http://kong:8000/functions/v1` en
  Vault y se reutilizó la clave `default` existente de `SUPABASE_SECRET_KEYS`
  para `coupleapp_scheduler_key`, íntegramente dentro del servidor.
- GET sin credenciales: HTTP 401. GET autenticado: HTTP 405, coherente con
  el método POST requerido.
- `public.invoke_push_worker()` produjo HTTP 200: 22 tickets aceptados,
  cero fallos y cero errores. Esto confirma aceptación de Expo, no por sí
  solo visualización de los avisos en el Xiaomi.
- El teléfono no estaba conectado a ADB durante esta verificación.

La función `maintenance` sigue sin desplegar; es una tarea distinta que
limpia datos caducados y solicitudes de borrado. Su cron comparte los
valores de Vault, por lo que ahora puede intentar invocarla y recibir el
error de arranque ya documentado. No bloquea `push`.

Referencia de despliegue:
[Supabase: funciones en instalaciones propias](https://supabase.com/docs/guides/self-hosting/self-hosted-functions).
