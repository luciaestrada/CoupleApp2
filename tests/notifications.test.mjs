import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

test('push: los fallos se reflejan en Ajustes y revocar permisos no queda bloqueado por el reintento', async () => {
  let granted = true;
  const tokens = [], states = [];
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } });
  const constants = { easConfig: { projectId: 'project' } };
  globalThis.__pushTest = {
    Notifications: { setNotificationHandler: () => {}, setNotificationChannelAsync: async () => {}, AndroidImportance: { HIGH: 4, DEFAULT: 3 }, getExpoPushTokenAsync: async () => { throw Error('Default FirebaseApp is not initialized'); } },
    Constants: constants,
    AppState: { currentState: 'active' }, Platform: { OS: 'android' },
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) } },
    getNotificationPermission: async () => ({ granted, canAskAgain: true }), requestNotificationPermission: async () => ({ granted }),
    registerDevice: async (token) => { tokens.push(token); }, navigationRef: {}, watchQuery: () => {},
    configureBackgroundNotifications: async () => {},
  };
  const source = (await readFile(new URL('../src/services/notificationService.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm, '');
  const service = await import(`data:text/javascript;base64,${Buffer.from('const {Notifications,Constants,AppState,Platform,supabase,getNotificationPermission,requestNotificationPermission,registerDevice,navigationRef,watchQuery,configureBackgroundNotifications}=globalThis.__pushTest;\n'+source).toString('base64')}`);
  const unsubscribe = service.watchPushStatus((state) => states.push(state.status));
  try {
    await assert.rejects(service.registerForPushNotifications(), /instalación/);
    assert.equal(service.getPushStatus().status, 'configuration_required');
    assert.ok(states.includes('configuration_required'));
    granted = false;
    assert.equal((await service.registerForPushNotifications()).status, 'denied');
    assert.equal(tokens.at(-1), null);
    assert.equal(service.getPushStatus().status, 'denied');
    granted = true;
    constants.easConfig = {};
    await assert.rejects(service.registerForPushNotifications({ force: true }), /proyecto/);
    assert.equal(service.getPushStatus().status, 'configuration_required');
    service.resetPushRegistration();
    assert.equal(states.at(-1), 'unknown');
    globalThis.__pushTest.Platform.OS = 'ios';
    storage.set('coupleapp.pushToken', 'obsolete-token');
    assert.equal((await service.registerForPushNotifications()).status, 'local');
    assert.equal(tokens.at(-1), null);
    assert.equal(storage.has('coupleapp.pushToken'), false);
    assert.equal((await service.registerForPushNotifications()).status, 'local');
    granted = false;
    assert.equal((await service.registerForPushNotifications()).status, 'denied');
  } finally { unsubscribe(); delete globalThis.__pushTest; }
});
