import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import { createInviteCode, joinWithInviteCode } from '../services/authService';

export default function PairingScreen() {
  const { userId, refreshCouple, signOut } = useAppContext();
  const [inviteCode, setInviteCode] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  async function run(action) {
    setSubmitting(true);
    try {
      await action();
      await refreshCouple();
    } catch (error) {
      Alert.alert('Error', error?.message || 'No se pudo completar el emparejamiento');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateCode() {
    if (!userId) return;
    run(async () => {
      const code = await createInviteCode(userId, startDate);
      setInviteCode(code);
    });
  }

  function handleJoin() {
    if (!userId || !codeInput.trim()) return;
    run(() => joinWithInviteCode(codeInput));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vincula con tu pareja</Text>

      <Text style={styles.sectionLabel}>Fecha de inicio de la relación</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        value={startDate}
        onChangeText={setStartDate}
      />

      <TouchableOpacity disabled={submitting} style={styles.button} onPress={handleCreateCode}>
        <Text style={styles.buttonText}>Generar código de invitación</Text>
      </TouchableOpacity>
      {inviteCode && <Text style={styles.code}>{inviteCode}</Text>}

      <Text style={styles.sectionLabel}>O introduce el código de tu pareja</Text>
      <TextInput
        style={styles.input}
        placeholder="Código de invitación"
        autoCapitalize="characters"
        value={codeInput}
        onChangeText={setCodeInput}
      />
      <TouchableOpacity disabled={submitting} style={styles.button} onPress={handleJoin}>
        {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Emparejar</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, color: '#FF6B81' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16 },
  button: { minHeight: 50, justifyContent: 'center', backgroundColor: '#FF6B81', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  code: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginTop: 12, letterSpacing: 4 },
  signOutButton: { marginTop: 24, alignItems: 'center' },
  signOutText: { color: '#777', fontWeight: '600' },
});
