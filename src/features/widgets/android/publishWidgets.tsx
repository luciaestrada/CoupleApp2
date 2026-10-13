import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { CoupleAndroidWidget } from './CoupleWidgets';
import type { CoupleWidgetSnapshot, WidgetKind } from '../types';

const widgets: { name: string; kind: WidgetKind }[] = [
  { name: 'CoupleOverviewWidget', kind: 'overview' },
  { name: 'CoupleDaysWidget', kind: 'days' },
  { name: 'CoupleQuestionWidget', kind: 'question' },
  { name: 'CoupleLocationWidget', kind: 'location' },
  { name: 'CoupleEventWidget', kind: 'event' },
];

export async function publishAndroidWidgets(snapshot: CoupleWidgetSnapshot | null) {
  const renderedAt = Date.now();
  await Promise.all(
    widgets.map(({ name, kind }) =>
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: () => (
          <CoupleAndroidWidget
            kind={kind}
            snapshot={snapshot}
            renderedAt={renderedAt}
          />
        ),
      }),
    ),
  );
}
