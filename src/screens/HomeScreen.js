import React, { useCallback, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import { sendLove, watchStreaks } from '../services/streakService';
import { watchUserLocation } from '../services/locationService';
import { useTracking } from '../context/TrackingContext';
import { haversineDistanceKm } from '../utils/haversine';
import { formatSharedDistance } from '../features/location/distanceLabel';
import {
  daysTogether,
  isStreakBroken,
  todayInMadrid,
} from '../utils/dateUtils';
import { locationAgeLabel, effectiveMode } from '../features/location/policy';
import { Action, Banner, MenuRow } from '../ui/components';
import { colors } from '../ui/theme';
import CheckinCard from '../ui/CheckinCard';
import TodayCard from '../ui/TodayCard';

export default function HomeScreen({ navigation }) {
  const { userId, couple, partnerId, userProfile } = usePairedAppContext();
  const tracking = useTracking();
  const focused = useIsFocused();
  const [streaks, setStreaks] = useState(couple.streaks ?? []);
  const [mine, setMine] = useState(null),
    [partner, setPartner] = useState(null);
  const [error, setError] = useState(null),
    [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showGestures,setShowGestures] = useState(false);
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const stopStreaks = watchStreaks(couple.id, {
      onData: setStreaks,
      onError: setError,
    });
    const stopMine = watchUserLocation(couple.id, userId, {
      onData: setMine,
      onError: setError,
    });
    const stopPartner = watchUserLocation(couple.id, partnerId, {
      onData: setPartner,
      onError: setError,
    });
    let timer = AppState.currentState === 'active' ? setInterval(() => setNow(Date.now()), 30000) : null;
    const app = AppState.addEventListener('change', state => {
      clearInterval(timer);
      timer = null;
      if (state === 'active') {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 30000);
      }
    });
    return () => {
      stopStreaks();
      stopMine();
      stopPartner();
      clearInterval(timer);
      app.remove();
    };
  }, [couple.id, userId, partnerId]));
  const myStreak = streaks.find((item) => item.userId === userId);
  const partnerStreak = streaks.find((item) => item.userId === partnerId);
  const sentToday = myStreak?.lastConfirmedDay === todayInMadrid();
  const paused = effectiveMode(tracking.settings, now) === 'off';
  const recent =
    mine &&
    partner &&
    Math.min(Date.parse(mine.updatedAt), Date.parse(partner.updatedAt)) >
      now - 120000;
  const distance = recent
    ? haversineDistanceKm(mine.lat, mine.lng, partner.lat, partner.lng)
    : null;
  const distanceLabel =
    distance !== null
      ? formatSharedDistance(distance, mine, partner)
      : paused
        ? 'Compartes cuando tú quieras'
        : partner
          ? 'Última ubicación disponible'
          : 'Aún no hay una ubicación compartida';
  async function handleLove(kind = 'love') {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await sendLove(couple.id,kind);
      setShowGestures(false);
    } catch (e) {
      setError(e);
    } finally {
      setSending(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>
          {userProfile?.name ? `Hola, ${userProfile.name}` : 'Vuestro espacio'}
        </Text>
        <Text style={styles.days}>{daysTogether(couple.startDate)}</Text>
        <Text style={styles.heroCopy}>días compartiendo la vida</Text>
      </View>
      {error && <Banner>{error.message}</Banner>}
      <View style={styles.card}>
        <Text style={styles.title}>Vuestras rachas</Text>
        <View style={styles.streaks}>
          {[
            [myStreak, 'Tú'],
            [partnerStreak, 'Tu pareja'],
          ].map(([streak, label]) => (
            <View key={label} style={styles.streak}>
              <Text style={styles.description}>{label}</Text>
              <Text style={styles.count}>
                {streak?.count ?? 0}
                <Text style={{ fontSize: 14, fontWeight: '400' }}>
                  {streak?.count === 1 ? ' día' : ' días'}
                </Text>
              </Text>
              {(streak?.count ?? 0) > 0 &&
                isStreakBroken(streak.lastConfirmedDay) && (
                  <Text style={styles.description}>
                    Podéis empezar de nuevo
                  </Text>
                )}
            </View>
          ))}
        </View>
      </View>
      {focused && <CheckinCard key={couple.id} coupleId={couple.id} userId={userId} now={now}/>}
      <View style={styles.card}>
        <Text style={styles.title}>Un detalle cada día</Text>
        <Text style={styles.description}>
          {sentToday
            ? 'Hoy ya cuenta para la racha. Puedes volver a enviar amor.'
            : 'Hazle saber que estás pensando en vuestra relación.'}
        </Text>
        <Action
          title={sentToday ? 'Enviar amor otra vez 💜' : 'Enviar un poco de amor'}
          onPress={() => handleLove()}
          onLongPress={() => setShowGestures(true)}
          loading={sending}
          secondary={sentToday}
        />
        <Action title={showGestures?'Cerrar gestos':'Elegir otro gesto'} secondary onPress={()=>setShowGestures(value=>!value)} disabled={sending}/>
        {showGestures && <View style={{gap:8}}>
          {[['love','❤️ Amor'],['kiss','😘 Beso'],['hug','🫂 Abrazo'],['miss_you','✨ Te echo de menos']].map(([kind,label])=>
            <Action key={kind} title={label} secondary loading={sending} onPress={()=>handleLove(kind)}/>)}
        </View>}
      </View>
      <MenuRow title="Pregunta del día" description="Descubrid vuestras respuestas cuando ambos contestéis" symbol="?" onPress={()=>navigation.navigate('Preguntas',{questionId:null})}/>
      {focused && <TodayCard key={couple.id} coupleId={couple.id} userId={userId} now={now} navigation={navigation}/>}
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CERCA, AUNQUE ESTÉIS LEJOS</Text>
        <Text style={styles.distance}>{distanceLabel}</Text>
        <Text style={styles.description}>
          {paused
            ? 'Tu ubicación está pausada. Puedes activarla desde el mapa.'
            : partner
              ? locationAgeLabel(partner.updatedAt, now)
              : 'Cada persona decide cuándo compartir su posición.'}
        </Text>
        <Action
          title="Abrir vuestro mapa"
          secondary
          onPress={() => navigation.navigate('Mapa')}
        />
      </View>
      <Text style={styles.title}>Para vosotros</Text>
      <MenuRow
        title="Vuestra conversación"
        description="Un mensaje también puede acercaros"
        symbol="♡"
        onPress={() => navigation.navigate('Chat')}
      />
      <MenuRow
        title="Momentos y fechas"
        description="Fotos, estados y días que recordar"
        symbol="✦"
        onPress={() => navigation.navigate('Recuerdos')}
      />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  hero: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
  },
  days: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.primary,
    marginVertical: 4,
  },
  heroCopy: { fontSize: 17, color: colors.text },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  description: { fontSize: 14, lineHeight: 21, color: colors.muted },
  streaks: { flexDirection: 'row', gap: 16, marginVertical: 4 },
  streak: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 14,
    borderRadius: 14,
  },
  count: { fontSize: 28, color: colors.primary, fontWeight: '700' },
  distance: { fontSize: 22, fontWeight: '700', color: colors.text },
});
