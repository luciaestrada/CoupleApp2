import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAppContext } from '../contexts/AppContext';
import {
  cancelPendingCouple,
  createCouple,
  joinCouple,
} from '../services/coupleService';
import { useHeaderHeight } from '@react-navigation/elements';
import { parseCalendarDate } from '../utils/validation';
import { todayInMadrid } from '../utils/dateUtils';

export default function PairingScreen() {
  const headerHeight = useHeaderHeight();
  const { couple, refreshCouple, signOut } = useAppContext();
  const [codeInput, setCodeInput] = useState('');
  const [startDate, setStartDate] = useState(() =>
    todayInMadrid().split('-').reverse().join('/'),
  );
  const [submitting, setSubmitting] = useState(false);

  async function run(action) {
    setSubmitting(true);
    try {
      await action();
      await refreshCouple();
    } catch (error) {
      Alert.alert('No se pudo completar el emparejamiento', error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateCode() {
    if (!parseCalendarDate(startDate)) {
      Alert.alert(
        'Fecha no válida',
        'Introduce una fecha válida en formato DD/MM/AAAA.',
      );
      return;
    }
    void run(() => createCouple(parseCalendarDate(startDate)));
  }

  function handleJoin() {
    const normalizedCode = codeInput.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(normalizedCode)) {
      Alert.alert(
        'Código no válido',
        'Introduce los 8 caracteres del código que te ha dado tu pareja.',
      );
      return;
    }
    void run(() => joinCouple(normalizedCode));
  }

  function handleCancel() {
    Alert.alert(
      'Cancelar invitación',
      'Se eliminará esta pareja pendiente y podrás crear o introducir otro código.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar invitación',
          style: 'destructive',
          onPress: () => void run(cancelPendingCouple),
        },
      ],
    );
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('No se pudo cerrar la sesión', error.message);
    }
  }

  if (couple) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.container}
        >
          <Text style={styles.title}>Invita a tu pareja</Text>
          <Text style={styles.pendingText}>
            Comparte este código. La aplicación continuará automáticamente
            cuando se una.
          </Text>
          <Text selectable style={styles.code}>
            {couple.inviteCode}
          </Text>
          <ActivityIndicator color="#A62450" style={styles.waitingIndicator} />
          <TouchableOpacity
            disabled={submitting}
            style={styles.cancelButton}
            onPress={handleCancel}
          >
            <Text style={styles.signOutText}>Cancelar invitación</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
      >
        <Text style={styles.title}>Vincula con tu pareja</Text>

        <Text style={styles.sectionLabel}>Fecha de inicio de la relación</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Fecha de inicio de la relación"
          maxLength={10}
          placeholder="DD/MM/AAAA"
          value={startDate}
          onChangeText={setStartDate}
        />

        <TouchableOpacity
          disabled={submitting}
          style={[styles.button, submitting && { opacity: 0.5 }]}
          onPress={handleCreateCode}
        >
          <Text style={styles.buttonText}>Generar código de invitación</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>
          O introduce el código de tu pareja
        </Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Código de invitación"
          autoCorrect={false}
          placeholder="Código de invitación"
          autoCapitalize="characters"
          maxLength={8}
          value={codeInput}
          onChangeText={setCodeInput}
        />
        <TouchableOpacity
          disabled={submitting}
          style={styles.button}
          onPress={handleJoin}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Emparejar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    color: '#A62450',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  button: {
    minHeight: 50,
    justifyContent: 'center',
    backgroundColor: '#A62450',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  code: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 4,
  },
  pendingText: { color: '#666', lineHeight: 22, textAlign: 'center' },
  waitingIndicator: { marginTop: 24 },
  cancelButton: { marginTop: 24, alignItems: 'center' },
  signOutButton: { marginTop: 24, alignItems: 'center' },
  signOutText: { color: '#777', fontWeight: '600' },
});
