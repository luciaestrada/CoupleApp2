import React,{useCallback,useRef,useState} from 'react';
import {Alert,FlatList,Text,View,Switch} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {usePairedAppContext} from '../contexts/AppContext';
import {loadMemories,watchMemories,removeMemory,setMemoryFeatured} from '../services/memoryService';
import {Action,Banner} from '../ui/components';
import {colors} from '../ui/theme';

export default function TimelineScreen(){
  const {couple,userId}=usePairedAppContext();
  const [items,setItems]=useState([]),[error,setError]=useState(null),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[more,setMore]=useState(false);
  const revision=useRef(0);
  const [kind,setKind]=useState(null),[featuredOnly,setFeaturedOnly]=useState(false);
  useFocusEffect(useCallback(()=>{
    setItems([]);setLoaded(false);setMore(false);setError(null);
    const stop=watchMemories(couple.id,{onData:rows=>{revision.current++;setItems(rows);setMore(rows.length===50);setLoaded(true);},onError:setError},kind,featuredOnly);
    return()=>{revision.current++;stop();};
  },[couple.id,kind,featuredOnly]));
  async function perform(action){setBusy(true);setError(null);try{await action();}catch(next){setError(next);}finally{setBusy(false);}}
  return <FlatList style={{backgroundColor:colors.background}} contentContainerStyle={{padding:20,gap:16}}
    data={items} keyExtractor={item=>item.id}
    ListHeaderComponent={<View style={{gap:12}}><Text style={{fontSize:26,fontWeight:'700'}}>Vuestra cronología</Text>
      <Text>Momentos guardados de forma explícita. La fecha corresponde al acontecimiento, no a cuándo se guardó.</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[[null,'Todos'],['plan','Planes'],['checkin','Check-ins'],['question','Preguntas']].map(([value,label])=>
        <Action key={value??'all'} title={`${kind===value?'✓ ':''}${label}`} secondary disabled={busy} onPress={()=>setKind(value)}/>)}</View>
      <View style={{flexDirection:'row',alignItems:'center',minHeight:48}}><Text style={{flex:1}}>Solo destacados</Text>
        <Switch accessibilityLabel="Solo recuerdos destacados" value={featuredOnly} disabled={busy} onValueChange={setFeaturedOnly}/></View>
      <Text style={{color:colors.muted}}>Ambos podéis destacar momentos; los destacados son compartidos.</Text>
      {error && <Banner>{['42P01','PGRST205'].includes(error.code)?'La cronología estará disponible al actualizar el servidor.':error.message}</Banner>}
    </View>}
    ListEmptyComponent={<Text>{loaded?'No hay recuerdos con estos filtros.':'Cargando recuerdos…'}</Text>}
    renderItem={({item,index})=><View style={{gap:12}}>
      {(index===0 || items[index-1].event_date.slice(0,7)!==item.event_date.slice(0,7)) &&
        <Text style={{fontSize:20,fontWeight:'700'}}>{new Date(item.event_date+'T12:00:00Z').toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'})}</Text>}
      <View style={{padding:20,gap:10,borderRadius:20,backgroundColor:colors.surface}}>
        <Text>{item.event_date.split('-').reverse().join('/')} · {item.author_id===userId?'Guardado por ti':'Guardado por tu pareja'}</Text>
        <Text style={{fontSize:20,fontWeight:'600'}}>{item.title}</Text><Text selectable>{item.body}</Text>
        <Action title={item.featured?'★ Quitar destacado':'☆ Destacar recuerdo'} secondary disabled={busy} onPress={()=>perform(async()=>{
          await setMemoryFeatured(couple.id,userId,item.id,!item.featured);revision.current++;
          setItems(rows=>rows.map(row=>row.id===item.id?{...row,featured:!item.featured}:row).filter(row=>!featuredOnly||row.featured));
        })}/>
        {item.author_id===userId && <Action title="Retirar recuerdo" secondary disabled={busy} onPress={()=>Alert.alert('Retirar recuerdo','Se eliminará de la cronología de ambos. No se podrá volver a guardar este mismo origen mediante un reintento.',[
          {text:'Cancelar',style:'cancel'},{text:'Retirar',style:'destructive',onPress:()=>perform(async()=>{
            await removeMemory(couple.id,userId,item.id);revision.current++;setItems(rows=>rows.filter(row=>row.id!==item.id));
          })},
        ])}/>}
      </View>
    </View>}
    ListFooterComponent={more?<Action title="Cargar más recuerdos" secondary disabled={busy} onPress={()=>perform(async()=>{
      const stamp=revision.current,rows=await loadMemories(couple.id,items.at(-1),kind,featuredOnly);
      if(stamp!==revision.current)return;
      setItems(current=>[...current,...rows.filter(row=>!current.some(item=>item.id===row.id))]);setMore(rows.length===50);
    })}/>:null}/>;
}
