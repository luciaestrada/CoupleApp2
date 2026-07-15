import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useAppContext } from "../contexts/AppContext";
import { setMyStatus, watchStatus } from "../services/statusService";
import { StatusMessage } from "../types";

const QUICK_EMOJIS = ["😍", "😴", "🥰", "😢", "🤒", "🎉", "😤", "🥹"];

export default function StatusScreen() {
  const { userId, couple, partnerId } = useAppContext();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState<string | undefined>();
  const [myStatus, setMyStatusState] = useState<StatusMessage | null>(null);
  const [partnerStatus, setPartnerStatus] = useState<StatusMessage | null>(null);

  useEffect(() => {
    if (!couple || !userId) return;
    return watchStatus(couple.id, userId, setMyStatusState);
  }, [couple?.id, userId]);

  useEffect(() => {
    if (!couple || !partnerId) return;
    return watchStatus(couple.id, partnerId, setPartnerStatus);
  }, [couple?.id, partnerId]);

  async function handlePublish() {
    if (!couple || !userId) return;
    await setMyStatus(couple.id, userId, text.trim(), emoji);
    setText("");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Estado de tu pareja</Text>
      <View style={styles.partnerCard}>
        {partnerStatus ? (
          <Text style={styles.partnerText}>
            {partnerStatus.emoji} {partnerStatus.text}
          </Text>
        ) : (
          <Text style={styles.empty}>Sin estado activo</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Tu estado</Text>
      {myStatus && (
        <Text style={styles.currentStatus}>
          Actual: {myStatus.emoji} {myStatus.text}
        </Text>
      )}

      <View style={styles.emojiRow}>
        {QUICK_EMOJIS.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.emojiButton, emoji === e && styles.emojiSelected]}
            onPress={() => setEmoji(e)}
          >
            <Text style={styles.emojiText}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Escribe una frase corta..."
        maxLength={60}
        value={text}
        onChangeText={setText}
      />

      <TouchableOpacity style={styles.publishButton} onPress={handlePublish}>
        <Text style={styles.publishButtonText}>Publicar estado (24h)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginTop: 12, marginBottom: 8 },
  partnerCard: { backgroundColor: "#FFF0F3", borderRadius: 12, padding: 16 },
  partnerText: { fontSize: 18 },
  empty: { color: "#999" },
  currentStatus: { color: "#666", marginBottom: 8 },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  emojiButton: { padding: 8, borderRadius: 10, borderWidth: 1, borderColor: "#ddd" },
  emojiSelected: { borderColor: "#FF6B81", backgroundColor: "#FFF0F3" },
  emojiText: { fontSize: 22 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  publishButton: { backgroundColor: "#FF6B81", borderRadius: 12, padding: 16, alignItems: "center" },
  publishButtonText: { color: "#fff", fontWeight: "700" },
});