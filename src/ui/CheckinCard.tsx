import React, { useEffect, useState } from 'react';
import { Alert, View, Text, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { rememberCheckin } from '../services/memoryService';
import { MOODS, watchCheckins, watchCheckinResponses, saveCheckin, respondCheckin, clearCheckin } from '../services/checkinService';
import { Action, Banner } from './components';
import { colors } from './theme';

function Responses({ id }) {
  const [responses,setResponses] = useState([]);
  useEffect(() => watchCheckinResponses(id,{onData:setResponses,onError:()=>setResponses([])}),[id]);
  return responses.map(row => <Text key={row.user_id} style={{color:colors.primary}}>Tu pareja: {row.text}</Text>);
}
export default function CheckinCard({ coupleId,userId,now }) {
  const [items,setItems] = useState([]), [unavailable,setUnavailable] = useState(false);
  const [error,setError] = useState(null), [busy,setBusy] = useState(false), [editing,setEditing] = useState(false);
  const [mood,setMood] = useState('calm'), [energy,setEnergy] = useState(3), [phrase,setPhrase] = useState('');
  const [replyTo,setReplyTo] = useState(null), [reply,setReply] = useState(''), [sent,setSent] = useState(false);
  useEffect(() => watchCheckins(coupleId,{
    onData: rows => {setItems(rows);setUnavailable(false);},
    onError: err => {
      if (['42P01','PGRST205'].includes(err.code)) setUnavailable(true);
      else setError(err.message);
    },
  }),[coupleId]);
  const active = items.filter(item => Date.parse(item.expires_at)>now);
  const mine = active.find(item=>item.user_id===userId), partner = active.find(item=>item.user_id!==userId);
  const moodLabel = value => MOODS.find(item=>item[0]===value)?.slice(1).join(' ') ?? '';
  async function perform(action) {
    setBusy(true);setError(null);
    try {await action();} catch(err) {setError(err.message);} finally {setBusy(false);}
  }
  function edit() {setMood(mine?.mood??'calm');setEnergy(mine?.energy??3);setPhrase(mine?.phrase??'');setEditing(true);}
  return <View style={{padding:20,gap:12,borderRadius:20,backgroundColor:colors.surface}}>
    <Text style={{fontSize:20,fontWeight:'700',color:colors.text}}>¿Cómo estás hoy?</Text>
    {unavailable ? <Text style={{color:colors.muted}}>El check-in estará disponible al actualizar el servidor.</Text> : <>
      {mine && <><Text>Tú: {moodLabel(mine.mood)} · Energía {mine.energy}/5</Text><Text>{mine.phrase}</Text><Responses key={mine.id} id={mine.id}/></>}
      {partner ? <View style={{gap:8}}>
        <Text style={{fontWeight:'600'}}>Tu pareja: {moodLabel(partner.mood)}</Text>
        <Text>Energía {partner.energy}/5{partner.phrase ? ` · ${partner.phrase}` : ''}</Text>
        <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
          {['❤️','Estoy aquí','Te mando un abrazo'].map(text => <Action key={text} title={text} secondary disabled={busy}
            onPress={()=>perform(async()=>{await respondCheckin(partner.id,text);setSent(true);})}/>)}
          <Action title="Escribir apoyo" secondary disabled={busy} onPress={()=>{setReply('');setReplyTo(partner.id);setError(null);}}/>
        </View>
        {sent && <Text accessibilityLiveRegion="polite">Apoyo enviado. Puedes cambiarlo enviando otra respuesta.</Text>}
      </View> : <Text style={{color:colors.muted}}>Tu pareja aún no ha compartido cómo está hoy.</Text>}
      {mine && partner && mine.mood===partner.mood && <Text>Hoy ambos: {moodLabel(mine.mood)}</Text>}
      <Action title={mine?'Editar mi check-in':'Compartir cómo estoy'} onPress={edit} disabled={busy}/>
      {mine && <Action title="Guardar mi check-in como recuerdo" secondary disabled={busy} onPress={()=>Alert.alert('Conservar este check-in','El ánimo, la energía y la frase actuales quedarán guardados y visibles para ambos después de hoy. Las respuestas de apoyo no se guardarán.',[
        {text:'Cancelar',style:'cancel'},{text:'Guardar recuerdo',onPress:()=>perform(async()=>{
          await rememberCheckin(coupleId,userId,mine);Alert.alert('Recuerdo guardado','Puedes consultarlo y retirarlo desde la cronología de Recuerdos.');
        })},
      ])}/>}
      {mine && <Action title="Retirar mi check-in" secondary disabled={busy} onPress={()=>perform(async()=>{
        await clearCheckin(mine.id);setItems(rows=>rows.filter(row=>row.id!==mine.id));
      })}/>}
      <Text style={{color:colors.muted}}>Opcional y visible hasta terminar el día. No afecta a las rachas.</Text>
    </>}
    {error && <Banner>{error}</Banner>}
    <Modal visible={!!replyTo} transparent animationType="slide" onRequestClose={()=>{if(!busy)setReplyTo(null);}}>
      <KeyboardAvoidingView style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'#0008'}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0,borderRadius:20,backgroundColor:colors.surface}} contentContainerStyle={{padding:20,gap:16}}>
          <Text style={{fontSize:22,fontWeight:'700'}}>Unas palabras de apoyo</Text>
          <TextInput value={reply} onChangeText={setReply} multiline maxLength={280} editable={!busy}
            accessibilityLabel="Tu respuesta de apoyo" placeholder="Estoy aquí para ti…"
            style={{minHeight:100,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text}}/>
          <Text>{reply.length}/280</Text>
          {error && <Banner>{error}</Banner>}
          <Action title="Enviar apoyo" loading={busy} disabled={!reply.trim() || busy} onPress={()=>perform(async()=>{
            await respondCheckin(replyTo,reply.trim());setReplyTo(null);setSent(true);
          })}/>
          <Action title="Cancelar" secondary disabled={busy} onPress={()=>setReplyTo(null)}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={editing} transparent animationType="slide" onRequestClose={()=>{if(!busy)setEditing(false);}}>
      <KeyboardAvoidingView style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'#0008'}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0,borderRadius:20,backgroundColor:colors.surface}}
          contentContainerStyle={{padding:20,gap:16}}>
          <Text style={{fontSize:22,fontWeight:'700'}}>Tu check-in de hoy</Text>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
            {MOODS.map(([value,emoji,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:mood===value}}
              disabled={busy} onPress={()=>setMood(value)} style={{padding:12,minHeight:48,borderRadius:12,backgroundColor:mood===value?colors.primarySoft:colors.background}}>
              <Text>{emoji} {label}</Text>
            </Pressable>)}
          </View>
          <Text>Energía: {energy}/5</Text>
          <View style={{flexDirection:'row',gap:8}}>{[1,2,3,4,5].map(value=><Pressable key={value} accessibilityRole="button"
            accessibilityLabel={`Energía ${value} de 5`} accessibilityState={{selected:energy===value}} disabled={busy}
            onPress={()=>setEnergy(value)} style={{padding:14,minHeight:48,backgroundColor:energy===value?colors.primarySoft:colors.background}}><Text>{value}</Text></Pressable>)}</View>
          <TextInput value={phrase} onChangeText={setPhrase} maxLength={280} multiline editable={!busy}
            accessibilityLabel="Frase opcional" placeholder="Una frase, si te apetece" style={{minHeight:88,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text}}/>
          <Text>{phrase.length}/280</Text>
          {error && <Banner>{error}</Banner>}
          <Action title="Guardar" loading={busy} onPress={()=>perform(async()=>{
            const saved=await saveCheckin(mood,energy,phrase);
            setItems(rows=>[...rows.filter(row=>row.user_id!==userId),saved]);setEditing(false);
          })}/>
          <Action title="Cancelar" secondary disabled={busy} onPress={()=>setEditing(false)}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
