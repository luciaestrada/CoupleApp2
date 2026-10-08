import { asError, type AppError } from '../utils/errors';
import {usePagedQuery} from '../features/lists/usePagedQuery';
import type {Row} from '../types/domain';
import React,{useState} from 'react';
import {Alert,FlatList,Text,View,Switch} from 'react-native';
import {usePairedAppContext} from '../contexts/AppContext';
import {loadMemories,watchMemories,removeMemory,setMemoryFeatured} from '../services/memoryService';
import {Action,Banner} from '../ui/components';
import {colors} from '../ui/theme';

export default function TimelineScreen(){
  const {couple,userId}=usePairedAppContext();
  const [error,setError]=useState<AppError | null>(null),[busy,setBusy]=useState(false);
  const [kind,setKind]=useState(null),[featuredOnly,setFeaturedOnly]=useState(false);
  const page=usePagedQuery<Row<'memory_entries'>>([couple.id,kind,featuredOnly].join(':'), {
    load:cursor=>loadMemories(couple.id,cursor,kind,featuredOnly),watch:handlers=>watchMemories(couple.id,handlers,kind,featuredOnly),
    compare:(a,b)=>b.event_date.localeCompare(a.event_date)||b.id.localeCompare(a.id),
  });
  const {items,loaded,more}=page;
  async function perform(action){setBusy(true);setError(null);try{await action();}catch(next){setError(asError(next));}finally{setBusy(false);}}
  return <FlatList style={{backgroundColor:colors.background}} contentContainerStyle={{padding:20,gap:16}}
    data={items} keyExtractor={item=>item.id}
    ListHeaderComponent={<View style={{gap:12}}><Text style={{fontSize:26,fontWeight:'700'}}>Vuestra cronología</Text>
      <Text>Momentos guardados de forma explícita. La fecha corresponde al acontecimiento, no a cuándo se guardó.</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[[null,'Todos'],['plan','Planes'],['checkin','Check-ins'],['question','Preguntas']].map(([value,label])=>
        <Action key={value??'all'} title={`${kind===value?'✓ ':''}${label}`} secondary disabled={busy} onPress={()=>setKind(value)}/>)}</View>
      <View style={{flexDirection:'row',alignItems:'center',minHeight:48}}><Text style={{flex:1}}>Solo destacados</Text>
        <Switch accessibilityLabel="Solo recuerdos destacados" value={featuredOnly} disabled={busy} onValueChange={setFeaturedOnly}/></View>
      <Text style={{color:colors.muted}}>Ambos podéis destacar momentos; los destacados son compartidos.</Text>
      {(error || page.error) && <Banner>{['42P01','PGRST205'].includes((error || page.error)?.code ?? '')?'La cronología estará disponible al actualizar el servidor.':(error || page.error)?.message}</Banner>}
    </View>}
    ListEmptyComponent={<Text>{loaded?'No hay recuerdos con estos filtros.':'Cargando recuerdos…'}</Text>}
    renderItem={({item,index})=><View style={{gap:12}}>
      {(index===0 || items[index-1].event_date.slice(0,7)!==item.event_date.slice(0,7)) &&
        <Text style={{fontSize:20,fontWeight:'700'}}>{new Date(item.event_date+'T12:00:00Z').toLocaleDateString('es-ES',{month:'long',year:'numeric',timeZone:'UTC'})}</Text>}
      <View style={{padding:20,gap:10,borderRadius:20,backgroundColor:colors.surface}}>
        <Text>{item.event_date.split('-').reverse().join('/')} · {item.author_id===userId?'Guardado por ti':'Guardado por tu pareja'}</Text>
        <Text style={{fontSize:20,fontWeight:'600'}}>{item.title}</Text><Text selectable>{item.body}</Text>
        <Action title={item.featured?'★ Quitar destacado':'☆ Destacar recuerdo'} secondary disabled={busy} onPress={()=>perform(async()=>{
          await setMemoryFeatured(couple.id,userId,item.id,!item.featured);await page.refresh();
        })}/>
        {item.author_id===userId && <Action title="Retirar recuerdo" secondary disabled={busy} onPress={()=>Alert.alert('Retirar recuerdo','Se eliminará de la cronología de ambos. No se podrá volver a guardar este mismo origen mediante un reintento.',[
          {text:'Cancelar',style:'cancel'},{text:'Retirar',style:'destructive',onPress:()=>perform(async()=>{
            await removeMemory(couple.id,userId,item.id);await page.refresh();
          })},
        ])}/>}
      </View>
    </View>}
    ListFooterComponent={more?<Action title="Cargar más recuerdos" secondary disabled={busy||page.busy} onPress={()=>void page.next()}/>:null}/>;
}
