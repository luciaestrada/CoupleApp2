import React,{useEffect,useState} from 'react';
import {View,Text,Switch,Alert} from 'react-native';
import {getQuestionPreferences,setQuestionCategory} from '../services/questionService';
import {Banner,Action} from './components';
import {colors} from './theme';

export default function QuestionSettings({coupleId,userId}) {
  const [preferences,setPreferences]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  useEffect(()=>{
    let active=true;
    getQuestionPreferences().then(value=>{if(active)setPreferences(value);}).catch(next=>{if(active)setError(next);});
    return()=>{active=false;};
  },[coupleId,userId]);
  async function save(category,enabled,adultConfirmed=false){
    setBusy(true);setError(null);
    try{setPreferences(await setQuestionCategory(coupleId,userId,category,enabled,adultConfirmed));}
    catch(next){setError(next);}finally{setBusy(false);}
  }
  return <View style={{gap:12}}>
    <Text style={{color:colors.muted}}>Elegid las categorías con las que os sentís cómodos. Solo se podrán elegir las que ambos tengáis activadas.</Text>
    {error && <Banner>{['PGRST202','42P01'].includes(error.code)?'Actualiza el servidor para configurar las preguntas.':error.message}</Banner>}
    {!preferences && !error && <Text>Cargando preferencias…</Text>}
    {preferences && [['fun','Divertidas'],['romantic','Románticas'],['deep','Profundas'],['custom','Personalizadas'],['intimate','Íntimas (mayores de 18 años)']].map(([category,label])=>
      <View key={category} style={{flexDirection:'row',alignItems:'center',minHeight:56,gap:12}}>
        <View style={{flex:1}}><Text>{label}</Text><Text style={{color:colors.muted}}>{preferences.available.includes(category)?'Disponible para ambos':preferences.mine.includes(category)?'Pendiente de la elección de tu pareja':'Desactivada por ti'}</Text></View>
        <Switch accessibilityLabel={label} value={preferences.mine.includes(category)} disabled={busy} onValueChange={enabled=>{
          if(category==='intimate' && enabled) Alert.alert('Activar preguntas íntimas','Confirma que tienes al menos 18 años y deseas participar. Solo se habilitarán cuando tu pareja también confirme. Puedes desactivarlas cuando quieras.',[
            {text:'Cancelar',style:'cancel'},{text:'Confirmo y activo',onPress:()=>void save(category,true,true)},
          ]);
          else void save(category,enabled);
        }}/>
      </View>)}
    <Text style={{color:colors.muted}}>Los cambios se aplican a próximas elecciones. La pregunta ya elegida se conserva; siempre puedes pasarla. Tu elección no envía avisos.</Text>
    <Action title="Actualizar preferencias" secondary disabled={busy} onPress={async()=>{
      setBusy(true);setError(null);
      try{setPreferences(await getQuestionPreferences());}catch(next){setError(next);}finally{setBusy(false);}
    }}/>
  </View>;
}
