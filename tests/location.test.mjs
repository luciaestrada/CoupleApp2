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
  assert.equal(effectiveMode({ location_mode: 'live', powerSave: true,
    live_until: new Date(now + 60000).toISOString() }, now), 'balanced');
  assert.match(locationAgeLabel(new Date(now - 18 * 3600_000).toISOString(), now), /18 h/);
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
  let requestedOptions;
  let lowPowerMode = false;
  let backgroundGranted = false;
  let activityRunning = false;
  let nativeRunning = false;
  let nativeStops = 0;
  let backgroundTask;
  const sent = [];
  const Location = {
    Accuracy: { High: 6, Balanced: 3 },
    LocationActivityType: { Other: 1 },
    getLastKnownPositionAsync: async () => null,
    hasStartedLocationUpdatesAsync: async () => nativeRunning,
    stopLocationUpdatesAsync: async () => { nativeRunning = false; nativeStops++; },
    getForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getBackgroundPermissionsAsync: async () => ({ granted: backgroundGranted }),
    startLocationUpdatesAsync: async (_task, options) => { requestedOptions = options; nativeRunning = true; },
    watchPositionAsync: async (options, callback) => {
      requestedOptions = options;
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
      if (name==='get_tracking_config') return {data:JSON.parse(storage.get('coupleapp.tracking')??'null'),error:null};
      sent.push(args);
      return new Promise((resolve) => {
        rpcResolve = resolve;
      });
    },
  };
  globalThis.__trackingTest = {
    Location,
    TaskManager: { isTaskDefined: () => false, defineTask: (_name, task) => { backgroundTask = task; } },
    Battery: { getPowerStateAsync: async () => ({ batteryLevel: 1, lowPowerMode }) },
    Crypto: { randomUUID },
    AppState: { currentState: 'active' },
    Platform: { OS: 'ios' },
    supabase,
    getDeviceId: () => 'device-a',
    effectiveMode,
    shouldPublish,
    startActivityTracking: async()=>{ activityRunning = true; },
    stopActivityTracking:async()=>{ activityRunning = false; }, readActivity:async()=>null,
    syncLocalNotifications: async () => {},
  };
  const source = (
    await readFile(
      new URL('../src/features/location/trackingEngine.js', import.meta.url),
      'utf8',
    )
  ).replace(/^import .*;\r?\n/gm, '');
  const engine = await import(
    `data:text/javascript;base64,${Buffer.from('const {Location,TaskManager,Battery,Crypto,AppState,Platform,supabase,getDeviceId,effectiveMode,shouldPublish,startActivityTracking,stopActivityTracking,readActivity,syncLocalNotifications}=globalThis.__trackingTest;\n' + source).toString('base64')}`
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
    backgroundGranted = true;
    globalThis.__trackingTest.AppState.currentState = 'background';
    const liveConfig = { ...config, background_enabled: true,
      location_mode: 'live', live_until: new Date(Date.now() + 60000).toISOString() };
    await engine.configureTracking(liveConfig);
    assert.equal(requestedOptions.accuracy, Location.Accuracy.High);
    assert.equal(requestedOptions.pausesUpdatesAutomatically, false);
    lowPowerMode = true;
    await engine.configureTracking(liveConfig);
    assert.equal(requestedOptions.accuracy, Location.Accuracy.Balanced);
    assert.equal(requestedOptions.timeInterval, 300000);
    assert.equal(requestedOptions.pausesUpdatesAutomatically, true);
    assert.equal(effectiveMode(JSON.parse(storage.get('coupleapp.tracking'))), 'balanced');
    lowPowerMode = false;
    await engine.configureTracking({ ...config, background_enabled: true });
    assert.equal(requestedOptions.timeInterval, 180000);
    assert.equal(requestedOptions.distanceInterval, 100);
    assert.equal(activityRunning, true);
    await engine.configureTracking(null);
    assert.equal(activityRunning, false, 'Una configuración revocada también detiene el reconocimiento nativo');
    await engine.configureTracking({ ...config, location_options: { low_battery_mode: 'off' } });
    lowPowerMode = true;
    await engine.configureTracking({ ...config, location_options: { low_battery_mode: 'off' } });
    assert.equal(activityRunning, false, 'La pausa por batería no deja sensores activos');
    assert.equal(storage.has('coupleapp.trackingPaused.user-a'), false, 'La pausa por batería no se convierte en una pausa voluntaria');

    globalThis.__trackingTest.Platform.OS = 'android';
    globalThis.__trackingTest.AppState.currentState = 'active';
    lowPowerMode = false;
    await engine.configureTracking(liveConfig);
    assert.equal(nativeRunning, true, 'Android inicia el servicio mientras la app es visible, también en vivo');
    assert.equal(watchers, 0);
    assert.equal(requestedOptions.foregroundService.killServiceOnDestroy, false);
    const stopsBeforeBackground = nativeStops;
    globalThis.__trackingTest.AppState.currentState = 'background';
    engine.suspendForegroundTracking();
    await engine.configureTracking({ ...config, background_enabled: true });
    assert.equal(nativeStops, stopsBeforeBackground, 'El cambio de vivo a equilibrado conserva el servicio');
    assert.equal(requestedOptions.distanceInterval, 0, 'Recibe posiciones aunque el teléfono esté quieto');
    assert.equal(requestedOptions.deferredUpdatesDistance, 0);
    assert.equal(requestedOptions.deferredUpdatesInterval, 0, 'No retiene muestras esperando otro lote');
    lowPowerMode = true;
    await engine.configureTracking({ ...config, background_enabled: true });
    assert.equal(nativeStops, stopsBeforeBackground, 'El ahorro de batería conserva el servicio');
    assert.equal(requestedOptions.timeInterval, 300000);
    assert.equal(requestedOptions.distanceInterval, 0);

    supabase.rpc = async (name, args) => {
      if (name === 'get_tracking_config') return { data: JSON.parse(storage.get('coupleapp.tracking')), error: null };
      sent.push(args);
      return { error: null };
    };
    const realNow = Date.now;
    const baseTime = realNow();
    const beforeHeartbeat = sent.length;
    try {
      for (const elapsed of [0, 360000]) {
        Date.now = () => baseTime + elapsed;
        await backgroundTask({ data: { locations: [{ timestamp: Date.now(),
          coords: { latitude: 40, longitude: -3, accuracy: 10 } }] } });
      }
      assert.equal(sent.length, beforeHeartbeat + 2, 'Publica un latido estando quieto en segundo plano');
    } finally { Date.now = realNow; }
    await engine.configureTracking({ ...config, background_enabled: true, location_mode: 'off' });
    assert.equal(nativeRunning, false, 'Desactivar el seguimiento sí detiene el servicio');
    await engine.configureTracking({ ...config, background_enabled: true });
    assert.equal(nativeRunning, true);
    backgroundGranted = false;
    await engine.configureTracking({ ...config, background_enabled: true });
    assert.equal(nativeRunning, false, 'Revocar el permiso permanente detiene el servicio conservado');
    backgroundGranted = true;
    await engine.configureTracking({ ...config, background_enabled: true });
    await engine.stopTracking();
    assert.equal(nativeRunning, false, 'La pausa explícita detiene el servicio conservado');
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
    granted = true;
    await module.registerGeofences(places);
    localStorage.setItem('coupleapp.geofence.events', JSON.stringify([{ id: 'pending' }]));
    const delayedRegistration = module.registerGeofences(places);
    const paused = module.pauseGeofences();
    assert.equal(module.areGeofencesPaused(), true);
    assert.equal(localStorage.getItem('coupleapp.geofence.events'), null);
    await Promise.all([delayedRegistration, paused]);
    assert.equal(running, false, 'Una sincronización anterior no anula la pausa');
    await module.registerGeofences(places);
    await module.flushGeofenceEvents();
    assert.equal(running, false, 'La pausa sigue vigente aunque se registren lugares de nuevo');
    module.resumeGeofences();
    await module.registerGeofences(places);
    assert.equal(running, true, 'Solo la reanudación explícita vuelve a registrar regiones');
  } finally {
    delete globalThis.__geofenceTest;
  }
});
