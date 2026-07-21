import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import { supabase } from '../supabase/client';

export default function SpecialDatesScreen() {
  const { couple, userId } = useAppContext();
  const [dates, setDates] = useState([]);
  const [title, setTitle] = useState('');
  const [dateInput, setDateInput] = useState('');

  useEffect(() => {
    if (!couple?.id) return undefined;
    let active = true;

    async function loadDates() {
      const { data, error } = await supabase
        .from('special_dates')
        .select('*')
        .eq('couple_id', couple.id)
        .order('date', { ascending: true });
      if (error) throw error;
      if (active) setDates(data || []);
    }

    loadDates().catch(console.error);
    const channel = supabase
      .channel(`special-dates-${couple.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'special_dates', filter: `couple_id=eq.${couple.id}` },
        () => loadDates().catch(console.error)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [couple?.id]);

  async function handleAdd() {
    if (!title.trim() || !dateInput || !couple?.id || !userId) return;
    const { error } = await supabase.from('special_dates').insert({
      couple_id: couple.id,
      created_by: userId,
      title: title.trim(),
      date: dateInput,
      recurring: true,
      notify_days_before: 3,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
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
            <Text style={styles.itemDate}>
              {new Date(`${item.date}T00:00:00`).toLocaleDateString()}
            </Text>
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
