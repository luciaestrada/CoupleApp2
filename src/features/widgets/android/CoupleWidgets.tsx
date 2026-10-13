import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { CoupleWidgetSnapshot, WidgetKind } from '../types';

export function CoupleAndroidWidget({
  kind,
  snapshot,
  renderedAt,
}: {
  kind: WidgetKind;
  snapshot: CoupleWidgetSnapshot | null;
  renderedAt: number;
}) {
  const commonStyle = {
    backgroundColor: '#FFF8FC',
    borderRadius: 22,
    padding: 16,
    flex: 1,
    flexDirection: 'column' as const,
    justifyContent: 'space-around' as const,
  } as const;
  const titleStyle = { color: '#8B4A78', fontSize: 13, fontWeight: 'bold' as const } as const;
  const bodyStyle = { color: '#453F45', fontSize: 14 } as const;
  const numberStyle = { color: '#8B4A78', fontSize: 28, fontWeight: 'bold' as const } as const;

  if (!snapshot) {
    return (
      <FlexWidget style={commonStyle}>
        <TextWidget text="CoupleApp" style={titleStyle} />
        <TextWidget text="Abre la app para cargar este widget." style={bodyStyle} maxLines={2} />
      </FlexWidget>
    );
  }

  if (kind === 'overview') {
    return (
      <FlexWidget style={commonStyle}>
        <TextWidget text="Nuestra pareja" style={titleStyle} />
        <TextWidget text={`${snapshot.daysTogether}`} style={numberStyle} />
        <TextWidget text={`días juntos · racha ${snapshot.myStreak}`} style={bodyStyle} />
        <TextWidget
          text={snapshot.questionPrompt ?? 'La pregunta del día os espera'}
          style={bodyStyle}
          maxLines={2}
          truncate="END"
        />
      </FlexWidget>
    );
  }

  if (kind === 'days') {
    return (
      <FlexWidget style={commonStyle}>
        <TextWidget text="Días juntos" style={titleStyle} />
        <TextWidget text={`${snapshot.daysTogether}`} style={numberStyle} />
        <TextWidget
          text={`Tú ${snapshot.myStreak} · Tu pareja ${snapshot.partnerStreak} días`}
          style={bodyStyle}
          maxLines={2}
        />
      </FlexWidget>
    );
  }

  if (kind === 'question') {
    return (
      <FlexWidget style={commonStyle}>
        <TextWidget text="Pregunta del día" style={titleStyle} />
        <TextWidget
          text={snapshot.questionPrompt ?? 'Abre la app para ver la pregunta de hoy.'}
          style={bodyStyle}
          maxLines={3}
          truncate="END"
        />
        <TextWidget
          text={`Check-in: ${snapshot.checkinDay === snapshot.today ? 'completado' : 'pendiente'}`}
          style={bodyStyle}
        />
      </FlexWidget>
    );
  }

  if (kind === 'location') {
    const ageMs = snapshot.partnerLocationUpdatedAt
      ? renderedAt - Date.parse(snapshot.partnerLocationUpdatedAt)
      : Number.POSITIVE_INFINITY;
    const distanceIsRecent =
      snapshot.partnerDistance !== null &&
      snapshot.partnerDistanceCapturedAt !== null &&
      renderedAt - Date.parse(snapshot.partnerDistanceCapturedAt) <= 120_000;

    return (
      <FlexWidget style={commonStyle}>
        <TextWidget text="Cerca, aunque lejos" style={titleStyle} />
        <TextWidget
          text={
            snapshot.trackingPaused
              ? 'Ubicación pausada'
              : distanceIsRecent
                ? snapshot.partnerDistance ?? 'Ubicación disponible'
                : snapshot.partnerLocationUpdatedAt
                  ? 'Última ubicación disponible'
                  : 'Sin ubicación compartida'
          }
          style={bodyStyle}
          maxLines={2}
        />
        <TextWidget
          text={
            ageMs < 60_000
              ? 'Actualizada hace menos de un minuto'
              : Number.isFinite(ageMs)
                ? `Actualizada hace ${Math.floor(ageMs / 60_000)} min`
                : 'Cada persona decide cuándo compartir su posición'
          }
          style={bodyStyle}
          maxLines={2}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={commonStyle}>
      <TextWidget text="Próximo evento" style={titleStyle} />
      <TextWidget
        text={snapshot.nextEventTitle ?? 'Añadid una fecha especial en CoupleApp'}
        style={bodyStyle}
        maxLines={2}
        truncate="END"
      />
      {snapshot.daysUntilEvent !== null && (
        <TextWidget
          text={snapshot.daysUntilEvent === 0 ? '¡Hoy!' : `${snapshot.daysUntilEvent} días`}
          style={numberStyle}
        />
      )}
    </FlexWidget>
  );
}
