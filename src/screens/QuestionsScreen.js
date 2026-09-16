import React, {useCallback,useState} from 'react';
import {AppState,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useHeaderHeight} from '@react-navigation/elements';
import {usePairedAppContext} from '../contexts/AppContext';
import {watchDailyQuestion,loadQuestion,chooseDailyQuestion,answerDailyQuestion,skipDailyQuestion,createCustomQuestion} from '../services/questionService';
import {Action,Banner} from '../ui/components';
import {colors} from '../ui/theme';
import {todayInMadrid} from '../utils/dateUtils';

export default function QuestionsScreen({navigation}) {
  const {couple,userId}=usePairedAppContext();
  const headerHeight=useHeaderHeight();
  const [snapshot,setSnapshot]=useState(null),[editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const [now,setNow]=useState(Date.now);
  const [custom,setCustom]=useState(null);
  const day=todayInMadrid(new Date(now));
  useFocusEffect(useCallback(()=>{
    let timer;
    const clock=state=>{
      clearInterval(timer);
      if(state==='active'){setNow(Date.now());timer=setInterval(()=>setNow(Date.now()),30000);}
    };
    clock(AppState.currentState);
    const app=AppState.addEventListener('change',clock);
    setEditor(null);setSnapshot(null);setCustom(null);
    const stop=watchDailyQuestion(couple.id,day,{onData:value=>{setSnapshot(value);setError(null);},onError:setError});
    return()=>{stop();clearInterval(timer);app.remove();};
  },[couple.id,day]));
  const q=snapshot?.question;
  const mine=snapshot?.answers.find(row=>row.user_id===userId);
  async function perform(action){
    setBusy(true);setError(null);
    try{await action();setSnapshot(await loadQuestion(couple.id));setEditor(null);setCustom(null);}
    catch(next){setError(next);}finally{setBusy(false);}
  }
  return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={headerHeight}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,padding:20,gap:16,backgroundColor:colors.background}}>
      <Text style={{fontSize:24,fontWeight:'700',color:colors.text}}>Una pregunta para vosotros</Text>
      <Text style={{color:colors.muted}}>Cada respuesta permanece privada hasta que ambos contestéis. Podéis pasar hoy sin perder ninguna racha.</Text>
      {error && <Banner>{['42P01','PGRST205','PGRST202'].includes(error.code)?'Las preguntas estarán disponibles al actualizar el servidor.':error.message}</Banner>}
      {!snapshot && !error && <Text>Cargando…</Text>}
      {snapshot && !q && <>
        <Text>Elegid la categoría de hoy. La primera elección será la misma para ambos.</Text>
        {[['fun','Divertida'],['romantic','Romántica'],['deep','Profunda'],['intimate','Íntima']].filter(([category])=>snapshot.preferences?.available.includes(category)).map(([category,label])=>
          <Action key={category} title={label} secondary disabled={busy} onPress={()=>perform(()=>chooseDailyQuestion(category))}/>)}
        {snapshot.preferences?.available.includes('custom') && (custom===null ? <Action title="Escribir nuestra propia pregunta" secondary disabled={busy} onPress={()=>setCustom('')}/> : <>
          <Text>La pregunta será visible para ambos; las respuestas seguirán siendo privadas hasta la revelación.</Text>
          <TextInput value={custom} onChangeText={setCustom} multiline maxLength={500} editable={!busy}
            accessibilityLabel="Pregunta personalizada" placeholder="¿Qué te gustaría preguntarnos?"
            style={{minHeight:100,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text}}/>
          <Text>{custom.length}/500</Text>
          <Action title="Elegir esta pregunta para hoy" loading={busy} disabled={!custom.trim()}
            onPress={()=>perform(()=>createCustomQuestion(couple.id,userId,day,custom))}/>
          <Action title="Cancelar" secondary disabled={busy} onPress={()=>setCustom(null)}/>
        </>)}
        {!snapshot.preferences?.available.length && <Text>No tenéis categorías activadas en común.</Text>}
        <Action title="Configurar categorías" secondary disabled={busy} onPress={()=>navigation.navigate('Ajustes')}/>
      </>}
      {q && <View style={{padding:20,gap:16,borderRadius:20,backgroundColor:colors.surface}}>
        <Text style={{fontSize:20,fontWeight:'600',color:colors.text}}>{q.prompt}</Text>
        {q.revealed_at ? <>
          <Text>Vuestras respuestas</Text>
          {snapshot.answers.map(row=><View key={row.user_id} style={{gap:6}}>
            <Text style={{fontWeight:'700'}}>{row.user_id===userId?'Tú':'Tu pareja'}</Text><Text selectable>{row.answer}</Text>
          </View>)}
          <Text style={{color:colors.muted}}>Ya están reveladas y no se pueden editar.</Text>
        </> : Date.parse(q.closes_at)<=now ? <Text>Esta pregunta ha terminado. Las respuestas incompletas no se revelan.</Text> : <>
          {snapshot.skipped ? <>
            <Text>Has decidido pasar hoy. Puedes retomar la pregunta antes de terminar el día.</Text>
            <Action title="Retomar pregunta" secondary disabled={busy} onPress={()=>perform(()=>skipDailyQuestion(q.id,false))}/>
          </> : <>
          {mine && <><Text>Tu respuesta, todavía privada:</Text><Text selectable>{mine.answer}</Text><Text style={{color:colors.muted}}>Se revelará cuando ambos hayáis respondido.</Text></>}
          {editor ? <>
            <TextInput multiline maxLength={2000} value={editor.text} editable={!busy}
              onChangeText={text=>setEditor(value=>({...value,text}))} accessibilityLabel="Tu respuesta privada"
              style={{minHeight:120,padding:12,borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text}}/>
            <Action title="Guardar respuesta" loading={busy} disabled={!editor.text.trim()} onPress={()=>perform(()=>answerDailyQuestion(q.id,editor.text,editor.version))}/>
            <Action title="Cancelar edición" secondary disabled={busy} onPress={()=>setEditor(null)}/>
          </> : <Action title={mine?'Editar mi respuesta':'Responder'} disabled={busy} onPress={()=>setEditor({text:mine?.answer??'',version:mine?.version??0})}/>}
          <Action title={mine?'Retirar mi respuesta y pasar hoy':'Pasar hoy'} secondary disabled={busy} onPress={()=>perform(()=>skipDailyQuestion(q.id,true))}/>
          </>}
        </>}
      </View>}
      <Action title="Volver a Inicio" secondary disabled={busy} onPress={()=>navigation.navigate('Inicio')}/>
    </ScrollView>
  </KeyboardAvoidingView>;
}
