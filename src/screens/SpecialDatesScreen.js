import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useCouple } from '../context/CoupleContext';

export default function SpecialDatesScreen() {
  const { couple } = useCouple();
  const [dates, setDates] = useState([]);
  const [title, setTitle] = useState('');
  const [dateInput, setDateInput] = useState(''); // formato YYYY-MM-DD

  useEffect(() => {
    if (!couple?.id) return;
    const unsub = onSnapshot(collection(db, 'couples', couple.id, 'specialDates'), (snap) => {
      setDates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [couple?.id]);

  async function handleAdd() {
    if (!title || !dateInput) return;
    await addDoc(collection(db, 'couples', couple.id, 'specialDates'), {
      title,
      date: new Date(dateInput),
      recurring: true,
      notifyDaysBefore: 3,
      createdAt: serverTimestamp(),
    });
    setTitle('');
    setDateInput('');
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={dates}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemDate}>{new Date(item.date.toDate?.() || item.date).toLocaleDateString()}</Text>
          </View>
        )}
      />
      <TextInput style={styles.input} placeholder="Título (ej. Aniversario)" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={dateInput} onChangeText={setDateInput} />
      <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
        <Text style={styles.addButtonText}>Añadir fecha</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemDate: { fontSize: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 10, marginTop: 10 },
  addButton: { backgroundColor: '#D6336C', padding: 12, borderRadius: 20, alignItems: 'center', marginTop: 10 },
  addButtonText: { color: 'white', fontWeight: '600' },
});
