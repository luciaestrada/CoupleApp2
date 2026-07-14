import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Text, RefreshControl } from 'react-native';
import { onSnapshot, collection, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';
import { sendLove } from '../services/streakService';
import { updateMyLocation, calculateDistanceKm } from '../services/distanceService';
import StreakBadge from '../components/StreakBadge';
import DistanceCard from '../components/DistanceCard';
import DaysCounter from '../components/DaysCounter';

export default function HomeScreen() {
  const { userProfile } = useAuth();
  const { couple } = useCouple();
  const [locations, setLocations] = useState({});

  useEffect(() => {
    if (!couple?.id) return;
    const unsub = onSnapshot(collection(db, 'couples', couple.id, 'locations'), (snap) => {
      const next = {};
      snap.forEach((d) => (next[d.id] = d.data()));
      setLocations(next);
    });
    return unsub;
  }, [couple?.id]);

  useEffect(() => {
    if (!couple?.id || !userProfile?.id) return;
    updateMyLocation(couple.id, userProfile.id);
    const interval = setInterval(() => updateMyLocation(couple.id, userProfile.id), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [couple?.id, userProfile?.id]);

  if (!couple) return <View style={styles.container} />;

  const [uidA, uidB] = couple.members;
  const distanceKm = calculateDistanceKm(locations[uidA], locations[uidB]);
  const sentToday = false; // derivar comparando streak.lastSentByX con la fecha de hoy

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <DaysCounter startDate={couple.startDate?.toDate?.()} />
      <View style={styles.row}>
        <DistanceCard distanceKm={distanceKm} />
        <StreakBadge
          count={couple.streak?.count || 0}
          sentToday={sentToday}
          onSendLove={() => sendLove(couple.id, userProfile.id, couple)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 16 },
});
