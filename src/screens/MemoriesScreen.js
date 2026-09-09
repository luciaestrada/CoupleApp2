import React from 'react';
import { ScrollView, Text } from 'react-native';
import { MenuRow } from '../ui/components';
import { colors } from '../ui/theme';
export default function MemoriesScreen({ navigation }) {
  return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 14, backgroundColor: colors.background, flexGrow: 1 }}>
    <Text style={{ fontSize: 26, fontWeight: '700', color: colors.text }}>Lo que compartís</Text>
    <Text style={{ color: colors.muted, lineHeight: 22, marginBottom: 8 }}>Pequeños momentos, emociones y fechas importantes. Todo en vuestro espacio.</Text>
    {[
      ['Historias', 'Fotos que os acompañan durante 24 horas', '▧'],
      ['Fechas', 'Aniversarios y próximos días especiales', '◇'],
      ['Estado', 'Cuéntale cómo te sientes hoy', '♡'],
    ].map(([screen, description, symbol]) => <MenuRow key={screen} title={screen} description={description} symbol={symbol} onPress={() => navigation.navigate(screen)} />)}
    <Text style={{ fontSize: 17, fontWeight: '700', marginTop: 12, color: colors.text }}>También a mano</Text>
    <MenuRow title="Lugares" description="Casa, trabajo y avisos de llegada" symbol="◎" onPress={() => navigation.navigate('Lugares')} />
    <MenuRow title="Avisos" description="Lo último que ha pasado entre vosotros" symbol="·" onPress={() => navigation.navigate('Avisos')} />
  </ScrollView>;
}
