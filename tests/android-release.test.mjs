import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyAndCopyApk } from '../scripts/android-artifact.mjs';

test('a failed signature verification never exports an APK', () => {
  const root = mkdtempSync(join(tmpdir(), 'coupleapp-apk-test-'));
  try {
    const artifact = join(root, 'unsigned.apk');
    writeFileSync(artifact, 'invalid artifact');
    assert.throws(() => verifyAndCopyApk({ artifact, apkSigner: 'signer.jar', java: 'java',
      outputDirectory: join(root, 'output'), run: () => ({ status: 1 }) }), /firma/);
    assert.equal(existsSync(join(root, 'output')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('only a verified APK is copied and its checksum matches the output', () => {
  const root = mkdtempSync(join(tmpdir(), 'coupleapp-apk-test-'));
  try {
    const artifact = join(root, 'signed.apk');
    writeFileSync(artifact, 'test artifact');
    const destination = verifyAndCopyApk({ artifact, apkSigner: 'signer.jar', java: 'java',
      outputDirectory: join(root, 'output'), run: (command, args) => {
        assert.equal(command, 'java');
        assert.deepEqual(args, ['-jar', 'signer.jar', 'verify', '--verbose', '--print-certs', artifact]);
        return { status: 0 };
      } });
    assert.deepEqual(readFileSync(destination), readFileSync(artifact));
    assert.equal(readFileSync(`${destination}.sha256`, 'utf8'),
      `${createHash('sha256').update(readFileSync(destination)).digest('hex')}  CoupleApp-release.apk\n`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
