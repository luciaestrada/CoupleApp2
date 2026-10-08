import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { mapHTML, mapCommand } from './mapDocument';
import { colors } from '../../ui/theme';
import type { StyleProp, ViewStyle } from 'react-native';
import type { EdgePadding, LatLng, Region } from 'react-native-maps';
export interface OpenMapHandle {
  fitToCoordinates: (points: LatLng[], options?: { edgePadding?: EdgePadding; animated?: boolean }) => void;
  animateToRegion: (region: Region, duration?: number) => void;
}
type MapPoint = { lat: number; lng: number; id?: string; title?: string; color?: string;
  details?: string[]; expanded?: boolean; selected?: boolean; accuracy?: number | null };
type Props = { points?: MapPoint[]; history?: { lat: number; lng: number }[];
  style?: StyleProp<ViewStyle>; onMapReady?: () => void; onPanDrag?: () => void;
  onSelectPoint?: (point: LatLng) => void; onMarkerPress?: (id: string) => void };
const EMPTY: never[] = [];
const source = {
  html: mapHTML,
  baseUrl: 'https://supabase.pruebahomelab.es/coupleapp-map/',
};
const OpenMap = forwardRef<OpenMapHandle, Props>(function OpenMap(
  {
    points = EMPTY,
    history = EMPTY,
    style,
    onMapReady,
    onPanDrag,
    onSelectPoint,
    onMarkerPress,
  },
  ref,
) {
  const web = useRef<WebView>(null),
    ready = useRef(false),
    camera = useRef<Region | { points: LatLng[]; edgePadding?: EdgePadding } | null>(null);
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const data = useRef({ points, history });
  useLayoutEffect(() => { data.current = { points, history }; }, [points, history]);
  const send = (name: string, value: unknown) => {
    if (ready.current) web.current?.injectJavaScript(mapCommand(name, value));
  };
  useEffect(() => {
    if (ready.current)
      web.current?.injectJavaScript(
        mapCommand('renderData', { points, history }),
      );
  }, [points, history]);
  useImperativeHandle(ref, () => ({
    fitToCoordinates: (value, options) => {
      camera.current = { points: value, edgePadding: options?.edgePadding };
      send('moveCamera', camera.current);
    },
    animateToRegion: (value) => {
      camera.current = value;
      send('moveCamera', value);
    },
  }));
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#F3EFE9' }, style]}>
      <WebView
        key={revision}
        ref={web}
        source={source}
        originWhitelist={['*']}
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        applicationNameForUserAgent="CoupleApp/1.0 (com.esc.coupleapp)"
        mixedContentMode="never"
        javaScriptEnabled
        domStorageEnabled={false}
        geolocationEnabled={false}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url === source.baseUrl)
            return true;
          if (request.url === 'https://www.openstreetmap.org/copyright')
            void Linking.openURL(request.url);
          return false;
        }}
        onMessage={(event) => {
          let message;
          try {
            message = JSON.parse(event.nativeEvent.data);
          } catch {
            return;
          }
          if (message.type === 'ready') {
            ready.current = true;
            setLoading(false);
            setFailed(false);
            send('renderData', data.current);
            if (camera.current) send('moveCamera', camera.current);
            onMapReady?.();
          }
          if (message.type === 'pan') onPanDrag?.();
          if (message.type === 'marker' && typeof message.id === 'string' &&
            data.current.points.some(point => point.id === message.id && point.details))
            onMarkerPress?.(message.id);
          if (
            message.type === 'point' &&
            Number.isFinite(message.latitude) &&
            Number.isFinite(message.longitude) &&
            Math.abs(message.latitude) <= 90 &&
            Math.abs(message.longitude) <= 180
          )
            onSelectPoint?.({
              latitude: message.latitude,
              longitude: message.longitude,
            });
        }}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onContentProcessDidTerminate={() => {
          ready.current = false;
          setRevision((value) => value + 1);
        }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
      {loading && (
        <ActivityIndicator
          style={{ position: 'absolute', alignSelf: 'center', top: '45%' }}
          color={colors.primary}
        />
      )}
      {failed && (
        <View
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 12,
          }}
        >
          <Text>No se pudo abrir el mapa.</Text>
          <TouchableOpacity
            style={{ minHeight: 48, justifyContent: 'center' }}
            onPress={() => {
              ready.current = false;
              setLoading(true);
              setFailed(false);
              setRevision((value) => value + 1);
            }}
          >
            <Text style={{ color: colors.primary }}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
export default OpenMap;
