import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useAppContext } from "../contexts/AppContext";
import { createInviteCode, joinWithInviteCode } from "../services/authService";

export default function PairingScreen() {
  const { userId } = useAppContext();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  async function handleCreateCode() {
    if (!userId) return;
    const code = await createInviteCode(userId);
    setInviteCode(code);
  }

  async function handleJoin() {
    if (!userId) return;
    try {
      await joinWithInviteCode(codeInput, userId, startDate.getTime());
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "No se pudo emparejar");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vincula con tu pareja</Text>

      <Text style={styles.sectionLabel}>Opción A: comparte tu código</Text>
      <TouchableOpacity style={styles.button} onPress={handleCreateCode}>
        <Text style={styles.buttonText}>Generar código de invitación</Text>
      </TouchableOpacity>
      {inviteCode && <Text style={styles.code}>{inviteCode}</Text>}

      <Text style={styles.sectionLabel}>Opción B: introduce su código</Text>
      <TextInput
        style={styles.input}
        placeholder="Código de invitación"
        autoCapitalize="characters"
        value={codeInput}
        onChangeText={setCodeInput}
      />

      <Text style={styles.sectionLabel}>Fecha de inicio de la relación</Text>
      <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text>{startDate.toLocaleDateString()}</Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowPicker(false);
            if (date) setStartDate(date);
          }}
        />
      )}

      <TouchableOpacity style={styles.button} onPress={handleJoin}>
        <Text style={styles.buttonText}>Emparejar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 24, color: "#FF6B81" },
  sectionLabel: { fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 8, color: "#333" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 14, fontSize: 16 },
  dateButton: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 14 },
  button: { backgroundColor: "#FF6B81", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  code: { fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: 12, letterSpacing: 4 },
});