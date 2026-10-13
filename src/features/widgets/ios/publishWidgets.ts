import {
  daysWidget,
  eventWidget,
  locationWidget,
  overviewWidget,
  questionWidget,
} from './CoupleWidgets';
import { advanceWidgetSnapshot } from '../snapshot';
import type { CoupleWidgetSnapshot, WidgetKind } from '../types';

function nextMidnight() {
  const date = new Date();
  date.setHours(24, 0, 0, 0);
  return date;
}

export function publishIosWidgets(snapshot: CoupleWidgetSnapshot) {
  const entryDate = new Date();
  const nextEntryDate = nextMidnight();
  const nextSnapshot = advanceWidgetSnapshot(snapshot, nextEntryDate);
  const timelineFor = (kind: WidgetKind) => [
    { date: entryDate, props: { kind, snapshot } },
    { date: nextEntryDate, props: { kind, snapshot: nextSnapshot } },
  ];
  overviewWidget.updateTimeline(timelineFor('overview'));
  daysWidget.updateTimeline(timelineFor('days'));
  questionWidget.updateTimeline(timelineFor('question'));
  locationWidget.updateTimeline(timelineFor('location'));
  eventWidget.updateTimeline(timelineFor('event'));
}

export function clearIosWidgets() {
  overviewWidget.updateSnapshot({ kind: 'overview', snapshot: null });
  daysWidget.updateSnapshot({ kind: 'days', snapshot: null });
  questionWidget.updateSnapshot({ kind: 'question', snapshot: null });
  locationWidget.updateSnapshot({ kind: 'location', snapshot: null });
  eventWidget.updateSnapshot({ kind: 'event', snapshot: null });
}
