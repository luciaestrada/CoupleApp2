import { existsSync, readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export function findApkSigner(sdkDirectory) {
  if (!sdkDirectory || !existsSync(join(sdkDirectory, 'build-tools')))
    throw new Error('No se encuentra Android SDK. Configura ANDROID_HOME o android/local.properties.');
  const versions = readdirSync(join(sdkDirectory, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const jar = join(sdkDirectory, 'build-tools', version, 'lib/apksigner.jar');
    if (existsSync(jar)) return jar;
  }
  throw new Error('Falta apksigner. Instala Android SDK Build-Tools desde Android Studio.');
}

export function verifyAndCopyApk({ artifact, apkSigner, java, outputDirectory, run = spawnSync }) {
  // Invoke Java directly, avoiding shell interpolation of workspace paths.
  const result = run(java, ['-jar', apkSigner, 'verify', '--verbose', '--print-certs', artifact], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('La verificación de firma del APK ha fallado; no se exporta el archivo.');
  mkdirSync(outputDirectory, { recursive: true });
  const destination = join(outputDirectory, 'CoupleApp-release.apk');
  copyFileSync(artifact, destination);
  const checksum = createHash('sha256').update(readFileSync(destination)).digest('hex');
  writeFileSync(`${destination}.sha256`, `${checksum}  CoupleApp-release.apk\n`);
  return destination;
}
