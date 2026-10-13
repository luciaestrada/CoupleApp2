import React from 'react';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import Constants, { AppOwnership } from 'expo-constants';
import StartupBoundary from './src/components/StartupBoundary';

// Keep task definitions at module scope for background launches, but do not
// let an optional native module or invalid configuration prevent registration.
let Application;
let startupError;
try {
  Application = require('./App').default;
} catch (error) {
  startupError = error;
}

if (
  Platform.OS === 'android' &&
  Constants.appOwnership !== AppOwnership.Expo
) {
  require('./src/features/widgets/android/widgetTaskHandler');
}

function Root() {
  return (
    <StartupBoundary startupError={startupError}>
      {Application ? <Application /> : null}
    </StartupBoundary>
  );
}

registerRootComponent(Root);
