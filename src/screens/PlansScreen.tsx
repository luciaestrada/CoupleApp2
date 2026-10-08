import { asError, type AppError } from '../utils/errors';
import {usePagedQuery} from '../features/lists/usePagedQuery';
import type {Plan,PlanDraft} from '../types/domain';
import React,{useState} from 'react';
import {Alert,FlatList,KeyboardAvoidingView,Modal,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import {usePairedAppContext} from '../contexts/AppContext';
import {loadPlans,watchPlans,newPlanDraft,readPlanDraft,writePlanDraft,savePlan,rememberPlan,getPlan} from '../services/planService';
import {todayInMadrid} from '../utils/dateUtils';
import {Action,Banner} from '../ui/components';
import {colors} from '../ui/theme';

const labels: Record<string, string>={pending:'Pendiente',completed:'Completado',archived:'Archivado'};
export default function PlansScreen(){
  const {couple,userId}=usePairedAppContext();
  const [draft,setDraft]=useState<PlanDraft | null>(()=>readPlanDraft(userId,couple.id));
  const page=usePagedQuery<Plan>(couple.id, {load:cursor=>loadPlans(couple.id,cursor),watch:handlers=>watchPlans(couple.id,handlers),compare:(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)});
  const {items,loaded,more}=page;
  const [editing,setEditing]=useState(false),[memory,setMemory]=useState<Plan | null>(null),[date,setDate]=useState(todayInMadrid);
  const [error,setError]=useState<AppError | null>(null),[busy,setBusy]=useState(false);
  function changeDraft(value: PlanDraft | null){
    try{writePlanDraft(userId,couple.id,value);setDraft(value);}catch(next){setError(asError(next));}
  }
  async function perform(action: () => Promise<unknown>){
    setBusy(true);setError(null);
    try{await action();}catch(next){setError(asError(next));}finally{setBusy(false);}
  }
  async function save(){
    if (!draft) return;
    await savePlan(couple.id,userId,draft);
    changeDraft(null);setEditing(false);
    await page.refresh();
  }
  const nextPage=page.next;
  function edit(plan: Plan | null){
    const start=()=>{changeDraft(plan??newPlanDraft());setEditing(true);};
    if(draft && draft.id!==plan?.id) Alert.alert('Hay un borrador guardado','Puedes retomarlo o descartarlo para abrir otro plan.',[
      {text:'Retomar',onPress:()=>setEditing(true)}, {text:'Descartar y continuar',style:'destructive',onPress:start}, {text:'Cancelar',style:'cancel'},
    ]);else start();
  }
  const inputStyle={borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,color:colors.text,minHeight:48};
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <FlatList data={items} keyExtractor={item=>item.id} contentContainerStyle={{padding:20,gap:14}}
      ListHeaderComponent={<View style={{gap:12}}>
        <Text style={{fontSize:24,fontWeight:'700'}}>Planes para compartir</Text>
        <Text>Ambos podéis añadir y editar. Completar un plan no guarda un recuerdo automáticamente.</Text>
        {(error || page.error) && <Banner>{['42P01','PGRST205','PGRST202'].includes((error || page.error)?.code ?? '')?'Los planes estarán disponibles al actualizar el servidor.':(error || page.error)?.message}</Banner>}
        <Action title="Añadir plan" disabled={busy} onPress={()=>edit(null)}/>
        {draft && <Action title="Retomar borrador" secondary disabled={busy} onPress={()=>setEditing(true)}/>}
      </View>}
      ListEmptyComponent={<Text>{loaded?'Aquí aparecerán vuestras ideas.':'Cargando planes…'}</Text>}
      renderItem={({item})=><View style={{padding:18,gap:10,borderRadius:18,backgroundColor:colors.surface}}>
        <Text style={{fontSize:20,fontWeight:'600'}}>{item.title}</Text><Text>{labels[item.status]}{item.category?` · ${item.category}`:''}</Text>
        {!!item.note && <Text>{item.note}</Text>}{!!item.link && <Text selectable>{item.link}</Text>}
        {!!item.planned_date && <Text>Fecha: {item.planned_date.split('-').reverse().join('/')}</Text>}
        <Action title="Editar plan" secondary disabled={busy} onPress={()=>edit(item)}/>
        {item.memory && <View style={{gap:6}}><Text style={{fontWeight:'600'}}>Recuerdo guardado · {item.memory.event_date.split('-').reverse().join('/')}</Text>
          <Text>{item.memory.title}</Text>{!!item.memory.body && <Text>{item.memory.body}</Text>}</View>}
        {item.status==='completed' && !item.memory && <Action title="Guardar como recuerdo" secondary disabled={busy} onPress={()=>{setMemory(item);setDate(todayInMadrid());}}/>}
      </View>}
      ListFooterComponent={more?<Action title="Cargar más planes" secondary disabled={busy} onPress={()=>perform(nextPage)}/>:null}/>
    <Modal visible={editing||!!memory} transparent animationType="slide" onRequestClose={()=>{if(!busy){setEditing(false);setMemory(null);}}}>
      <KeyboardAvoidingView style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'#0008'}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0,borderRadius:20,backgroundColor:colors.surface}} contentContainerStyle={{padding:20,gap:14}}>
          {error && <Banner>{error.message}</Banner>}
          {editing && error?.code==='40001' && <Action title="Cargar versión guardada" secondary disabled={busy} onPress={()=>Alert.alert('Recargar el plan','Esto sustituirá tu borrador por la versión actual de la pareja.',[
            {text:'Conservar borrador',style:'cancel'},{text:'Recargar',onPress:()=>perform(async()=>{ if (draft) changeDraft(await getPlan(couple.id,draft.id)); })},
          ])}/>}
          {memory?<>
            <Text style={{fontSize:22,fontWeight:'700'}}>Guardar este momento</Text><Text>{memory.title}</Text>
            <Text>Fecha del acontecimiento (DD/MM/AAAA). Se conservarán el título y la nota, incluso si después reabrís el plan.</Text>
            <TextInput style={inputStyle} value={date} onChangeText={setDate} editable={!busy} accessibilityLabel="Fecha del recuerdo"/>
            <Action title="Crear recuerdo" loading={busy} onPress={()=>perform(async()=>{
              await rememberPlan(couple.id,userId,memory,date);
              await page.refresh();
              setMemory(null);Alert.alert('Recuerdo guardado','El momento se ha guardado una sola vez para ambos.');
            })}/>
          </>:draft && <>
            <Text style={{fontSize:22,fontWeight:'700'}}>Vuestro plan</Text>
            {([['title','Título',160],['category','Categoría',60],['note','Nota',4000],['link','Enlace (opcional)',2000],['planned_date','Fecha DD/MM/AAAA (opcional)',10]] as const).map(([key,label,max])=><View key={key} style={{gap:6}}>
              <Text>{label}</Text><TextInput accessibilityLabel={label} style={inputStyle} value={draft[key]??''} maxLength={max} multiline={key==='note'} editable={!busy}
                onChangeText={value=>changeDraft({...draft,[key]:value})}/>
            </View>)}
            {Object.entries(labels).map(([value,label])=><Action key={value} title={`${draft.status===value?'✓ ':''}${label}`} secondary disabled={busy} onPress={()=>changeDraft({...draft,status:value})}/>)}
            <Action title="Guardar plan" loading={busy} disabled={!draft.title.trim()} onPress={()=>perform(save)}/>
            <Action title="Descartar borrador" secondary disabled={busy} onPress={()=>{changeDraft(null);setEditing(false);}}/>
          </>}
          <Action title={memory?'Cancelar':'Cerrar y conservar borrador'} secondary disabled={busy} onPress={()=>{setEditing(false);setMemory(null);}}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
