import { Alert } from 'react-native';
import { openAppSettings, openLocationSettings } from '../services/permissionService';

export function showPermissionSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Abrir Ajustes',
      onPress: () => {
        void openAppSettings();
      },
    },
  ]);
}

export function showLocationSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Abrir Ajustes',
      onPress: () => {
        void openLocationSettings();
      },
    },
  ]);
}

export function confirmBackgroundLocationRequest() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Ubicación permanente',
      'Los lugares guardados necesitan acceso a la ubicación incluso cuando CoupleApp no está abierta. El sistema puede llevarte a Ajustes para seleccionar “Permitir siempre”.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
