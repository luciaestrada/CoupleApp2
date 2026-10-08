import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './support/source.mjs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { asError } from '../src/utils/errors.ts';
import { clearAccountContent } from '../src/persistence/storage.ts';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const React = require('react');

function evaluate(path, dependencies) {
  const { code } = transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      const value = dependencies[name];
      if (value instanceof Error) throw value;
      return value;
    },
  });
  return exports;
}

test('arranque: registra una pantalla aunque falle la carga de un módulo nativo', () => {
  const failure = new Error("Cannot find native module 'ExpoVideo'");
  let registered;
  const Boundary = () => null;
  evaluate('../index.js', {
    react: React,
    expo: { registerRootComponent: root => { registered = root; } },
    './src/components/StartupBoundary': Boundary,
    './App': failure,
  });
  assert.equal(typeof registered, 'function');
  const rendered = registered();
  assert.equal(rendered.type, Boundary);
  assert.equal(rendered.props.startupError, failure);
  assert.equal(rendered.props.children, null);
});

test('arranque: carga la aplicación antes de registrarla para conservar las tareas de fondo', () => {
  const Application = () => null;
  let registered;
  evaluate('../index.js', {
    react: React,
    expo: { registerRootComponent: root => { registered = root; } },
    './src/components/StartupBoundary': () => null,
    './App': { default: Application },
  });
  assert.equal(registered().props.children.type, Application);
  assert.equal(registered().props.startupError, undefined);
});

test('arranque: muestra el detalle del fallo de importación o renderizado', () => {
  const { default: Boundary } = evaluate('../src/components/StartupBoundary.tsx', {
    react: React,
    'react-native': { ScrollView: 'ScrollView', Text: 'Text', StyleSheet: { create: value => value } },
  });
  const failure = new Error('Fallo de inicio de prueba');
  const boundary = new Boundary({ startupError: failure });
  assert.ok(JSON.stringify(boundary.render()).includes(failure.message));
  const healthy = new Boundary({ children: 'Application' });
  assert.equal(healthy.render(), 'Application');
  healthy.state = Boundary.getDerivedStateFromError(failure);
  assert.ok(JSON.stringify(healthy.render()).includes(failure.message));
});

test('sesión: un rechazo al recuperar la sesión sale de la carga y expone el error', async () => {
  const states = [], effects = [];
  const failure = new Error('No se pudo leer la sesión');
  const react = {
    ...React,
    useState(initial) {
      const state = { value: initial };
      states.push(state);
      return [initial, value => { state.value = value; }];
    },
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useEffect: callback => effects.push(callback),
  };
  const { AuthProvider } = evaluate('../src/context/AuthContext.tsx', {
    react,
    'react-native': { Linking: {} },
    '../services/deviceService': {},
    '../services/notificationService': {},
    '../services/backgroundNotificationService': {},
    '../features/location/trackingEngine': {},
    '../services/locationTask': {},
    '../services/profileService': {},
    '../services/chatService': {},
    '../services/storiesService': {},
    '../persistence/storage': {},
    '../utils/errors': { asError },
    '../supabase/client': {
      startSupabaseAuthAutoRefresh: () => () => {},
      supabase: { auth: {
        getSession: async () => { throw failure; },
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      } },
    },
  });
  AuthProvider({ children: null });
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(states[3].value, false, 'Debe finalizar la carga');
  assert.equal(states[4].value, failure, 'Debe mostrar el error recuperable');
  cleanup();
});

test('cerrar sesión limpia las colas de esa cuenta aunque fallen los servicios nativos', async () => {
  const values = new Map([
    ['coupleapp.outbox.user.couple', 'pending'],
    ['coupleapp.story-upload.user.couple', 'upload'],
    ['coupleapp.plan-draft.user.couple', 'draft'],
    ['coupleapp.outbox.other.couple', 'keep'],
    ['coupleapp.privacy.user', 'keep'],
  ]);
  const storage = {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  let state = 0, invalidated = false, signedOut = false, clearedFiles;
  const { AuthProvider } = evaluate('../src/context/AuthContext.tsx', {
    react: { ...React, useState: initial => [state++ === 1 ? { user: { id: 'user' } } : initial, () => {}],
      useCallback: callback => callback, useMemo: callback => callback(), useEffect: () => {} },
    'react-native': { Linking: {} },
    '../services/deviceService': { revokeDevice: async () => {} },
    '../services/notificationService': { resetPushRegistration() {} },
    '../services/backgroundNotificationService': { configureBackgroundNotifications: async () => { throw Error('native error'); } },
    '../features/location/trackingEngine': { stopTracking: async () => {} },
    '../services/locationTask': { registerGeofences: async () => {} },
    '../services/profileService': {},
    '../services/chatService': { invalidateMessageDelivery: () => { invalidated = true; } },
    '../services/storiesService': { clearStoryFiles: async userId => { clearedFiles = userId; } },
    '../persistence/storage': { clearAccountContent: userId => clearAccountContent(userId, storage) },
    '../utils/errors': { asError },
    '../supabase/client': { supabase: { auth: { signOut: async () => { signedOut = true; return { error: null }; } } } },
  });
  await AuthProvider({ children: null }).props.value.signOut();
  assert.equal(invalidated, true);
  assert.equal(signedOut, true);
  assert.equal(clearedFiles, 'user');
  assert.deepEqual([...values.keys()], ['coupleapp.outbox.other.couple', 'coupleapp.privacy.user']);
});
