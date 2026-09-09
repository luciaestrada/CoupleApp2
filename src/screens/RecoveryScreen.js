import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { updatePassword } from '../services/accountService';
import { useAuth } from '../context/AuthContext';

export default function RecoveryScreen() {
  const { finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Nueva contraseña</Text>
      <TextInput
        accessibilityLabel="Nueva contraseña"
        placeholder="Mínimo 8 caracteres"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        accessibilityLabel="Repetir contraseña"
        placeholder="Repite la contraseña"
        secureTextEntry
        value={confirmation}
        onChangeText={setConfirmation}
      />
      {error && <Text style={{ color: '#B42318' }}>{error.message}</Text>}
      <TouchableOpacity
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            if (password !== confirmation)
              throw new Error('Las contraseñas no coinciden.');
            await updatePassword(password);
            finishRecovery();
          } catch (next) {
            setError(next);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text>{busy ? 'Guardando…' : 'Guardar contraseña'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        disabled={busy}
        onPress={() => signOut().catch(setError)}
      >
        <Text>Cancelar y cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}
