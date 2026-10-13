export type WidgetKind = 'overview' | 'days' | 'question' | 'location' | 'event';

export interface WidgetEvent {
  title: string;
  date: string;
  recurring: boolean;
}

export interface CoupleWidgetSnapshot {
  startDate: string;
  daysTogether: number;
  today: string;
  myStreak: number;
  partnerStreak: number;
  questionPrompt: string | null;
  questionDay: string;
  checkinDay: string | null;
  partnerDistance: string | null;
  partnerDistanceCapturedAt: string | null;
  partnerLocationUpdatedAt: string | null;
  trackingPaused: boolean;
  events: WidgetEvent[];
  nextEventTitle: string | null;
  nextEventDate: string | null;
  daysUntilEvent: number | null;
}
