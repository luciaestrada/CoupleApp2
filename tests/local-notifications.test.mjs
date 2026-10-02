import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/services/localNotificationDelivery.js', import.meta.url), 'utf8');
const { createLocalNotificationDelivery } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function fixture() {
  const time = Date.parse('2026-10-02T10:00:00Z');
  const stored = new Map(), sent = [];
  let user = 'u', active = true, granted = true, route = 'Inicio', fail = false;
  const deps = {
    userId: 'u', now: () => time,
    storage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    isActive: () => active, currentUser: async () => user,
    permission: async () => ({ granted }), currentRoute: () => route,
    schedule: async request => { if (fail) throw Error('native failure'); sent.push(request); },
  };
  const row = { id: 'n1', user_id: 'u', title: 'Nuevo mensaje', body: 'Privado', kind: 'chat',
    data: { screen: 'Chat' }, created_at: new Date(time).toISOString(),
    expires_at: new Date(time + 3600000).toISOString(), push_enabled_at_creation: true };
  const batch = { rows: [row], settings: { notifications_enabled: true, chat_enabled: true, preview_enabled: false } };
  return { deps, row, batch, sent, service: createLocalNotificationDelivery(deps),
    setUser: value => user = value, setActive: value => active = value,
    setGranted: value => granted = value, setRoute: value => route = value, setFail: value => fail = value };
}

test('iOS local: oculta el contenido, conserva navegación y no repite tras reiniciar', async () => {
  const f = fixture();
  await f.service.deliver(f.batch);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].content.body, 'Abre CoupleApp para ver el aviso');
  assert.equal(f.sent[0].content.data.notificationId, 'n1');
  assert.equal(f.sent[0].trigger, null);
  await f.service.deliver(f.batch);
  await createLocalNotificationDelivery(f.deps).deliver(f.batch);
  assert.equal(f.sent.length, 1);
});

test('iOS local: recupera al volver y permite reintentar un fallo de presentación', async () => {
  const f = fixture();
  f.setActive(false); await f.service.deliver(f.batch);
  f.setActive(true); f.setGranted(false); await f.service.deliver(f.batch);
  f.setGranted(true); f.setUser('other'); await f.service.deliver(f.batch);
  assert.equal(f.sent.length, 0);
  f.setUser('u'); f.setFail(true);
  await assert.rejects(f.service.deliver(f.batch), /native failure/);
  f.setFail(false); f.batch.settings.preview_enabled = true;
  await f.service.deliver(f.batch);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].content.body, 'Privado');
});

test('iOS local: respeta preferencias, caducidad, lectura, controles y conversación abierta', async () => {
  for (const change of [
    f => f.batch.settings.notifications_enabled = false,
    f => f.batch.settings.chat_enabled = false,
    f => f.batch.settings = null,
    f => f.row.read_at = '2026-10-02T10:00:00Z',
    f => f.row.push_enabled_at_creation = false,
    f => f.row.data.type = 'tracking_control',
    f => f.row.expires_at = '2026-10-01T10:00:00Z',
    f => f.row.created_at = '2026-10-01T10:00:00Z',
    f => f.row.user_id = 'other',
    f => { f.row.kind = 'geofence'; f.batch.settings.geofence_enabled = true; f.batch.settings.event_options = { enter: false }; },
    f => { f.row.kind = 'walking'; f.batch.settings.event_options = { walking: false }; },
    f => f.setRoute('Chat'),
  ]) {
    const f = fixture(); change(f);
    await f.service.deliver(f.batch);
    assert.equal(f.sent.length, 0);
  }
});

test('iOS local: los avisos de actividad respetan sus opciones independientes de llegadas', async () => {
  const f = fixture();
  f.row.kind = 'walking'; f.row.data = { screen: 'Mapa' };
  f.batch.settings.geofence_enabled = false;
  f.batch.settings.event_options = { walking: true };
  await f.service.deliver(f.batch);
  assert.equal(f.sent.length, 1);
});
