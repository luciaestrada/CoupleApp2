import React from 'react';
import {
  registerWidgetTaskHandler,
  type WidgetTaskHandlerProps,
} from 'react-native-android-widget';
import { advanceWidgetSnapshot } from '../snapshot';
import { readWidgetSnapshot } from '../widgetStorage';
import { CoupleAndroidWidget } from './CoupleWidgets';
import type { WidgetKind } from '../types';

const widgetKinds: Record<string, WidgetKind> = {
  CoupleOverviewWidget: 'overview',
  CoupleDaysWidget: 'days',
  CoupleQuestionWidget: 'question',
  CoupleLocationWidget: 'location',
  CoupleEventWidget: 'event',
};

export async function widgetTaskHandler({
  widgetInfo,
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') return;
  const kind = widgetKinds[widgetInfo.widgetName];
  if (!kind) throw new Error(`Widget desconocido: ${widgetInfo.widgetName}.`);
  const renderedAt = new Date();
  const snapshot = await readWidgetSnapshot();
  renderWidget(
    <CoupleAndroidWidget
      kind={kind}
      snapshot={snapshot ? advanceWidgetSnapshot(snapshot, new Date()) : null}
      renderedAt={renderedAt.getTime()}
    />,
  );
}

registerWidgetTaskHandler(widgetTaskHandler);
