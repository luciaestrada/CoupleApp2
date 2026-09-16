import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async path => import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL(path, import.meta.url), 'utf8')).toString('base64'));
const { sharingStatus } = await load('../src/features/location/sharingStatus.js');
const { normalizePermission } = await load('../src/utils/permissionUtils.js');
const base = {
  settings: { location_mode: 'balanced', tracking_device_id: 'phone', background_enabled: true,
    history_enabled: true, auto_live_enabled: true },
  paired: true, deviceId: 'phone', status: 'sharing',
  permissions: { locationServices: { granted: true }, locationForeground: { granted: true, accuracy: 'approximate' }, locationBackground: { granted: false } },
};
test('privacidad: preferencias activas no se muestran como publicación con pausa, sin permiso o desde otro dispositivo', () => {
  for (const changes of [
    { settings: { ...base.settings, location_mode: 'off' } },
    { permissions: { ...base.permissions, locationForeground: { granted: false } } },
    { deviceId: 'other' }, { paired: false }, { status: 'paused' }, { status: 'offline' },
    { settings: { ...base.settings, location_mode: 'live', live_until: '2020-01-01T00:00:00Z' } },
  ]) {
    const result = sharingStatus({ ...base, ...changes });
    assert.notEqual(result.location, 'Última publicación realizada');
    assert.equal(result.battery, result.location);
    assert.equal(result.history, result.location);
  }
});
test('privacidad: distingue permiso aproximado, segundo plano denegado y opción desactivada', () => {
  const result = sharingStatus({ ...base, settings: { ...base.settings, location_options: { share_battery: false } } });
  assert.match(result.precision, /aproximada/);
  assert.equal(result.background, 'Falta permiso permanente');
  assert.equal(result.battery, 'Desactivado');
  assert.equal(normalizePermission({ status: 'granted', ios: { accuracy: 'reduced' } }).accuracy, 'approximate');
  assert.equal(normalizePermission({ status: 'granted', android: { accuracy: 'fine' } }).accuracy, 'precise');
  assert.equal(normalizePermission({ status: 'granted' }).accuracy, 'unknown');
});
