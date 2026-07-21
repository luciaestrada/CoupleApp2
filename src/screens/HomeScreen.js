import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAppContext } from "../contexts/AppContext";
import { watchStreak } from "../services/streakService";
import { sendLoveTap } from "../services/chatService";
import {
  startLocationHeartbeat,
  watchUserLocation,
} from "../services/locationService";
import { haversineDistanceKm } from "../utils/haversine";
import { daysTogether, isStreakBroken } from "../utils/dateUtils";

export default function HomeScreen() {
  const { userId, couple, partnerId } = useAppContext();
  const [streak, setStreak] = useState(null);
  const [myCoords, setMyCoords] = useState(null);
  const [partnerCoords, setPartnerCoords] = useState(null);

  useEffect(() => {
    if (!couple) return;
    return watchStreak(couple.id, setStreak);
  }, [couple?.id]);

  // Publica mi ubicación periódicamente
  useEffect(() => {
    if (!userId) return;
    return startLocationHeartbeat(userId);
  }, [userId]);

  // Escucha mi propia ubicación publicada (para tener el mismo dato que ve la pareja)
  useEffect(() => {
    if (!userId) return;
    return watchUserLocation(userId, (lat, lng) => setMyCoords({ lat, lng }));
  }, [userId]);

  // Escucha la ubicación de la pareja
  useEffect(() => {
    if (!partnerId) return;
    return watchUserLocation(partnerId, (lat, lng) => setPartnerCoords({ lat, lng }));
  }, [partnerId]);

  const distanceKm =
    myCoords && partnerCoords
      ? haversineDistanceKm(myCoords.lat, myCoords.lng, partnerCoords.lat, partnerCoords.lng)
      : null;

  if (!couple) {
    return (
      <View style={styles.container}>
        <Text>Todavía no estás emparejado/a.</Text>
      </View>
    );
  }

  const broken = isStreakBroken(streak?.lastConfirmedDay ?? null);

  return (
    <View style={styles.container}>
      <Text style={styles.daysCounter}>
        💞 {daysTogether(couple.startDate)} días juntos
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Racha de amor</Text>
        <Text style={styles.streakNumber}>
          🔥 {streak?.count ?? 0} {broken ? "(rota)" : ""}
        </Text>
        <TouchableOpacity
          style={styles.loveButton}
          onPress={() => userId && sendLoveTap(couple.id, userId)}
        >
          <Text style={styles.loveButtonText}>Enviar amor de hoy 💜</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Distancia</Text>
        <Text style={styles.distanceText}>
          {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : "Calculando..."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  daysCounter: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 20, color: "#FF6B81" },
  card: {
    backgroundColor: "#FFF0F3",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  cardLabel: { fontSize: 14, color: "#888", marginBottom: 8 },
  streakNumber: { fontSize: 32, fontWeight: "800", marginBottom: 12 },
  loveButton: { backgroundColor: "#FF6B81", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  loveButtonText: { color: "#fff", fontWeight: "700" },
  distanceText: { fontSize: 28, fontWeight: "800" },
});
