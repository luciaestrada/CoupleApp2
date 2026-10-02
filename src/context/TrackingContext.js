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
  flushPendingPrivacy,
  hasPendingPrivacy,
} from '../services/settingsService';
import {
  allowTracking,
  configureTracking,
  onTrackingStatus,
  stopTracking,
  suspendForegroundTracking,
  syncTrackingConfig,
} from '../features/location/trackingEngine';
import { watchQuery } from '../services/realtimeService';
import '../features/location/trackingWake';

const Context = createContext(null);
export function TrackingProvider({ children }) {
  const { user } = useAuth();
  const { couple } = useCouple();
  const [snapshot, setSnapshot] = useState(null);
  const [state, setState] = useState({ status: 'paused', error: null });
  const settings =
    snapshot && snapshot.userId === user?.id ? snapshot.settings : DEFAULT_SETTINGS;
  const { location_mode, live_until, tracking_device_id, background_enabled, auto_live_enabled, shared_precision } =
    settings;
  const locationOptions = JSON.stringify(settings.location_options ?? {});
  useEffect(() => onTrackingStatus(setState), []);
  useEffect(() => () => {
    void stopTracking({ clear: false }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    const retry = async () => {
      if (AppState.currentState !== 'active' || !hasPendingPrivacy(user.id)) return;
      try {
        const value = await flushPendingPrivacy(user.id);
        if (active && value) setSnapshot({ userId: user.id, settings: value });
      } catch { /* The revocation stays on disk until the next foreground retry. */ }
    };
    void retry();
    let timer = AppState.currentState === 'active' ? setInterval(() => void retry(), 30_000) : null;
    const app = AppState.addEventListener('change', state => {
      clearInterval(timer);
      timer = null;
      if (state === 'active') {
        void retry();
        timer = setInterval(() => void retry(), 30_000);
      }
    });
    return () => { active = false; clearInterval(timer); app.remove(); };
  }, [user?.id]);
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
              auto_live_enabled,
              shared_precision,
              location_options: JSON.parse(locationOptions),
              userId: user.id,
            }
          : null,
      ).then(() => syncTrackingConfig().catch(() => {})).catch((error) =>
        setState({ status: 'unavailable', error: error.message }),
      );
    void configure();
    const stopDemand = active ? watchQuery({
      channelName: `map-demand-${user.id}`, table: 'map_view_sessions',
      filter: `target_id=eq.${user.id}`,
      load: async () => { await syncTrackingConfig(); return null; },
      onData: () => {}, onError: () => {},
    }) : () => {};
    const app = AppState.addEventListener('change', (value) => {
      if (value === 'active') void configure();
      else suspendForegroundTracking();
    });
    let wasLow;
    const levels = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel < 0) return;
      const isLow = batteryLevel < ((JSON.parse(locationOptions).battery_threshold ?? 20) / 100);
      if (isLow !== wasLow && AppState.currentState === 'active')
        void configure();
      wasLow = isLow;
    });
    const battery = Battery.addLowPowerModeListener(() => {
      if (AppState.currentState === 'active') void configure();
    });
    return () => {
      app.remove();
      stopDemand();
      battery.remove();
      levels.remove();
    };
  }, [
    user?.id,
    couple?.id,
    couple?.members.length,
    location_mode,
    live_until,
    tracking_device_id,
    background_enabled,
    auto_live_enabled,
    shared_precision,
    locationOptions,
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
