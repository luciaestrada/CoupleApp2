import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Buffer } from 'node:buffer';

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
}

const { haversineDistanceKm } = await importSource('../src/utils/haversine.js');
const { isIsoDate, parseCalendarDate } = await importSource(
  '../src/utils/validation.js',
);
const { nextSpecialDate } = await importSource(
  '../src/utils/specialDateUtils.js',
);
const { daysTogether, isStreakBroken, todayInMadrid } = await importSource(
  '../src/utils/dateUtils.js',
);
const { createRealtimeChannel, uniqueRealtimeChannelName } = await importSource(
  '../src/utils/realtimeChannel.js',
);
const {
  normalizeNotificationPermission,
  normalizePermission,
  permissionNeedsSettings,
} = await importSource('../src/utils/permissionUtils.js');

test('isIsoDate acepta fechas reales y rechaza normalizaciones y el año cero', () => {
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2023-02-29'), false);
  assert.equal(isIsoDate('0000-01-01'), false);
  assert.equal(isIsoDate('2024-2-9'), false);
});

test('las fechas de pantalla admiten formato español y validan el calendario', () => {
  assert.equal(parseCalendarDate('29/02/2024'), '2024-02-29');
  assert.equal(parseCalendarDate('31/04/2026'), null);
  assert.equal(parseCalendarDate('29/02/2025'), null);
  assert.equal(parseCalendarDate('2026-09-09'), '2026-09-09');
  assert.equal(parseCalendarDate('09/09/0000'), null);
});

test('haversineDistanceKm devuelve cero para el mismo punto', () => {
  assert.equal(haversineDistanceKm(40.4168, -3.7038, 40.4168, -3.7038), 0);
});

test('haversineDistanceKm permanece finita para puntos antipodales', () => {
  const distance = haversineDistanceKm(48.8566, 2.3522, -48.8566, -177.6478);
  assert.equal(Number.isFinite(distance), true);
  assert.ok(distance > 20_000 && distance < 20_020);
});

test('nextSpecialDate conserva el día y avanza las recurrencias pasadas', () => {
  assert.equal(
    nextSpecialDate(
      '2020-08-10',
      true,
      new Date(2026, 7, 11),
    ).toLocaleDateString('sv-SE'),
    '2027-08-10',
  );
  assert.equal(
    nextSpecialDate(
      '2020-08-11',
      true,
      new Date(2026, 7, 11),
    ).toLocaleDateString('sv-SE'),
    '2026-08-11',
  );
});

test('nextSpecialDate adapta el 29 de febrero al último día del mes', () => {
  assert.equal(
    nextSpecialDate(
      '2024-02-29',
      true,
      new Date(2025, 0, 1),
    ).toLocaleDateString('sv-SE'),
    '2025-02-28',
  );
});

test('los cálculos diarios usan Europe/Madrid aunque cambie el día UTC', () => {
  const madridAfterMidnight = new Date('2026-08-10T22:30:00.000Z');
  assert.equal(todayInMadrid(madridAfterMidnight), '2026-08-11');
  assert.equal(daysTogether('2026-08-01', madridAfterMidnight), 10);
  assert.equal(isStreakBroken('2026-08-09', madridAfterMidnight), true);
  assert.equal(isStreakBroken('2026-08-10', madridAfterMidnight), false);
});

test('cada watcher Realtime recibe un canal único aunque comparta nombre base', () => {
  const channels = new Map();
  const client = {
    channel(name) {
      if (channels.has(name)) return channels.get(name);
      const channel = {
        name,
        subscribed: false,
        on() {
          if (this.subscribed)
            throw new Error('callback añadido después de subscribe');
          return this;
        },
        subscribe() {
          this.subscribed = true;
          return this;
        },
      };
      channels.set(name, channel);
      return channel;
    },
  };

  const first = createRealtimeChannel(client, 'streak-couple').on().subscribe();
  const second = createRealtimeChannel(client, 'streak-couple')
    .on()
    .subscribe();

  assert.notEqual(first, second);
  assert.notEqual(first.name, second.name);
  assert.match(first.name, /^streak-couple-/);
  assert.equal(channels.size, 2);
  assert.notEqual(
    uniqueRealtimeChannelName('geofences-couple-user'),
    uniqueRealtimeChannelName('geofences-couple-user'),
  );
});

test('los permisos bloqueados se distinguen de los que aún pueden solicitarse', () => {
  const requestable = normalizePermission({
    status: 'denied',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  });
  const blocked = normalizePermission({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  });

  assert.equal(permissionNeedsSettings(requestable), false);
  assert.equal(permissionNeedsSettings(blocked), true);
  assert.equal(normalizePermission({ status: 'granted' }).granted, true);
  assert.equal(
    normalizeNotificationPermission({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      ios: { status: 3 },
    }).granted,
    true,
  );
});
