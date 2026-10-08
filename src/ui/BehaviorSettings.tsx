import React from 'react';
import { Alert, View, Text, Switch, TouchableOpacity } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { DEFAULT_LOCATION_OPTIONS, DEFAULT_EVENT_OPTIONS } from '../services/settingsService';
import { colors } from './theme';
import { requestActivityPermission } from '../features/location/activityService';

export function EventSettings({ settings, saving, save }) {
  const options = { ...DEFAULT_EVENT_OPTIONS, ...settings.event_options };
  return [['enter','Entradas en lugares'],['exit','Salidas de lugares'],['walking','Caminar'],
    ['cycling','Ir en bicicleta'],['driving','Desplazarse en vehículo'],['stationary','Dejar de moverse'],
    ['trip','Recorrido finalizado']].map(([key,label]) => <View key={key} style={{ flexDirection:'row',alignItems:'center',minHeight:52 }}>
    <Text style={{flex:1}}>{label}</Text>
    <Switch accessibilityLabel={`Avisar: ${label}`} disabled={saving} value={options[key]}
      onValueChange={value=>save({event_options:{[key]:value}})} />
  </View>);
}
export function LocationBehaviorSettings({ settings, saving, save }) {
  const options = { ...DEFAULT_LOCATION_OPTIONS, ...settings.location_options };
  async function enableMotion() {
    try {
      const motion = await DeviceMotion.requestPermissionsAsync();
      const activity = await requestActivityPermission();
      Alert.alert('Sensores de movimiento', motion.granted && activity.granted
        ? 'Permisos concedidos. Se utilizarán según tus ajustes de ubicación.'
        : 'No se han concedido todos los permisos. Puedes revisarlos en los ajustes del teléfono.');
    } catch (error) {
      Alert.alert('Sensores no disponibles', error.message ?? 'No se pudieron activar los sensores.');
    }
  }
  return <View style={{ gap:16 }}>
    {[
      ['normal_distance','Movimiento mínimo habitual',[[25,'25 m'],[50,'50 m'],[100,'100 m'],[200,'200 m']]],
      ['normal_interval','Intervalo habitual',[[60,'1 min'],[120,'2 min'],[300,'5 min'],[900,'15 min']]],
      ['live_interval','Corrección de ubicación en vivo',[[5,'5 s'],[10,'10 s'],[20,'20 s'],[30,'30 s'],[60,'60 s']]],
      ['battery_threshold','Considerar batería baja desde',[[10,'10 %'],[20,'20 %'],[30,'30 %'],[50,'50 %']]],
      ['low_battery_mode','Con batería baja o ahorro del sistema',[['balanced','Reducir precisión'],['off','Pausar'],['live','Mantener precisión']]],
    ].map(([key,label,choices])=><View key={key} style={{gap:6}}>
      <Text style={{fontWeight:'600'}}>{label}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{choices.map(([value,text])=><TouchableOpacity key={value}
        accessibilityRole="button" accessibilityState={{selected:options[key]===value,disabled:saving}}
        disabled={saving} onPress={()=>save({location_options:{[key]:value}})}
        style={{padding:12,minHeight:48,borderRadius:10,backgroundColor:options[key]===value?colors.primary:colors.primarySoft}}>
        <Text style={{color:options[key]===value?'white':colors.primary}}>{text}</Text>
      </TouchableOpacity>)}</View>
    </View>)}
    {[
      ['share_battery','Compartir batería y carga'],['share_activity','Compartir actividad'],
      ['save_trips','Guardar recorridos en el chat'],['motion_assist','Usar sensores para ajustar las correcciones'],
    ].map(([key,label])=><View key={key} style={{flexDirection:'row',alignItems:'center',minHeight:52}}>
      <Text style={{flex:1}}>{label}</Text><Switch disabled={saving} value={options[key]} accessibilityLabel={label}
        onValueChange={value=>save({location_options:{[key]:value}})} />
    </View>)}
    <TouchableOpacity accessibilityRole="button" disabled={saving}
      onPress={()=>void enableMotion()} style={{minHeight:48,justifyContent:'center'}}>
      <Text style={{color:colors.primary}}>Permitir sensores de movimiento</Text>
    </TouchableOpacity>
    <Text style={{color:colors.muted}}>Los intervalos son orientativos. Los sensores ayudan mientras la app puede ejecutarse; en segundo plano se utiliza el servicio nativo. Los recorridos solo guardan posiciones reales.</Text>
  </View>;
}
