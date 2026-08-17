import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { usePairedAppContext } from '../contexts/AppContext';
import { clearMyStatus, setMyStatus, watchStatus } from "../services/statusService";

const QUICK_EMOJIS = ["😍", "😴", "🥰", "😢", "🤒", "🎉", "😤", "🥹"];

export default function StatusScreen() {
  const { userId, couple, partnerId } = usePairedAppContext();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState('');
  const [myStatus, setMyStatusState] = useState(null);
  const [partnerStatus, setPartnerStatus] = useState(null);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    return watchStatus(couple.id, userId, { onData: setMyStatusState, onError: setError });
  }, [couple.id, userId]);

  useEffect(() => {
    return watchStatus(couple.id, partnerId, { onData: setPartnerStatus, onError: setError });
  }, [couple.id, partnerId]);

  async function handlePublish() {
    if (!text.trim() && !emoji) return;
    setPublishing(true);
    setError(null);
    try {
      await setMyStatus(text, emoji);
      setText('');
      setEmoji('');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPublishing(false);
    }
  }

  async function handleClear() {
    setPublishing(true);
    setError(null);
    try {
      await clearMyStatus();
    } catch (nextError) {
      setError(nextError);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Estado de tu pareja</Text>
      {error && <Text style={styles.error}>{error.message}</Text>}
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

      <TouchableOpacity
        disabled={publishing || (!text.trim() && !emoji)}
        style={[
          styles.publishButton,
          (publishing || (!text.trim() && !emoji)) && styles.disabled,
        ]}
        onPress={handlePublish}
      >
        <Text style={styles.publishButtonText}>
          {publishing ? 'Publicando…' : 'Publicar estado (24h)'}
        </Text>
      </TouchableOpacity>
      {myStatus && (
        <TouchableOpacity disabled={publishing} style={styles.clearButton} onPress={handleClear}>
          <Text style={styles.clearButtonText}>Quitar mi estado</Text>
        </TouchableOpacity>
      )}
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
  clearButton: { alignItems: 'center', marginTop: 16, padding: 8 },
  clearButtonText: { color: '#777', fontWeight: '600' },
  disabled: { opacity: 0.55 },
  error: { color: '#B42318', marginBottom: 8 },
});
