import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { watchHomeActivity } from '../services/homeService';
import { activityLabel, todayActivity } from '../features/home/activity';
import { Action, Banner, MenuRow } from './components';
import { colors } from './theme';

export default function TodayCard({ coupleId, userId, now, navigation }) {
  const [messages,setMessages] = useState([]);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState(null);
  useEffect(() => watchHomeActivity(coupleId, {
    onData: rows => { setMessages(rows);setLoaded(true);setError(null); },
    onError: setError,
  }),[coupleId]);
  const items = todayActivity(messages,now);
  return <View style={{padding:20,gap:12,borderRadius:20,backgroundColor:colors.surface}}>
    <Text style={{fontSize:20,fontWeight:'700',color:colors.text}}>Hoy</Text>
    {error && <Banner>No se ha podido actualizar la actividad. {error.message}</Banner>}
    {!loaded && !error && <Text>Cargando vuestra actividad…</Text>}
    {loaded && !items.length && <Text style={{color:colors.muted}}>Un espacio para los momentos que compartáis hoy.</Text>}
    {items.map(item => <MenuRow key={item.id} title={activityLabel(item)} symbol={item.type==='love'?'♡':'·'}
      description={`${item.senderId===userId?'Tú':'Tu pareja'} · ${new Date(item.createdAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'})}`}
      onPress={()=>navigation.navigate('Chat')}/>)}
    <Action title="Abrir conversación" secondary onPress={()=>navigation.navigate('Chat')}/>
  </View>;
}
