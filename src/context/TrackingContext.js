import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { AppState } from 'react-native';
import * as Battery from 'expo-battery';
import { useAuth } from './AuthContext';
import { useCouple } from './CoupleContext';
import {
  watchSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from '../services/settingsService';
import {
  allowTracking,
  configureTracking,
  onTrackingStatus,
  stopTracking,
  suspendForegroundTracking,
} from '../features/location/trackingEngine';

const Context = createContext(null);
export function TrackingProvider({ children }) {
  const { user } = useAuth();
  const { couple } = useCouple();
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState({ status: 'paused', error: null });
  const settings =
    snapshot && snapshot.userId === user?.id ? snapshot.settings : DEFAULT_SETTINGS;
  const { location_mode, live_until, tracking_device_id, background_enabled } =
    settings;
  useEffect(() => onTrackingStatus(setState), []);
  useEffect(() => {
    if (!user?.id) return undefined;
    return watchSettings(user.id, {
      onData: (value) => setSnapshot({ userId: user.id, settings: value }),
      onError: (error) =>
        setState({ status: 'unavailable', error: error.message }),
    });
  }, [user?.id]);
  useEffect(() => {
    const active = !!user?.id && couple?.members.length === 2;
    const configure = () =>
      configureTracking(
        active
          ? {
              location_mode,
              live_until,
              tracking_device_id,
              background_enabled,
              userId: user.id,
            }
          : null,
      ).catch((error) =>
        setState({ status: 'unavailable', error: error.message }),
      );
    void configure();
    const app = AppState.addEventListener('change', (value) => {
      if (value === 'active') void configure();
      else suspendForegroundTracking();
    });
    const levels = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (
        batteryLevel >= 0 &&
        batteryLevel < 0.2 &&
        AppState.currentState === 'active'
      )
        void configure();
    });
    const battery = Battery.addLowPowerModeListener(() => {
      if (AppState.currentState === 'active') void configure();
    });
    return () => {
      app.remove();
      battery.remove();
      levels.remove();
      void stopTracking({ clear: false }).catch(() => {});
    };
  }, [
    user?.id,
    couple?.id,
    couple?.members.length,
    location_mode,
    live_until,
    tracking_device_id,
    background_enabled,
  ]);
  const update = useCallback(
    async (changes) => {
      if (changes.location_mode === 'off') await stopTracking();
      const value = await saveSettings(changes);
      if (changes.location_mode && changes.location_mode !== 'off')
        allowTracking(user.id);
      setSnapshot({ userId: user.id, settings: value });
    },
    [user],
  );
  return (
    <Context.Provider value={{ settings, ...state, update }}>
      {children}
    </Context.Provider>
  );
}
export function useTracking() {
  return useContext(Context);
}
