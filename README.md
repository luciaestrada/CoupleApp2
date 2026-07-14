# Couple App

App multiplataforma (iOS/Android) tipo Couple360, construida con Expo (React Native) + Firebase.

## Estructura

```
couple-app/
  App.js                    # entry point
  app.json                  # config Expo (permisos, bundle IDs)
  package.json
  src/
    firebase/                # config, reglas de seguridad, modelo de datos
    context/                 # AuthContext, CoupleContext (estado global en tiempo real)
    services/                # racha, distancia, geofencing, notificaciones
    components/              # StreakBadge, DistanceCard, DaysCounter
    screens/                 # Home, Chat, Historias, Estado, Fechas especiales, Lugares
    navigation/               # navegación por pestañas
  functions/                 # Cloud Functions (racha, historias caducadas, recordatorios, geofence)
  widgets/                   # referencia nativa para widgets (no ejecutable desde Expo Go)
    ios/CoupleWidget.swift
    android/CoupleWidget.kt
```

## Puesta en marcha

1. `npm install` dentro de `couple-app/`
2. Crear proyecto en [Firebase Console](https://console.firebase.google.com), habilitar Firestore, Auth, Storage y Cloud Messaging
3. Sustituir las credenciales en `src/firebase/config.js`
4. Desplegar reglas: `firebase deploy --only firestore:rules` (usando `src/firebase/firestore.rules`)
5. Desplegar functions: dentro de `functions/`, `npm install` y `firebase deploy --only functions`
6. `npx expo start` para probar en Expo Go (los widgets y el geofencing en segundo plano requieren un build nativo, ver abajo)

## Limitaciones importantes

- **Widgets de pantalla de bloqueo/inicio**: no se pueden probar en Expo Go. Requieren `npx expo prebuild` para generar los proyectos nativos `ios/` y `android/`, y luego añadir manualmente los targets de WidgetKit (Xcode) y Glance (Android Studio) usando los archivos de referencia en `widgets/`. Es la parte de mayor esfuerzo de desarrollo nativo.
- **Ubicación en segundo plano en iOS**: Apple exige justificación clara en la revisión de App Store para `NSLocationAlwaysAndWhenInUseUsageDescription`; probable que pidan capturas de pantalla mostrando el uso.
- **Autenticación y emparejamiento de pareja**: no incluido en este scaffold — falta la pantalla de login/registro y el flujo de "invitar a mi pareja" (código de invitación) para crear el documento `couples/{coupleId}` con los dos `uid`.
- **Push notifications reales**: el envío usa la API de Expo Push; para producción a gran escala conviene revisar cuotas y considerar FCM directo.

## Siguientes pasos sugeridos

1. Pantalla de login (email/Google) + flujo de emparejamiento con código de invitación
2. `expo prebuild` y configuración de los widgets nativos
3. Pruebas de geofencing en dispositivo físico (no funciona en simulador/emulador)
4. Pulir UI/UX (paleta de colores, animaciones de racha, transición de historias)
