# Android release

El proyecto conserva `android/` en Git. Los builds usan esa configuración nativa;
no ejecutes `expo prebuild --clean`, ya que sustituiría las personalizaciones.

## Compilación local

Instala las dependencias con `npm ci` y los componentes Android SDK solicitados
por Gradle desde Android Studio. Usa el JDK 21 de Android Studio o configura
`JAVA_HOME`; configura `ANDROID_HOME` si el SDK está en una ubicación distinta.
En Windows los scripts detectan las ubicaciones predeterminadas de Android Studio y del SDK.

La firma existente está en `android/keystore.properties` y el keystore está en
`android/app/`. Ambos son privados y están excluidos de Git. En otro equipo,
copia `android/keystore.properties.example` a `android/keystore.properties` y
rellena sus cuatro valores con las credenciales de la misma clave. `storeFile`
se resuelve desde `android/`; para rutas Windows usa `/`.
Guarda una copia segura del keystore y sus contraseñas: son necesarios para
seguir actualizando la aplicación con la misma firma.

También se pueden proporcionar estas variables de entorno o propiedades Gradle
(entorno tiene prioridad, después Gradle y finalmente el archivo local):

- `COUPLEAPP_UPLOAD_STORE_FILE`
- `COUPLEAPP_UPLOAD_STORE_PASSWORD`
- `COUPLEAPP_UPLOAD_KEY_ALIAS`
- `COUPLEAPP_UPLOAD_KEY_PASSWORD`

Los scripts cargan el entorno de producción de Expo antes de arrancar Gradle,
de modo que JavaScript y el manifiesto reciban la misma configuración. Para
sobrescribir el backend o añadir Maps usa `.env.production.local` (ignorado):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://tu-backend.example.com
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR
GOOGLE_MAPS_ANDROID_API_KEY=REEMPLAZAR
# Opcional si ya existe android/app/google-services.json:
# GOOGLE_SERVICES_JSON=C:/ruta/google-services.json
```

La clave de Maps debe permitir `com.esc.coupleapp` y la huella SHA-1 del
certificado de firma. Para Play App Signing, registra también el certificado
de firma de Google Play. El archivo Firebase debe incluir ese paquete; las
credenciales de envío FCM se configuran aparte en Expo/backend. Las claves
públicas de cliente se incluyen en el binario; nunca uses claves privadas de Supabase.

```sh
npm run android:release:apk
npm run android:release:aab
```

- APK instalable: `android/app/build/outputs/apk/release/app-release.apk`.
- AAB para Google Play: `android/app/build/outputs/bundle/release/app-release.aab`.

Ambos incluyen el bundle JavaScript y funcionan sin Metro. No hay fallback a
la firma debug. Si falta la firma, Gradle detiene la compilación release.
Una instalación debug con el mismo paquete y otra firma no puede actualizarse
directamente con este APK; usa un dispositivo de prueba o desinstálala antes
(la desinstalación elimina los datos locales).

Antes de publicar una actualización, incrementa `versionCode` en
`android/app/build.gradle` y actualiza `versionName` y `expo.version` en
`app.json`. No reutilices un `versionCode` ya publicado.

## EAS Build

`preview` genera APK y `production` genera AAB con incremento remoto de versión:

```sh
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform android --profile production
```

EAS inyecta la firma administrada en su servidor. Si quieres actualizar las
instalaciones locales con los builds EAS, importa la misma clave mediante
`npx eas-cli@latest credentials --platform android`. Configura Maps y, si hace
falta, `GOOGLE_SERVICES_JSON` como variable de archivo en el entorno EAS
correspondiente. Los archivos `.local` y las credenciales locales ignoradas no
se suben automáticamente. La cuenta Expo debe tener acceso al proyecto de `app.json`.

## Verificación

Ejecuta `npm run doctor`, `npm run typecheck`, `npm run lint` y `npm test`.
Después instala el APK en un dispositivo y comprueba inicio sin Metro, sesión,
mapa, ubicación en segundo plano y notificaciones. Una compilación correcta no
verifica los permisos ni las credenciales remotas en un teléfono real.

Referencias: [firma Android en React Native](https://reactnative.dev/docs/signed-apk-android)
y [proceso Android de EAS](https://docs.expo.dev/build-reference/android-builds/).
