import React, { useEffect, useState } from 'react';
import { Text, View, Switch, Alert } from 'react-native';
import { getAffectionFeedback, setAffectionFeedback, watchAffectionFeedback } from '../services/affectionFeedbackService';
import { colors } from './theme';

export default function AffectionSettings({ userId }) {
  const [preferences,setPreferences] = useState(() => getAffectionFeedback(userId));
  useEffect(() => watchAffectionFeedback(userId,setPreferences),[userId]);
  return <View style={{gap:12}}>
    <Text style={{color:colors.muted}}>Solo en este teléfono. El sistema puede limitar la vibración, por ejemplo con ahorro de batería.</Text>
    {[['send','Vibrar al enviar un gesto'],['receive','Vibrar al recibir con la app abierta']].map(([key,label]) =>
      <View key={key} style={{flexDirection:'row',alignItems:'center',minHeight:52,gap:12}}>
        <Text style={{flex:1,color:colors.text}}>{label}</Text>
        <Switch accessibilityLabel={label} value={preferences[key]} onValueChange={value=>{
          try { setAffectionFeedback(userId,{[key]:value}); }
          catch { Alert.alert('Ajuste no guardado','No se ha podido guardar la preferencia en este teléfono.'); }
        }}/>
      </View>)}
    <Text style={{color:colors.muted}}>Los avisos de Amor, Beso, Abrazo y Te echo de menos se controlan juntos en Notificaciones.</Text>
  </View>;
}
