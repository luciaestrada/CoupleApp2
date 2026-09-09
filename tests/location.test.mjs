import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const policySource = await readFile(
  new URL('../src/features/location/policy.js', import.meta.url),
  'utf8',
);
const { effectiveMode, shouldPublish, locationAgeLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(policySource).toString('base64')}`
);
const now = Date.now();
const sample = {
  lat: 40,
  lng: -3,
  accuracy_m: 10,
  captured_at: new Date(now).toISOString(),
};

test('ubicación: caducidad, ahorro y consentimiento', () => {
  assert.equal(effectiveMode(null, now), 'off');
  assert.equal(
    effectiveMode(
      { location_mode: 'live', live_until: new Date(now - 1).toISOString() },
      now,
    ),
    'off',
  );
  assert.equal(
    effectiveMode(
      {
        location_mode: 'live',
        live_until: new Date(now + 60000).toISOString(),
      },
      now,
      true,
    ),
    'balanced',
  );
  assert.equal(shouldPublish(null, sample, 'off', now), false);
});
test('ubicación: descarta ruido, muestras antiguas y precisión insuficiente', () => {
  assert.equal(shouldPublish(null, sample, 'balanced', now), true);
  assert.equal(
    shouldPublish(
      null,
      { ...sample, accuracy_m: 5000, approximate: true },
      'balanced',
      now,
    ),
    true,
  );
  assert.equal(
    shouldPublish(
      null,
      { ...sample, accuracy_m: 10001, approximate: true },
      'balanced',
      now,
    ),
    false,
  );
  assert.equal(
    shouldPublish(null, { ...sample, accuracy_m: 500 }, 'live', now),
    false,
  );
  assert.equal(
    shouldPublish(
      sample,
      { ...sample, captured_at: new Date(now - 1000).toISOString() },
      'live',
      now,
    ),
    false,
  );
  assert.equal(
    shouldPublish(
      sample,
      {
        ...sample,
        lat: 40.00001,
        captured_at: new Date(now + 60000).toISOString(),
      },
      'balanced',
      now + 60000,
    ),
    false,
  );
  assert.equal(
    shouldPublish(
      sample,
      {
        ...sample,
        lat: 40.005,
        captured_at: new Date(now + 60000).toISOString(),
      },
      'balanced',
      now + 60000,
    ),
    true,
  );
  assert.equal(
    shouldPublish(
      null,
      { ...sample, captured_at: new Date(now - 3600000).toISOString() },
      'live',
      now,
    ),
    false,
  );
  assert.match(
    locationAgeLabel(new Date(now - 600000).toISOString(), now),
    /10 min/,
  );
});

test('motor: una pausa cancela la publicación pendiente y persiste aunque no haya red', async () => {
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  let positionCallback;
  let rpcResolve;
  let watchers = 0;
  const sent = [];
  const Location = {
    Accuracy: { High: 6, Balanced: 3 },
    LocationActivityType: { Other: 1 },
    getLastKnownPositionAsync: async () => null,
    hasStartedLocationUpdatesAsync: async () => false,
    stopLocationUpdatesAsync: async () => {},
    getForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getBackgroundPermissionsAsync: async () => ({ granted: false }),
    watchPositionAsync: async (options, callback) => {
      watchers++;
      positionCallback = callback;
      return {
        remove: () => {
          watchers--;
        },
      };
    },
  };
  const supabase = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'user-a' } } },
      }),
    },
    rpc: async (name, args) => {
      sent.push(args);
      return new Promise((resolve) => {
        rpcResolve = resolve;
      });
    },
  };
  globalThis.__trackingTest = {
    Location,
    TaskManager: { isTaskDefined: () => false, defineTask: () => {} },
    Battery: { getPowerStateAsync: async () => ({ batteryLevel: 1 }) },
    Crypto: { randomUUID },
    AppState: { currentState: 'active' },
    Platform: { OS: 'ios' },
    supabase,
    getDeviceId: () => 'device-a',
    effectiveMode,
    shouldPublish,
  };
  const source = (
    await readFile(
      new URL('../src/features/location/trackingEngine.js', import.meta.url),
      'utf8',
    )
  ).replace(/^import .*;\r?\n/gm, '');
  const engine = await import(
    `data:text/javascript;base64,${Buffer.from('const {Location,TaskManager,Battery,Crypto,AppState,Platform,supabase,getDeviceId,effectiveMode,shouldPublish}=globalThis.__trackingTest;\n' + source).toString('base64')}`
  );
  const config = {
    userId: 'user-a',
    location_mode: 'balanced',
    tracking_device_id: 'device-a',
    background_enabled: false,
  };
  try {
    await engine.configureTracking(config);
    assert.equal(watchers, 1);
    await Promise.all([
      engine.configureTracking(config),
      engine.configureTracking(config),
    ]);
    assert.equal(
      watchers,
      1,
      'Las configuraciones simultáneas solo pueden mantener un observador',
    );
    positionCallback({
      timestamp: Date.now(),
      coords: { latitude: 40, longitude: -3, accuracy: 10 },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].p_sample.user_id, 'user-a');
    await engine.stopTracking();
    assert.equal(watchers, 0);
    rpcResolve({ error: null });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(storage.has('coupleapp.location.pending'), false);
    await engine.configureTracking(config);
    assert.equal(
      watchers,
      0,
      'La pausa local debe sobrevivir a una recarga de preferencias antiguas',
    );
    engine.allowTracking('user-a');
    await engine.configureTracking(config);
    assert.equal(watchers, 1);
  } finally {
    await engine.stopTracking();
    delete globalThis.__trackingTest;
  }
});

test('geofences: no consulta servicios nativos sin permiso permanente y se recupera al concederlo', async () => {
  let granted = false,
    queries = 0,
    starts = 0,
    stops = 0,
    running = false;
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  globalThis.__geofenceTest = {
    Location: {
      getBackgroundPermissionsAsync: async () => ({ granted }),
      hasStartedGeofencingAsync: async () => {
        queries++;
        if (!granted) throw Error('Not authorized');
        return running;
      },
      startGeofencingAsync: async () => {
        starts++;
        running = true;
      },
      stopGeofencingAsync: async () => {
        stops++;
        running = false;
      },
    },
    Crypto: { randomUUID },
    Platform: { OS: 'android' },
    TaskManager: { isTaskDefined: () => true },
    supabase: {},
  };
  const source = (
    await readFile(
      new URL('../src/services/locationTask.js', import.meta.url),
      'utf8',
    )
  ).replace(/^import .*;\r?\n/gm, '');
  const module = await import(
    `data:text/javascript;base64,${Buffer.from('const {Location,Crypto,Platform,TaskManager,supabase}=globalThis.__geofenceTest;\n' + source).toString('base64')}`
  );
  const places = [{ id: 'a', lat: 40, lng: -3, radiusMeters: 150 }];
  try {
    assert.equal(await module.registerGeofences(places), false);
    assert.equal(await module.registerGeofences([]), false);
    assert.equal(queries, 0);
    granted = true;
    assert.equal(await module.registerGeofences(places), true);
    await module.registerGeofences(places);
    assert.equal(starts, 1, 'No reinicia regiones idénticas');
    await module.registerGeofences([]);
    assert.equal(stops, 1);
    granted = false;
    assert.equal(await module.registerGeofences(places), false);
    assert.equal(starts, 1);
  } finally {
    delete globalThis.__geofenceTest;
  }
});
