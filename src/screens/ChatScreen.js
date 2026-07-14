import React, { useEffect, useState } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useCouple } from '../context/CoupleContext';
import { sendLove } from '../services/streakService';

export default function ChatScreen() {
  const { userProfile } = useAuth();
  const { couple } = useCouple();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!couple?.id) return;
    const q = query(collection(db, 'couples', couple.id, 'messages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [couple?.id]);

  async function handleSend() {
    if (!text.trim()) return;
    await addDoc(collection(db, 'couples', couple.id, 'messages'), {
      senderId: userProfile.id,
      type: 'text',
      text,
      createdAt: serverTimestamp(),
    });
    setText('');
  }

  return (
    <View style={styles.container}>
      <View style={styles.streakHeader}>
        <Text style={styles.streakText}>🔥 {couple?.streak?.count || 0} días seguidos</Text>
      </View>

      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.senderId === userProfile.id ? styles.mine : styles.theirs]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.loveButton}
          onPress={() => sendLove(couple.id, userProfile.id, couple)}
        >
          <Text>❤️</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribe un mensaje..."
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={{ color: 'white' }}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  streakHeader: { padding: 10, backgroundColor: '#FFEDEE', alignItems: 'center' },
  streakText: { fontWeight: '700', color: '#8A2846' },
  bubble: { margin: 6, padding: 10, borderRadius: 12, maxWidth: '75%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#D6336C' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#EEE' },
  bubbleText: { color: '#000' },
  inputRow: { flexDirection: 'row', padding: 8, alignItems: 'center' },
  loveButton: { marginRight: 6, padding: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#DDD', borderRadius: 20, paddingHorizontal: 12 },
  sendButton: { marginLeft: 6, backgroundColor: '#D6336C', padding: 10, borderRadius: 20 },
});
