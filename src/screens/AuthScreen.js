import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function getFriendlyAuthError(error) {
    const technicalMessage = String(error?.message || '');
    const normalizedMessage = technicalMessage.toLowerCase();
    const isServerFailure =
      error?.status >= 500 ||
      normalizedMessage.includes('"status":500') ||
      normalizedMessage.includes('unexpected_failure');

    if (isServerFailure && mode === 'signup') {
      return 'El servidor no pudo completar el registro. Revisa la configuración del correo de confirmación de Supabase.';
    }
    if (normalizedMessage.includes('user already registered')) {
      return 'Ya existe una cuenta con ese correo.';
    }
    if (normalizedMessage.includes('invalid login credentials')) {
      return 'El correo o la contraseña no son correctos.';
    }

    return technicalMessage || 'No se pudo completar la autenticación.';
  }

  async function handleSubmit() {
    if (!email.trim() || password.length < 6 || (mode === 'signup' && !name.trim())) {
      setErrorMessage('Completa los campos; la contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      if (mode === 'signup') {
        const data = await signUp({ email, password, name });
        if (!data.session) {
          setSuccessMessage('Cuenta creada. Revisa tu correo para confirmar el registro.');
        }
      } else {
        await signIn({ email, password });
      }
    } catch (error) {
      console.error('Error de autenticación:', error);
      setErrorMessage(getFriendlyAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>❤</Text>
        <Text style={styles.title}>CoupleApp</Text>
        <Text style={styles.subtitle}>
          {mode === 'signup' ? 'Crea tu cuenta para empezar' : 'Entra en vuestro espacio'}
        </Text>

        {mode === 'signup' && (
          <TextInput
            autoCapitalize="words"
            placeholder="Tu nombre"
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
        )}
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="Contraseña"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
        {!!successMessage && <Text style={styles.success}>{successMessage}</Text>}

        <TouchableOpacity disabled={submitting} style={styles.primaryButton} onPress={handleSubmit}>
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === 'signup' ? 'Crear cuenta' : 'Entrar'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setErrorMessage('');
            setSuccessMessage('');
          }}
        >
          <Text style={styles.switchText}>
            {mode === 'signup' ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FFF8FA' },
  card: { backgroundColor: 'white', borderRadius: 24, padding: 24 },
  logo: { fontSize: 46, color: '#D6336C', textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#8A2846', textAlign: 'center' },
  subtitle: { color: '#666', textAlign: 'center', marginTop: 6, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#E5D9DD',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  error: { color: '#B42318', marginBottom: 12 },
  success: { color: '#067647', marginBottom: 12 },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6336C',
    borderRadius: 24,
  },
  primaryButtonText: { color: 'white', fontWeight: '700' },
  switchText: { color: '#8A2846', textAlign: 'center', marginTop: 18, fontWeight: '600' },
});
