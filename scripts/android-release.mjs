import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findApkSigner, verifyAndCopyApk } from './android-artifact.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const format = process.argv[2];
const checkOnly = process.argv[3] === '--check';
if (!['apk', 'aab'].includes(format) || process.argv.length > 4 ||
    (process.argv[3] && !checkOnly)) {
  console.error('Uso: node scripts/android-release.mjs apk|aab [--check]');
  process.exit(1);
}

process.chdir(root);
process.env.NODE_ENV = 'production';
const require = createRequire(import.meta.url);
require('@expo/env').load(root, { silent: true });
// Fail before Gradle if the JS application would fail on startup.
const { tsImport } = require('tsx/esm/api');
await tsImport('../src/config/environment.ts', import.meta.url);

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

const java = process.env.JAVA_HOME
  ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
if (javaVersion.error || javaVersion.status !== 0) throw new Error('No se puede ejecutar Java. Instala JDK 21 o configura JAVA_HOME.');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
// Gradle also supports sdk.dir in local.properties when no SDK variable is set.
let sdkDirectory = sdk;
const localProperties = join(root, 'android/local.properties');
if (!sdkDirectory && existsSync(localProperties)) {
  const value = readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.*)$/m)?.[1]?.trim();
  if (value) sdkDirectory = value.replace(/\\:/g, ':').replace(/\\\\/g, '\\');
}
const apkSigner = format === 'apk' ? findApkSigner(sdkDirectory) : null;

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

const task = checkOnly ? ':app:validateSigningRelease' : format === 'apk' ? ':app:assembleRelease' : ':app:bundleRelease';
// Only fixed arguments are passed through cmd.exe, required for .bat on Windows.
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'cmd.exe' : './gradlew',
  windows ? ['/d', '/c', 'gradlew.bat', task, '--console=plain'] : [task, '--console=plain'],
  { cwd: join(root, 'android'), env: process.env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status || 1);
if (checkOnly) {
  console.log('Entorno y configuración de firma comprobados. No se ha generado un APK.');
  process.exit(0);
}
const artifact = join(root, 'android/app/build/outputs',
  format === 'apk' ? 'apk/release/app-release.apk' : 'bundle/release/app-release.aab');
if (!existsSync(artifact)) throw new Error(`Gradle terminó pero no se encontró ${artifact}`);
if (format === 'apk') {
  const exported = verifyAndCopyApk({ artifact, apkSigner, java, outputDirectory: join(root, 'artifacts') });
  console.log(`\nAPK firmado y verificado: ${exported}`);
  process.exit(0);
}
console.log(`\nRelease ${format.toUpperCase()} generada: ${artifact}`);
