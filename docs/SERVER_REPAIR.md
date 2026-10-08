# Reparación de Supabase en Docker

El diagnóstico remoto detectó que `maintenance` devuelve HTTP 500 porque el runtime
no encuentra un punto de entrada. `push` arranca y exige autenticación. Este paquete
contiene los dos workers y sus archivos compartidos, las migraciones y un script
para desplegarlos en una instalación Linux con Docker Compose.

## Ejecución

1. Copia `coupleapp-server-repair.zip` al servidor Linux y descomprímelo en una
   carpeta separada de la instalación de Supabase.
2. Desde esa carpeta, sustituye `/ruta/supabase/docker` por la carpeta que contiene
   el `docker-compose.yml` de tu instalación:

```bash
bash scripts/repair-server.sh --compose-dir /ruta/supabase/docker
bash scripts/repair-server.sh --compose-dir /ruta/supabase/docker --apply
```

El primer comando diagnostica. El segundo guarda una copia en
`coupleapp-repair-backups`, copia `push`, `maintenance` y `_shared` al montaje que
Docker usa para las funciones y reinicia el servicio `functions`. Conserva `main`
y las demás funciones. Comprueba HTTP 401 sin credenciales para verificar arranque
y autenticación. Necesita acceso a Docker y permisos de escritura en ese montaje.
Requiere Bash, Python 3, curl y tar. Se detiene si faltan la configuración del
runtime o sus nuevas claves secretas; no inventa ni modifica credenciales.

Si los servicios tienen otro nombre, usa `--functions-service NOMBRE` y
`--db-service NOMBRE`. Para otro dominio, usa `--url https://tu-dominio`.

## Base de datos

El despliegue predeterminado no modifica la base de datos. La tabla de diagnóstico
muestra contratos SQL que faltan. Si faltan, las funciones pueden arrancar pero las
operaciones de la app todavía pueden fallar.

Solo si conoces la última migración aplicada, puedes añadir
`--migrate-after YYYYMMDDHHMMSS --apply`. Antes de ejecutar las migraciones más
recientes se guarda un `pg_dump`. Confirma la versión usando tus registros de
despliegue: la presencia de una tabla aislada no acredita una versión completa.
Una migración que falla detiene el script; conserva la copia y revisa el error
antes de repetir. No se incluye ni se ejecuta `setup.sql`.

## Restaurar archivos de funciones

El script imprime el montaje de funciones y la carpeta de la copia. Para restaurar
sus archivos, extrae `functions-before.tar.gz` sobre ese mismo montaje y reinicia
`functions` desde la carpeta de Compose. Si aplicaste migraciones, la restauración
de la base de datos es una operación separada que debe planificarse con el dump.

## Alcance

Una respuesta 401 no prueba la entrega push ni que cron esté configurado. La
configuración de los trabajos y las credenciales móviles se describe en
`docs/IMPLEMENTACION_ESTADO.md` del proyecto. El script no envía notificaciones,
ejecuta trabajos de limpieza ni modifica cron o Vault.

El paquete se regenera en Windows con:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-server.ps1
```

Se excluyen `.env`, credenciales y el instalador de base de datos.
