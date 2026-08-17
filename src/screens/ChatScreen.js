import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { usePairedAppContext } from '../contexts/AppContext';
import { sendMessage, watchMessages } from '../services/chatService';
import { sendLove, watchStreaks } from '../services/streakService';
import { todayInMadrid } from '../utils/dateUtils';

export default function ChatScreen() {
  const { userId, partnerId, couple } = usePairedAppContext();
  const [messages, setMessages] = useState([]);
  const [streaks, setStreaks] = useState(couple.streaks ?? []);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return watchMessages(couple.id, { onData: setMessages, onError: setError });
  }, [couple.id]);

  useEffect(() => {
    return watchStreaks(couple.id, { onData: setStreaks, onError: setError });
  }, [couple.id]);

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(couple.id, text);
      setText('');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSending(false);
    }
  }

  async function handleSendLove() {
    setError(null);
    try {
      await sendLove(couple.id);
    } catch (nextError) {
      setError(nextError);
    }
  }

  const myStreak = streaks.find((streak) => streak.userId === userId)?.count ?? 0;
  const partnerStreak = streaks.find((streak) => streak.userId === partnerId)?.count ?? 0;
  const sentLoveToday =
    streaks.find((streak) => streak.userId === userId)?.lastConfirmedDay === todayInMadrid();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.streakBar}>
        <Text style={styles.streakText}>🔥 Tú {myStreak} · Pareja {partnerStreak}</Text>
        <TouchableOpacity disabled={sentLoveToday} onPress={handleSendLove}>
          <Text style={[styles.loveTapButton, sentLoveToday && styles.disabledText]}>
            {sentLoveToday ? '✓ Enviado hoy' : '💜 Enviar amor'}
          </Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error.message}</Text>}

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderId === userId ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.senderId === userId && { color: "#fff" },
              ]}
            >
              {item.loveTap ? "💜" : item.text}
            </Text>
          </View>
        )}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          maxLength={2000}
          placeholder="Escribe un mensaje..."
        />
        <TouchableOpacity disabled={sending} style={styles.sendButton} onPress={handleSend}>
          {sending ? (
            <ActivityIndicator color="#FF6B81" />
          ) : (
            <Text style={styles.sendButtonText}>Enviar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  streakBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF0F3",
  },
  streakText: { fontWeight: "700", color: "#333" },
  loveTapButton: { fontWeight: "700", color: "#FF6B81" },
  disabledText: { color: '#888' },
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: { maxWidth: "75%", borderRadius: 16, padding: 10, marginVertical: 4 },
  bubbleMine: { backgroundColor: "#FF6B81", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "#eee", alignSelf: "flex-start" },
  bubbleText: { color: "#000" },
  inputBar: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderColor: "#eee" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  sendButton: { justifyContent: "center", marginLeft: 8 },
  sendButtonText: { color: "#FF6B81", fontWeight: "700" },
  error: { color: '#B42318', paddingHorizontal: 12, paddingVertical: 8 },
});
