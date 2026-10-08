import { asError, type AppError } from '../utils/errors';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updatePassword } from '../services/accountService';
import { useAuth } from '../context/AuthContext';
import { Action, Banner } from '../ui/components';
import { colors } from '../ui/theme';
export default function RecoveryScreen() {
  const { finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<AppError | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (password.length < 8)
        throw new Error('Utiliza al menos 8 caracteres.');
      if (password !== confirmation)
        throw new Error('Las contraseñas no coinciden.');
      await updatePassword(password);
      finishRecovery();
    } catch (e) {
      setError(asError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              padding: 24,
              borderRadius: 24,
              gap: 16,
            }}
          >
            <Text
              style={{ fontSize: 26, fontWeight: '700', color: colors.text }}
            >
              Una nueva contraseña
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 22 }}>
              Elige una contraseña de al menos 8 caracteres para volver a
              vuestro espacio.
            </Text>
            {[
              [password, setPassword, 'Nueva contraseña'],
              [confirmation, setConfirmation, 'Repite la contraseña'],
            ].map(([value, change, label]) => (
              <View key={label} style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {label}
                </Text>
                <TextInput
                  accessibilityLabel={label}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!busy}
                  value={value}
                  onChangeText={change}
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 14,
                  }}
                />
              </View>
            ))}
            {error && <Banner>{error.message}</Banner>}
            <Action
              title="Guardar contraseña"
              loading={busy}
              disabled={!password || !confirmation}
              onPress={save}
            />
            <Action
              title="Cancelar y cerrar sesión"
              secondary
              disabled={busy}
              onPress={() => signOut().catch(setError)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
