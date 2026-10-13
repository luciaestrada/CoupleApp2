import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { CoupleWidgetSnapshot, WidgetKind } from '../types';

interface CoupleWidgetProps {
  kind: WidgetKind;
  snapshot: CoupleWidgetSnapshot | null;
}

function CoupleWidget(
  props: CoupleWidgetProps,
  environment: WidgetEnvironment,
) {
  'widget';

  const titleStyle = font({ weight: 'bold', size: 13 });
  const bodyStyle = font({ size: 13 });
  const numberStyle = font({ weight: 'bold', size: 28 });
  const accentStyle = foregroundStyle('#8B4A78');
  const mutedStyle = foregroundStyle('#726672');
  const paddingStyle = padding({ all: 14 });
  const snapshot = props.snapshot;

  if (!snapshot) {
    return (
      <VStack modifiers={[paddingStyle]}>
        <Text modifiers={[titleStyle, accentStyle]}>CoupleApp</Text>
        <Text modifiers={[bodyStyle, mutedStyle]}>
          Abre la app para cargar este widget.
        </Text>
      </VStack>
    );
  }

  if (props.kind === 'overview') {
    return (
      <VStack modifiers={[paddingStyle]}>
        <Text modifiers={[titleStyle, accentStyle]}>Nuestra pareja</Text>
        <Text modifiers={[numberStyle, accentStyle]}>{snapshot.daysTogether}</Text>
        <Text modifiers={[bodyStyle]}>días juntos · racha {snapshot.myStreak}</Text>
        {environment.widgetFamily !== 'systemSmall' && (
          <Text modifiers={[bodyStyle, mutedStyle]}>
            {snapshot.questionPrompt ?? 'La pregunta del día os espera'}
          </Text>
        )}
      </VStack>
    );
  }

  if (props.kind === 'days') {
    return (
      <VStack modifiers={[paddingStyle]}>
        <Text modifiers={[titleStyle, accentStyle]}>Días juntos</Text>
        <Text modifiers={[numberStyle, accentStyle]}>{snapshot.daysTogether}</Text>
        <Text modifiers={[bodyStyle]}>
          Tú {snapshot.myStreak} · Tu pareja {snapshot.partnerStreak} días
        </Text>
      </VStack>
    );
  }

  if (props.kind === 'question') {
    return (
      <VStack modifiers={[paddingStyle]}>
        <Text modifiers={[titleStyle, accentStyle]}>Pregunta del día</Text>
        <Text modifiers={[bodyStyle]}>
          {snapshot.questionPrompt ?? 'Abre la app para ver la pregunta de hoy.'}
        </Text>
        <Text modifiers={[bodyStyle, mutedStyle]}>
          Check-in: {snapshot.checkinDay === snapshot.today ? 'completado' : 'pendiente'}
        </Text>
      </VStack>
    );
  }

  if (props.kind === 'location') {
    const ageMs = snapshot.partnerLocationUpdatedAt
      ? environment.date.getTime() - Date.parse(snapshot.partnerLocationUpdatedAt)
      : Number.POSITIVE_INFINITY;
    const distanceIsRecent =
      snapshot.partnerDistance !== null &&
      snapshot.partnerDistanceCapturedAt !== null &&
      environment.date.getTime() - Date.parse(snapshot.partnerDistanceCapturedAt) <= 120_000;

    return (
      <VStack modifiers={[paddingStyle]}>
        <Text modifiers={[titleStyle, accentStyle]}>Cerca, aunque lejos</Text>
        <Text modifiers={[bodyStyle]}>
          {snapshot.trackingPaused
            ? 'Ubicación pausada'
            : distanceIsRecent
              ? snapshot.partnerDistance
              : snapshot.partnerLocationUpdatedAt
                ? 'Última ubicación disponible'
                : 'Sin ubicación compartida'}
        </Text>
        <Text modifiers={[bodyStyle, mutedStyle]}>
          {ageMs < 60_000
            ? 'Actualizada hace menos de un minuto'
            : Number.isFinite(ageMs)
              ? `Actualizada hace ${Math.floor(ageMs / 60_000)} min`
              : 'Cada persona decide cuándo compartir su posición'}
        </Text>
      </VStack>
    );
  }

  return (
    <VStack modifiers={[paddingStyle]}>
      <Text modifiers={[titleStyle, accentStyle]}>Próximo evento</Text>
      <Text modifiers={[bodyStyle]}>
        {snapshot.nextEventTitle ?? 'Añadid una fecha especial en CoupleApp'}
      </Text>
      {snapshot.daysUntilEvent !== null && (
        <Text modifiers={[numberStyle, accentStyle]}>
          {snapshot.daysUntilEvent === 0
            ? '¡Hoy!'
            : `${snapshot.daysUntilEvent} días`}
        </Text>
      )}
    </VStack>
  );
}

export const overviewWidget = createWidget('CoupleOverviewWidget', CoupleWidget);
export const daysWidget = createWidget('CoupleDaysWidget', CoupleWidget);
export const questionWidget = createWidget('CoupleQuestionWidget', CoupleWidget);
export const locationWidget = createWidget('CoupleLocationWidget', CoupleWidget);
export const eventWidget = createWidget('CoupleEventWidget', CoupleWidget);
