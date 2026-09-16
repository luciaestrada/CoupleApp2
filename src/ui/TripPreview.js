import React, { useEffect, useRef, useState } from 'react';
import { Modal, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTrip } from '../services/tripsService';
import OpenMap from '../features/map/OpenMap';
import { Action } from './components';
import { colors } from './theme';

export default function TripPreview({ id, onClose }) {
  const [trip,setTrip]=useState(null),[error,setError]=useState(null);
  const map=useRef(null), ready=useRef(false);
  const center=()=>{if(ready.current && trip?.points?.length) map.current?.fitToCoordinates(trip.points.map(p=>({latitude:p.lat,longitude:p.lng})));};
  useEffect(()=>{
    let active=true;
    ready.current=false;
    void getTrip(id).then(data=>{if(active){setTrip(data);if(!data)setError('Este recorrido ya no está disponible.');}})
      .catch(()=>{if(active)setError('No se pudo abrir el recorrido. Comprueba tu conexión.');});
    return ()=>{active=false;};
  },[id]);
  useEffect(center,[trip]);
  return <Modal visible onRequestClose={onClose} animationType="slide"><SafeAreaView style={{flex:1,backgroundColor:colors.background,padding:16,gap:12}}>
    <Action title="Volver al registro" secondary onPress={onClose} />
    <Text style={{fontWeight:'700',fontSize:22}}>Recorrido compartido</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : !trip ? <ActivityIndicator /> : <>
      <Text>{Math.round(trip.distance_m)} m · {new Date(trip.started_at).toLocaleString('es-ES')}</Text>
      <Text>Ruta aproximada entre posiciones reales{trip.end_reason==='paused'?' · Interrumpida al pausar':''}.</Text>
      <OpenMap ref={map} style={{flex:1}} history={trip.points}
        points={[{...trip.points[0],title:'Inicio',color:'#176647'},{...trip.points.at(-1),title:'Fin',color:'#A62450'}]}
        onMapReady={()=>{ready.current=true;center();}} />
    </>}
  </SafeAreaView></Modal>;
}
