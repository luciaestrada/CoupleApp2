import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

// Only React Native primitives: the fallback must also work when a native
// dependency, storage, navigation or the backend configuration cannot load.
export default class StartupBoundary extends React.Component {
  state = { error: this.props.startupError ?? null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const detail = this.state.error?.message ?? String(this.state.error);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>No se pudo iniciar CoupleApp</Text>
        <Text style={styles.message}>
          Cierra y vuelve a abrir la aplicación. Si vuelve a ocurrir, comparte
          el siguiente mensaje para que podamos corregirlo.
        </Text>
        <Text selectable style={styles.detail}>{detail}</Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8FA' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 64 },
  title: { color: '#8A2846', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  message: { color: '#333', fontSize: 16, lineHeight: 24 },
  detail: { color: '#666', fontSize: 14, lineHeight: 21, marginTop: 24 },
});
