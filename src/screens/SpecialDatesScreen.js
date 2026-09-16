import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePairedAppContext } from '../contexts/AppContext';
import {
  createSpecialDate,
  deleteSpecialDate,
  watchSpecialDates,
} from '../services/specialDatesService';
import { colors } from '../ui/theme';
import { useHeaderHeight } from '@react-navigation/elements';
import { parseCalendarDate } from '../utils/validation';

export default function SpecialDatesScreen() {
  const headerHeight = useHeaderHeight();
  const { couple } = usePairedAppContext();
  const [dates, setDates] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [recurring, setRecurring] = useState(true);
  const [notifyDaysInput, setNotifyDaysInput] = useState('3');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    return watchSpecialDates(couple.id, {
      onData: setDates,
      onError: setError,
    });
  }, [couple.id]);

  async function handleAdd() {
    if (!title.trim()) {
      Alert.alert('Título necesario', 'Escribe un título para la fecha.');
      return;
    }
    if (!parseCalendarDate(dateInput)) {
      Alert.alert(
        'Fecha no válida',
        'Introduce una fecha válida en formato DD/MM/AAAA.',
      );
      return;
    }
    const notifyDaysBefore = Number(notifyDaysInput);
    if (!/^\d{1,3}$/.test(notifyDaysInput) || notifyDaysBefore > 365) {
      Alert.alert(
        'Aviso no válido',
        'Introduce un número de días entre 0 y 365.',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createSpecialDate({
        title,
        date: parseCalendarDate(dateInput),
        recurring,
        notifyDaysBefore,
      });
      setTitle('');
      setDateInput('');
      setFormOpen(false);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(item) {
    Alert.alert('Eliminar fecha', `¿Quieres eliminar “${item.title}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(item.id);
          setError(null);
          try {
            await deleteSpecialDate(item.id);
            setDates((currentDates) =>
              currentDates.filter((date) => date.id !== item.id),
            );
          } catch (nextError) {
            setError(nextError);
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '700',
                color: colors.text,
                marginBottom: 8,
              }}
            >
              Días que importan
            </Text>
            <Text
              style={{ color: colors.muted, marginBottom: 16, lineHeight: 21 }}
            >
              Guardad aniversarios y fechas especiales para recordarlos juntos.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: formOpen }}
              onPress={() => setFormOpen(!formOpen)}
              style={styles.addButton}
            >
              <Text style={styles.addButtonText}>
                {formOpen ? 'Cerrar formulario' : '+ Añadir una fecha'}
              </Text>
            </TouchableOpacity>
            {formOpen && (
              <View style={{ marginBottom: 24 }}>
                {error && <Text style={styles.error}>{error.message}</Text>}
                <Text style={styles.fieldLabel}>Nombre de la fecha</Text>
                <TextInput
                  accessibilityLabel="Nombre de la fecha"
                  style={styles.input}
                  placeholder="Título (ej. Aniversario)"
                  maxLength={100}
                  value={title}
                  onChangeText={setTitle}
                />
                <Text style={styles.fieldLabel}>Fecha · día/mes/año</Text>
                <TextInput
                  accessibilityLabel="Fecha en formato día mes año"
                  maxLength={10}
                  style={styles.input}
                  placeholder="DD/MM/AAAA"
                  value={dateInput}
                  onChangeText={setDateInput}
                />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Repetir cada año</Text>
                  <Switch
                    accessibilityLabel="Repetir cada año"
                    value={recurring}
                    onValueChange={setRecurring}
                    trackColor={{ true: '#F9A8C4' }}
                  />
                </View>
                <Text style={styles.fieldLabel}>
                  Avisar con estos días de antelación
                </Text>
                <TextInput
                  accessibilityLabel="Días de antelación"
                  keyboardType="number-pad"
                  maxLength={3}
                  style={styles.input}
                  placeholder="Días de antelación (0-365)"
                  value={notifyDaysInput}
                  onChangeText={setNotifyDaysInput}
                />
                <TouchableOpacity
                  disabled={saving}
                  style={styles.addButton}
                  onPress={handleAdd}
                >
                  <Text style={styles.addButtonText}>
                    {saving ? 'Guardando…' : 'Añadir fecha'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        data={dates}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDate}>
                {item.recurring ? 'Próxima' : 'Fecha'}:{' '}
                {item.nextOccurrence.toLocaleDateString()}
              </Text>
              <Text style={styles.itemMeta}>
                {item.recurring ? 'Se repite cada año' : 'Una sola vez'} · aviso{' '}
                {item.notify_days_before === 0
                  ? 'el mismo día'
                  : `${item.notify_days_before} días antes`}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={deletingId === item.id}
              onPress={() => handleDelete(item)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteButtonText}>
                {deletingId === item.id ? 'Eliminando…' : 'Eliminar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Todavía no hay fechas especiales.</Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background },
  item: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    flexDirection: 'row',
    paddingVertical: 10,
  },
  itemContent: { flex: 1, paddingRight: 12 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemDate: { fontSize: 12, color: '#666' },
  itemMeta: { marginTop: 3, fontSize: 12, color: '#888' },
  empty: { marginVertical: 24, color: '#999', textAlign: 'center' },
  fieldLabel: { color: colors.text, fontWeight: '600', marginTop: 16 },
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: { color: '#333', fontWeight: '600' },
  addButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  addButtonText: { color: 'white', fontWeight: '600' },
  deleteButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  deleteButtonText: { color: '#B42318', fontSize: 12, fontWeight: '600' },
  error: { color: '#B42318', marginTop: 8 },
});
