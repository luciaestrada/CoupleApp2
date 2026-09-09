import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { requestPasswordReset } from '../services/accountService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  function getFriendlyAuthError(error) {
    const messagesByCode = {
      email_exists: 'Ya existe una cuenta con ese correo.',
      user_already_exists: 'Ya existe una cuenta con ese correo.',
      invalid_credentials: 'El correo o la contraseña no son correctos.',
      email_address_invalid: 'El correo no tiene un formato válido.',
      weak_password: 'La contraseña no cumple los requisitos de seguridad.',
      signup_disabled: 'El registro de cuentas está desactivado.',
    };
    return messagesByCode[error.code] ?? error.message;
  }

  async function handleSubmit() {
    if (
      !email.trim() ||
      !password || (mode === 'signup' && password.length < 8) ||
      (mode === 'signup' && !name.trim())
    ) {
      setErrorMessage(
        mode === 'signup' ? 'Completa los campos y utiliza una contraseña de al menos 8 caracteres.' : 'Introduce tu correo y contraseña.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      if (mode === 'signup') {
        const data = await signUp({ email, password, name });
        if (!data.session) {
          setSuccessMessage(
            'Cuenta creada. Revisa tu correo para confirmar el registro.',
          );
        }
      } else {
        await signIn({ email, password });
      }
    } catch (error) {
      setErrorMessage(getFriendlyAuthError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF8FA' }}><KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}><View style={styles.card}>
        <Text style={styles.logo}>❤</Text>
        <Text style={styles.title}>CoupleApp</Text>
        <Text style={styles.subtitle}>
          {mode === 'signup'
            ? 'Crea tu cuenta para empezar'
            : 'Entra en vuestro espacio'}
        </Text>

        {mode === 'signup' && (
          <TextInput
            accessibilityLabel="Tu nombre"
            editable={!submitting}
            autoCapitalize="words"
            maxLength={80}
            placeholder="Tu nombre"
            style={styles.input}
            value={name}
            onChangeText={setName}
          />
        )}
        <Text style={styles.fieldLabel}>Correo electrónico</Text>
        <TextInput
          accessibilityLabel="Correo electrónico"
          editable={!submitting}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.fieldLabel}>Contraseña</Text>
        <TextInput
          accessibilityLabel="Contraseña"
          editable={!submitting}
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          placeholder="Contraseña"
          secureTextEntry={!showPassword}
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity accessibilityRole="button" accessibilityState={{ checked: showPassword }} onPress={() => setShowPassword(!showPassword)} style={{ minHeight: 44, justifyContent: 'center', marginBottom: 8 }}><Text style={{ color: '#8A2846' }}>{showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}</Text></TouchableOpacity>
        {!!errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
        {!!successMessage && (
          <Text style={styles.success}>{successMessage}</Text>
        )}

        <TouchableOpacity
          disabled={submitting}
          accessibilityRole="button"
          style={[styles.primaryButton, submitting && { opacity: 0.5 }]}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === 'signup' ? 'Crear cuenta' : 'Entrar'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          disabled={submitting}
          onPress={async () => {
            if (!email.trim()) {
              setErrorMessage(
                'Escribe tu correo para recuperar la contraseña.',
              );
              return;
            }
            setSubmitting(true);
            setErrorMessage('');
            try {
              await requestPasswordReset(email);
              setSuccessMessage(
                'Si la cuenta existe, recibirás un enlace para cambiar tu contraseña.',
              );
            } catch (error) {
              setErrorMessage(getFriendlyAuthError(error));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Text style={styles.switchText}>He olvidado mi contraseña</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={submitting}
          accessibilityRole="button"
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
      </View></ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,

    backgroundColor: '#FFF8FA',
  },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: 'white', borderRadius: 24, padding: 24 },
  logo: { fontSize: 46, color: '#D6336C', textAlign: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8A2846',
    textAlign: 'center',
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  fieldLabel: { fontSize: 14, color: '#30232A', fontWeight: '600', marginBottom: 6 },
  input: {
    minHeight: 48,
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
  switchText: {
    color: '#8A2846',
    textAlign: 'center',
    marginTop: 18,
    fontWeight: '600',
  },
});
