import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const EMOJIS = ['😍', '😴', '😅', '😤', '🥳', '😢', '🤒', '💪'];

export default function StatusScreen() {
  const { userProfile } = useAuth();
  const [text, setText] = useState(userProfile?.status?.text || '');
  const [emoji, setEmoji] = useState(userProfile?.status?.emoji || '😍');

  async function handleSave() {
    await updateDoc(doc(db, 'users', userProfile.id), {
      status: { text, emoji, updatedAt: serverTimestamp() },
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.bigEmoji}>{emoji}</Text>
      <View style={styles.emojiRow}>
        {EMOJIS.map((e) => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)}>
            <Text style={styles.emojiOption}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="¿Cómo estás?"
        maxLength={40}
      />
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>Guardar estado</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center' },
  bigEmoji: { fontSize: 60, marginBottom: 12 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 },
  emojiOption: { fontSize: 30, margin: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, width: '100%', padding: 10, marginBottom: 16 },
  saveButton: { backgroundColor: '#D6336C', padding: 12, borderRadius: 20, width: '100%', alignItems: 'center' },
  saveText: { color: 'white', fontWeight: '600' },
});
