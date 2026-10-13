import { daysTogether, todayInMadrid } from '../../utils/dateUtils';
import { nextSpecialDate } from '../../utils/specialDateUtils';
import { formatSharedDistance } from '../location/distanceLabel';
import { haversineDistanceKm } from '../../utils/haversine';
import type { SharedLocation, Streak } from '../../types/domain';
import type { CoupleWidgetSnapshot, WidgetEvent } from './types';

interface WidgetCheckin {
  user_id: string;
  expires_at: string;
}

interface WidgetSpecialDate {
  title: string;
  date: string;
  recurring: boolean;
}

interface CreateWidgetSnapshotInput {
  startDate: string;
  streaks: Streak[];
  userId: string;
  partnerId: string;
  mine: SharedLocation | null;
  partner: SharedLocation | null;
  paused: boolean;
  questionPrompt: string | null;
  questionDay: string;
  checkins: WidgetCheckin[];
  specialDates: WidgetSpecialDate[];
  now: number;
}

function dayNumber(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Fecha inválida: ${value}.`);
  const [, year, month, day] = match.map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function toCalendarDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createWidgetSnapshot({
  startDate,
  streaks,
  userId,
  partnerId,
  mine,
  partner,
  paused,
  questionPrompt,
  questionDay,
  checkins,
  specialDates,
  now,
}: CreateWidgetSnapshotInput): CoupleWidgetSnapshot {
  const referenceDate = new Date(now);
  const today = todayInMadrid(referenceDate);
  const myStreak = streaks.find((streak) => streak.userId === userId);
  const partnerStreak = streaks.find((streak) => streak.userId === partnerId);
  const activeCheckin = checkins.find(
    (checkin) =>
      checkin.user_id === userId && Date.parse(checkin.expires_at) > now,
  );
  const recentLocations =
    mine &&
    partner &&
    Math.min(Date.parse(mine.updatedAt), Date.parse(partner.updatedAt)) >
      now - 120_000;
  const distance =
    recentLocations && mine && partner
      ? haversineDistanceKm(mine.lat, mine.lng, partner.lat, partner.lng)
      : null;
  const events: WidgetEvent[] = specialDates.map(({ title, date, recurring }) => ({
    title,
    date,
    recurring,
  }));
  const upcomingEvents = events
    .map((event) => ({
      ...event,
      occurrence: nextSpecialDate(event.date, event.recurring, referenceDate),
    }))
    .filter((event) => dayNumber(toCalendarDate(event.occurrence)) >= dayNumber(today))
    .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
  const nextEvent = upcomingEvents[0];
  const nextEventDate = nextEvent ? toCalendarDate(nextEvent.occurrence) : null;

  return {
    startDate,
    daysTogether: daysTogether(startDate, referenceDate),
    today,
    myStreak: myStreak?.count ?? 0,
    partnerStreak: partnerStreak?.count ?? 0,
    questionPrompt,
    questionDay,
    checkinDay: activeCheckin ? today : null,
    partnerDistance:
      distance === null
        ? null
        : formatSharedDistance(distance, mine, partner),
    partnerDistanceCapturedAt:
      recentLocations && mine && partner
        ? new Date(Math.min(Date.parse(mine.updatedAt), Date.parse(partner.updatedAt))).toISOString()
        : null,
    partnerLocationUpdatedAt: partner?.updatedAt ?? null,
    trackingPaused: paused,
    events,
    nextEventTitle: nextEvent?.title ?? null,
    nextEventDate,
    daysUntilEvent:
      nextEventDate === null ? null : dayNumber(nextEventDate) - dayNumber(today),
  };
}

export function advanceWidgetSnapshot(
  snapshot: CoupleWidgetSnapshot,
  referenceDate: Date,
): CoupleWidgetSnapshot {
  const today = todayInMadrid(referenceDate);
  const upcomingEvents = snapshot.events
    .map((event) => ({
      ...event,
      occurrence: nextSpecialDate(event.date, event.recurring, referenceDate),
    }))
    .filter((event) => dayNumber(toCalendarDate(event.occurrence)) >= dayNumber(today))
    .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
  const nextEvent = upcomingEvents[0];
  const nextEventDate = nextEvent ? toCalendarDate(nextEvent.occurrence) : null;

  return {
    ...snapshot,
    today,
    daysTogether: daysTogether(snapshot.startDate, referenceDate),
    questionPrompt: snapshot.questionDay === today ? snapshot.questionPrompt : null,
    checkinDay: snapshot.checkinDay === today ? today : null,
    nextEventTitle: nextEvent?.title ?? null,
    nextEventDate,
    daysUntilEvent:
      nextEventDate === null ? null : dayNumber(nextEventDate) - dayNumber(today),
  };
}

export function isWidgetSnapshot(value: unknown): value is CoupleWidgetSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.startDate === 'string' &&
    typeof snapshot.daysTogether === 'number' &&
    typeof snapshot.today === 'string' &&
    typeof snapshot.myStreak === 'number' &&
    typeof snapshot.partnerStreak === 'number' &&
    (typeof snapshot.questionPrompt === 'string' || snapshot.questionPrompt === null) &&
    typeof snapshot.questionDay === 'string' &&
    (typeof snapshot.checkinDay === 'string' || snapshot.checkinDay === null) &&
    (typeof snapshot.partnerDistance === 'string' || snapshot.partnerDistance === null) &&
    (typeof snapshot.partnerDistanceCapturedAt === 'string' ||
      snapshot.partnerDistanceCapturedAt === null) &&
    (typeof snapshot.partnerLocationUpdatedAt === 'string' ||
      snapshot.partnerLocationUpdatedAt === null) &&
    typeof snapshot.trackingPaused === 'boolean' &&
    Array.isArray(snapshot.events) &&
    snapshot.events.every(
      (event: unknown) =>
        typeof event === 'object' &&
        event !== null &&
        typeof (event as WidgetEvent).title === 'string' &&
        typeof (event as WidgetEvent).date === 'string' &&
        typeof (event as WidgetEvent).recurring === 'boolean',
    ) &&
    (typeof snapshot.nextEventTitle === 'string' || snapshot.nextEventTitle === null) &&
    (typeof snapshot.nextEventDate === 'string' || snapshot.nextEventDate === null) &&
    (typeof snapshot.daysUntilEvent === 'number' || snapshot.daysUntilEvent === null)
  );
}
