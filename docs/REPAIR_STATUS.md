# Estado de la reparación — 8 de octubre de 2026

## Servidor

El diagnóstico remoto observó HTTP 200 en Auth, HTTP 401 en `push` sin
credenciales y HTTP 500 en `maintenance`, con error de punto de entrada al crear
el worker. El permiso denegado para consultar perfiles con la clave pública no
justifica abrir la tabla a usuarios anónimos.

`scripts/repair-server.sh` despliega los workers en Linux/Docker Compose con copia
de seguridad. Está probado con Docker simulado; no se ha ejecutado en el servidor
real. El ZIP incluye los workers, migraciones, diagnóstico e instrucciones, sin
`.env` ni `setup.sql`. Véase `docs/SERVER_REPAIR.md`.

## App

Se han corregido la limpieza al cerrar sesión, resultados de caché que sobrevivían
al cambio de cuenta, recuperación de subidas de historias pendientes y una ruta de
importación incompatible con Metro. Se han tipado los contextos, servicios y
estados de ubicación, geocercas, planes y otros contratos compartidos. Las
respuestas de ubicación y creación de lugares ahora se validan antes de usarlas.
Expo y los módulos nativos se han actualizado a las versiones compatibles.

Validación realizada:

- 70 pruebas aprobadas, incluida copia y despliegue del servidor con Docker simulado.
- `doctor`, `verify`, `lint`, `types:check` y `backend:typecheck` aprobados.
- Exportaciones Android e iOS con Metro/Hermes completadas.
- `typecheck` todavía falla con 407 errores, frente a los 922 iniciales. Quedan
  principalmente notificaciones, recordatorios, preguntas y componentes de ajustes.
- La actualización compatible de dependencias eliminó el aviso crítico de npm;
  el auditor sigue mostrando 35 avisos transitivos (15 moderados y 20 altos).

Las exportaciones no sustituyen una compilación nativa ni una prueba en dispositivo.
Los cambios de módulos nativos requieren recompilar la app. Aún no se puede
considerar terminada la reparación completa de la app ni del servidor remoto.
