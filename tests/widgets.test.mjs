import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('tsx/cjs/api').register();
const { advanceWidgetSnapshot, createWidgetSnapshot, isWidgetSnapshot } = require(
  '../src/features/widgets/snapshot.ts',
);

test('el resumen del widget incluye rachas, pregunta, check-in y el próximo evento', () => {
  const now = Date.parse('2026-10-12T12:00:00.000Z');
  const snapshot = createWidgetSnapshot({
    startDate: '2026-10-01',
    streaks: [
      { userId: 'me', count: 4, lastConfirmedDay: '2026-10-12' },
      { userId: 'partner', count: 7, lastConfirmedDay: '2026-10-12' },
    ],
    userId: 'me',
    partnerId: 'partner',
    mine: {
      lat: 40.4168,
      lng: -3.7038,
      updatedAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      accuracy: 10,
      speed: null,
      heading: null,
      batteryLevel: null,
      charging: null,
      activity: null,
      activityConfidence: null,
    },
    partner: {
      lat: 40.4268,
      lng: -3.7038,
      updatedAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      accuracy: 10,
      speed: null,
      heading: null,
      batteryLevel: null,
      charging: null,
      activity: null,
      activityConfidence: null,
    },
    paused: false,
    questionPrompt: '¿Qué recuerdo te hace sonreír?',
    questionDay: '2026-10-12',
    checkins: [{ user_id: 'me', expires_at: '2026-10-13T00:00:00.000Z' }],
    specialDates: [
      { title: 'Aniversario', date: '2020-10-20', recurring: true },
      { title: 'Evento pasado', date: '2026-10-01', recurring: false },
    ],
    now,
  });

  assert.equal(snapshot.daysTogether, 11);
  assert.equal(snapshot.myStreak, 4);
  assert.equal(snapshot.partnerStreak, 7);
  assert.equal(snapshot.questionPrompt, '¿Qué recuerdo te hace sonreír?');
  assert.equal(snapshot.checkinDay, '2026-10-12');
  assert.equal(snapshot.nextEventTitle, 'Aniversario');
  assert.equal(snapshot.daysUntilEvent, 8);
  assert.match(snapshot.partnerDistance, /km aprox\./);
  assert.equal(isWidgetSnapshot(snapshot), true);
});

test('el snapshot diario avanza los días y retira la pregunta y el check-in caducados', () => {
  const snapshot = createWidgetSnapshot({
    startDate: '2026-10-01',
    streaks: [],
    userId: 'me',
    partnerId: 'partner',
    mine: null,
    partner: null,
    paused: false,
    questionPrompt: 'Pregunta anterior',
    questionDay: '2026-10-12',
    checkins: [{ user_id: 'me', expires_at: '2026-10-13T00:00:00.000Z' }],
    specialDates: [{ title: 'Aniversario', date: '2020-10-20', recurring: true }],
    now: Date.parse('2026-10-12T12:00:00.000Z'),
  });

  const nextDay = advanceWidgetSnapshot(
    snapshot,
    new Date('2026-10-13T12:00:00.000Z'),
  );

  assert.equal(nextDay.daysTogether, 12);
  assert.equal(nextDay.questionPrompt, null);
  assert.equal(nextDay.checkinDay, null);
  assert.equal(nextDay.daysUntilEvent, 7);
  assert.equal(isWidgetSnapshot({ ...snapshot, events: [null] }), false);
});
