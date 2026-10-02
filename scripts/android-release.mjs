import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const format = process.argv[2];
if (!['apk', 'aab'].includes(format) || process.argv.length > 3) {
  console.error('Uso: node scripts/android-release.mjs apk|aab');
  process.exit(1);
}

process.chdir(root);
process.env.NODE_ENV = 'production';
const require = createRequire(import.meta.url);
require('@expo/env').load(root, { silent: true });
// Fail before Gradle if the JS application would fail on startup.
await import('../src/config/environment.js');

if (process.platform === 'win32') {
  const bundledJava = join(process.env.ProgramFiles || 'C:/Program Files', 'Android', 'Android Studio', 'jbr');
  if (!process.env.JAVA_HOME && existsSync(join(bundledJava, 'bin', 'java.exe'))) {
    process.env.JAVA_HOME = bundledJava;
  }
  const sdk = join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && existsSync(sdk)) {
    process.env.ANDROID_HOME = sdk;
  }
}

if (!process.env.GOOGLE_MAPS_ANDROID_API_KEY) {
  console.warn('Aviso: falta GOOGLE_MAPS_ANDROID_API_KEY; el mapa nativo no estará configurado.');
}
if (process.env.GOOGLE_SERVICES_JSON) {
  process.env.GOOGLE_SERVICES_JSON = resolve(root, process.env.GOOGLE_SERVICES_JSON);
  if (!existsSync(process.env.GOOGLE_SERVICES_JSON)) {
    throw new Error('No existe el archivo GOOGLE_SERVICES_JSON.');
  }
} else if (!existsSync(join(root, 'android/app/google-services.json'))) {
  console.warn('Aviso: falta google-services.json; las notificaciones push Android no estarán configuradas.');
}

const task = format === 'apk' ? ':app:assembleRelease' : ':app:bundleRelease';
// Only fixed arguments are passed through cmd.exe, required for .bat on Windows.
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew',
  windows ? ['/d', '/c', 'gradlew.bat', task, '--console=plain'] : [task, '--console=plain'],
  { cwd: join(root, 'android'), env: process.env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status || 1);
const artifact = join(root, 'android/app/build/outputs',
  format === 'apk' ? 'apk/release/app-release.apk' : 'bundle/release/app-release.aab');
if (!existsSync(artifact)) throw new Error(`Gradle terminó pero no se encontró ${artifact}`);
console.log(`\nRelease ${format.toUpperCase()} generada: ${artifact}`);
