import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAppContext } from "../contexts/AppContext";
import { watchMessages, sendMessage, sendLoveTap } from "../services/chatService";
import { watchStreak } from "../services/streakService";

export default function ChatScreen() {
  const { userId, couple } = useAppContext();
  const [messages, setMessages] = useState([]);
  const [streak, setStreak] = useState(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!couple) return;
    return watchMessages(couple.id, setMessages);
  }, [couple?.id]);

  useEffect(() => {
    if (!couple) return;
    return watchStreak(couple.id, setStreak);
  }, [couple?.id]);

  if (!couple || !userId) return null;

  function handleSend() {
    if (!text.trim()) return;
    sendMessage(couple.id, userId, text.trim());
    setText("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.streakBar}>
        <Text style={styles.streakText}>🔥 Racha de amor: {streak?.count ?? 0} días</Text>
        <TouchableOpacity onPress={() => sendLoveTap(couple.id, userId)}>
          <Text style={styles.loveTapButton}>💜 Enviar amor</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={messages}
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
          placeholder="Escribe un mensaje..."
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Enviar</Text>
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
  list: { flex: 1, paddingHorizontal: 12 },
  bubble: { maxWidth: "75%", borderRadius: 16, padding: 10, marginVertical: 4 },
  bubbleMine: { backgroundColor: "#FF6B81", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "#eee", alignSelf: "flex-start" },
  bubbleText: { color: "#000" },
  inputBar: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderColor: "#eee" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  sendButton: { justifyContent: "center", marginLeft: 8 },
  sendButtonText: { color: "#FF6B81", fontWeight: "700" },
});
