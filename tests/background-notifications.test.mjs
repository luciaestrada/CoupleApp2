import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const { transformSync } = createRequire(import.meta.url)('@babel/core');
function evaluate(path, dependencies, globals = {}) {
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, Date, Intl, AbortController, setTimeout, clearTimeout,
    require: name => {
      if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }, ...globals });
  return exports;
}
const dateUtils = evaluate('../src/utils/dateUtils.js', {});
const planner = evaluate('../src/services/localReminderPlanner.js', { '../utils/dateUtils': dateUtils });
const delivery = evaluate('../src/services/localNotificationDelivery.js', {});
const diagnosticSource = '../src/services/notificationDiagnostics.js';

function fixture() {
  const stored = new Map(), shown = [], canceled = [], scheduled = new Map();
  let user = 'u', granted = true, beforeQuery = async () => {}, sessionLoader, settings = {
    notifications_enabled: true, chat_enabled: true, dates_enabled: true, preview_enabled: false,
  };
  const tables = {
    notifications: [{ id: 'n', user_id: 'u', kind: 'chat', title: 'Mensaje', body: 'Privado', data: { screen: 'Chat' },
      created_at: new Date(Date.now() + 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), push_enabled_at_creation: true }],
    special_dates: [], couple_plans: [],
  };
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const Notifications = {
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async id => { scheduled.delete(id); canceled.push(id); },
    scheduleNotificationAsync: async request => {
      if (request.trigger === null) shown.push(request);
      else scheduled.set(request.identifier, request);
      return request.identifier;
    },
  };
  const query = table => {
    const q = { then: (resolve, reject) => (async () => {
      await beforeQuery(table);
      return { data: table === 'user_settings' ? settings : table === 'couple' ? { id: 'c', members: [{}, {}] } : tables[table], error: null };
    })().then(resolve, reject) };
    for (const method of ['select', 'eq', 'is', 'gte', 'gt', 'order', 'limit', 'maybeSingle', 'abortSignal']) q[method] = () => q;
    return q;
  };
  const auth = { getSession: async () => sessionLoader ? sessionLoader() : ({ data: { session: user ? { user: { id: user }, expires_at: Date.now() / 1000 + 3600 } : null } }) };
  const Platform = { OS: 'ios' }, AppState = { currentState: 'background' };
  const navigationRef = { getCurrentRoute: () => ({ name: 'Chat' }) };
  const permission = { getNotificationPermission: async () => ({ granted }) };
  const service = evaluate('../src/services/localNotificationSync.js', {
    'expo-notifications': Notifications, 'react-native': { Platform, AppState },
    '../supabase/client': { supabase: { auth, from: query, rpc: () => query('couple') } },
    './permissionService': permission, './localNotificationDelivery': delivery,
    './localReminderPlanner': planner, '../utils/dateUtils': dateUtils,
    './notificationDiagnostics': evaluate(diagnosticSource, {}, { localStorage: storage }),
    '../navigation/navigationService': { navigationRef },
  }, { localStorage: storage });
  service.setLocalNotificationUser('u');
  return { service, shown, canceled, scheduled, tables, Platform, AppState, permission,
    setUser: value => user = value, setGranted: value => granted = value,
    setQuery: value => beforeQuery = value, setSettings: value => settings = value,
    setSessionLoader: value => sessionLoader = value,
    diagnostics: evaluate(diagnosticSource, {}, { localStorage: storage }) };
}

test('segundo plano: presenta mensajes con Chat previamente abierto y comparte deduplicación entre ejecutores', async () => {
  const f = fixture();
  const first = f.service.syncLocalNotifications({ source: 'foreground', currentRoute: () => 'Chat' });
  assert.equal(f.service.syncLocalNotifications({ source: 'foreground' }), first, 'Agrupa consultas equivalentes');
  await Promise.all([first, f.service.syncLocalNotifications({ source: 'background' })]);
  assert.equal(f.shown.length, 1);
  assert.equal(f.shown[0].content.body, 'Abre CoupleApp para ver el aviso');
});

test('segundo plano: un cierre de sesión durante la consulta descarta sus resultados', async () => {
  const f = fixture();
  f.setQuery(async table => { if (table === 'notifications') f.service.setLocalNotificationUser(null); });
  await f.service.syncLocalNotifications({ source: 'background' });
  assert.equal(f.shown.length, 0);
  f.service.setLocalNotificationUser('u'); f.setUser('other');
  await f.service.syncLocalNotifications({ source: 'background' });
  assert.equal(f.shown.length, 0);
});

test('segundo plano: permisos y preferencias revocados retiran recordatorios existentes', async () => {
  const f = fixture();
  f.tables.couple_plans = [{ id: 'p', couple_id: 'c', title: 'Plan', planned_date: '2099-10-02', status: 'pending', version: 1 }];
  await f.service.syncLocalNotifications({ source: 'background' });
  assert.equal(f.scheduled.size, 1);
  f.setGranted(false);
  await f.service.syncLocalNotifications({ source: 'background' });
  assert.equal(f.scheduled.size, 0);
  f.setGranted(true);
  await f.service.syncLocalNotifications();
  assert.equal(f.scheduled.size, 1);
  f.setSettings({ notifications_enabled: false });
  await f.service.syncLocalNotifications();
  assert.equal(f.scheduled.size, 0);
});

test('segundo plano: Android conserva su transporte y no consulta el servicio iOS', async () => {
  const f = fixture(); f.Platform.OS = 'android';
  await f.service.syncLocalNotifications({ source: 'location' });
  assert.equal(f.shown.length, 0);
});

test('tarea nativa: registro sin ubicación, retirada al salir y cancelación por expiración', async () => {
  let owner, registered = false, callback, expire, interruptions = 0, clear = 0, removed = 0;
  const calls = [];
  const BackgroundTask = {
    BackgroundTaskResult: { Success: 1, Failed: 2 }, BackgroundTaskStatus: { Available: 1 },
    getStatusAsync: async () => 1,
    registerTaskAsync: async (_name, options) => { registered = true; calls.push(options); },
    unregisterTaskAsync: async () => { registered = false; },
    addExpirationListener: fn => { expire = fn; return { remove: () => removed++ }; },
  };
  let expires = false;
  const service = evaluate('../src/services/backgroundNotificationService.js', {
    'expo-background-task': BackgroundTask, 'expo-task-manager': {
      isTaskDefined: () => false, defineTask: (_name, fn) => { callback = fn; }, isTaskRegisteredAsync: async () => registered,
    }, 'react-native': { Platform: { OS: 'ios' } },
    './permissionService': { getNotificationPermission: async () => ({ granted: true }) },
    '../features/location/trackingEngine': { syncTrackingConfig: async () => {} },
    './notificationDiagnostics': { recordNotificationDiagnostic: () => {}, notificationFailureReason: () => 'unknown' },
    './localNotificationSync': {
      setLocalNotificationUser: id => owner = id, localNotificationUser: () => owner,
      clearLocalReminders: async () => clear++, interruptLocalNotificationSync: () => interruptions++,
      syncLocalNotifications: async () => { if (expires) expire(); },
    },
  });
  assert.equal(typeof callback, 'function', 'Definida antes de montar pantallas');
  await service.configureBackgroundNotifications('u');
  assert.equal(calls[0].minimumInterval, 15);
  await service.configureBackgroundNotifications('u');
  assert.equal(calls.length, 1);
  assert.equal(await callback({}), 1);
  expires = true;
  assert.equal(await callback({}), 2);
  assert.equal(interruptions, 1);
  assert.equal(removed, 2);
  await service.configureBackgroundNotifications(null);
  assert.equal(registered, false);
  assert.equal(clear, 2);
});

test('segundo plano: presenta mensajes antes de consultar planes y no falla por su indisponibilidad', async () => {
  const f = fixture();
  f.setQuery(async table => {
    if (table === 'couple_plans') {
      assert.equal(f.shown.length, 1, 'El mensaje debe mostrarse antes del trabajo opcional');
      throw Object.assign(new Error('Missing table'), { code: '42P01' });
    }
  });
  await f.service.syncLocalNotifications({ source: 'background' });
  const record = f.diagnostics.readNotificationDiagnostics('u').background;
  assert.ok(record.lastSuccess);
  assert.equal(record.phase, 'reminder_error');
  assert.equal(record.reason, 'backend');
});

test('segundo plano: un getSession pendiente en primer plano no ocupa toda la cola', async () => {
  const f = fixture();
  let calls = 0;
  f.setSessionLoader(() => ++calls === 1 ? new Promise(() => {}) : Promise.resolve({
    data: { session: { user: { id: 'u' }, expires_at: Date.now() / 1000 + 3600 } },
  }));
  const first = f.service.syncLocalNotifications();
  const rejected = assert.rejects(first, /timed out/);
  await new Promise(resolve => setImmediate(resolve));
  await f.service.syncLocalNotifications({ source: 'background' });
  await rejected;
  assert.equal(f.shown.length, 1);
});

test('segundo plano: una consulta en cola cede su turno antes de iniciar autenticación', async () => {
  const f = fixture();
  let calls = 0;
  f.setSessionLoader(() => {
    calls++;
    return Promise.resolve({ data: { session: { user: { id: 'u' }, expires_at: Date.now() / 1000 + 3600 } } });
  });
  await Promise.all([f.service.syncLocalNotifications(), f.service.syncLocalNotifications({ source: 'background' })]);
  assert.equal(f.shown.length, 1);
  assert.equal(f.diagnostics.readNotificationDiagnostics('u').foreground, undefined);
  assert.ok(calls > 0);
});

test('ubicación: una ejecución con la app activa sigue respetando la conversación abierta', async () => {
  const f = fixture(); f.AppState.currentState = 'active';
  await f.service.syncLocalNotifications({ source: 'location' });
  assert.equal(f.shown.length, 0);
  assert.ok(f.diagnostics.readNotificationDiagnostics('u').location.lastSuccess);
  assert.equal(f.diagnostics.readNotificationDiagnostics('u').location.lastBackgroundSuccess, undefined);
});

test('diagnóstico: conserva ejecuciones por origen sin guardar contenido ni errores con tokens', () => {
  const f = fixture();
  f.diagnostics.recordNotificationDiagnostic('u', 'background', 'wake');
  f.diagnostics.recordNotificationDiagnostic('u', 'background', 'success');
  f.diagnostics.recordNotificationDiagnostic('u', 'foreground', 'success');
  const state = f.diagnostics.readNotificationDiagnostics('u');
  assert.ok(state.background.lastWake);
  assert.ok(state.background.lastSuccess);
  assert.equal(f.diagnostics.notificationFailureReason(new Error('Network unavailable: secret-token')), 'connection');
  assert.ok(!JSON.stringify(state).includes('secret-token'));
  assert.deepEqual(Object.keys(f.diagnostics.readNotificationDiagnostics('other')), []);
});

function diagnosticReport({ state, records = {}, granted = false } = {}) {
  return evaluate('../src/services/backgroundNotificationDiagnostics.js', {
    'expo-background-task': { BackgroundTaskStatus: { Available: 1 }, getStatusAsync: async () => 1 },
    'expo-task-manager': { isTaskRegisteredAsync: async () => true },
    'expo-modules-core': { requireOptionalNativeModule: () => state ? { getBackgroundExecutionStateAsync: async () => state } : null },
    'react-native': { Platform: { OS: 'ios' } },
    './backgroundNotificationService': { NOTIFICATION_SYNC_TASK: 'notifications' },
    './localNotificationSync': { localNotificationUser: () => 'u' },
    './notificationDiagnostics': { readNotificationDiagnostics: () => records },
    '../features/location/trackingEngine': { TRACKING_TASK: 'tracking' }, './locationTask': { GEOFENCE_TASK: 'zones' },
    'expo-location': {
      getBackgroundPermissionsAsync: async () => ({ granted }),
      hasStartedLocationUpdatesAsync: async () => { assert.ok(granted); return true; },
      hasStartedGeofencingAsync: async () => { assert.ok(granted); return false; },
    },
  });
}

test('diagnóstico: detecta configuración nativa ausente, restricciones y permiso de ubicación', async () => {
  const report = await diagnosticReport({ state: {
    backgroundModes: [], schedulerIdentifiers: [], backgroundRefreshStatus: 'denied', lowPowerMode: true, simulator: true,
  } }).getBackgroundNotificationReport();
  assert.match(report, /Falta la configuración nativa/);
  assert.match(report, /desactivada o restringida/);
  assert.match(report, /bajo consumo/);
  assert.match(report, /iPhone físico/);
  assert.match(report, /sin permiso permanente/);
});

test('diagnóstico: una sincronización en primer plano no acredita ejecución de fondo', async () => {
  const report = await diagnosticReport({ granted: true, records: { foreground: { lastSuccess: Date.now() } } }).getBackgroundNotificationReport();
  assert.match(report, /no incluye el diagnóstico nativo actualizado/);
  assert.match(report, /Seguimiento por ubicación: registrado/);
  assert.match(report, /Última activación de la tarea periódica: Todavía no consta/);
  assert.match(report, /Última consulta por ubicación con la app en segundo plano: Todavía no consta/);
  assert.match(report, /Última consulta completada por tarea periódica: Todavía no consta/);
});

test('geofencing: una sesión pendiente no retrasa la consulta de avisos', async () => {
  let callback, release, queries = 0;
  evaluate('../src/services/locationTask.js', {
    'expo-location': { GeofencingEventType: { Enter: 1, Exit: 2 } }, 'expo-crypto': {},
    'expo-task-manager': { isTaskDefined: () => false, defineTask: (_name, handler) => { callback = handler; } },
    '../supabase/client': { supabase: { auth: { getSession: () => new Promise(resolve => { release = resolve; }) } } },
    './localNotificationSync': { syncLocalNotifications: async () => queries++ },
  }, { localStorage: { getItem: key => key === 'coupleapp.geofence.state.zone' ? 'outside' : null, setItem: () => {} } });
  const execution = callback({ data: { eventType: 1, region: { identifier: 'zone' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries, 1);
  release({ data: { session: null } });
  await execution;
});
