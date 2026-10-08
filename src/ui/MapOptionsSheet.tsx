import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import BottomSheet, { BottomSheetScrollView, useBottomSheetSpringConfigs } from '@gorhom/bottom-sheet';
import { colors } from './theme';

interface Header { renderCompact(): React.ReactNode; expanded: boolean; toggle(): void; onLayout(event: LayoutChangeEvent): void }
const HeaderContext = createContext<Header | null>(null);
// Keep the handle component identity stable while live map data changes.
function CompactHandle() {
  const header = useContext(HeaderContext);
  if (!header) throw new Error('Falta el contexto del panel de ubicación.');
  const { renderCompact, expanded, toggle, onLayout } = header;
  return <View onLayout={onLayout}>
    <View style={styles.gripArea} accessible accessibilityRole="adjustable"
      accessibilityLabel="Panel de ubicación" accessibilityState={{ expanded }}
      accessibilityActions={[{ name: 'increment', label: 'Desplegar' }, { name: 'decrement', label: 'Plegar' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if ((nativeEvent.actionName === 'increment' && !expanded) ||
          (nativeEvent.actionName === 'decrement' && expanded)) toggle();
      }}><View style={styles.grip} /></View>
    {renderCompact()}
  </View>;
}

const MapOptionsSheet = forwardRef<{ close(): void }, { renderCompact(): React.ReactNode; children: React.ReactNode }>(function MapOptionsSheet({ renderCompact, children }, ref) {
  const sheet = useRef<BottomSheet>(null);
  const targetIndex = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [compactHeight, setCompactHeight] = useState(76);
  const [containerHeight, setContainerHeight] = useState(600);
  const snapPoints = useMemo(() => [compactHeight, Math.max(compactHeight + 1, containerHeight * 0.82)], [compactHeight, containerHeight]);
  const animationConfigs = useBottomSheetSpringConfigs({ damping: 28, stiffness: 260, mass: 1, overshootClamping: true });
  const collapse = useCallback(() => {
    targetIndex.current = 0;
    setExpanded(false);
    sheet.current?.snapToIndex(0);
  }, []);
  const toggle = useCallback(() => {
    const index = targetIndex.current === 0 ? 1 : 0;
    targetIndex.current = index;
    setExpanded(index === 1);
    sheet.current?.snapToIndex(index);
  }, []);
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => setCompactHeight(Math.ceil(event.nativeEvent.layout.height)), []);
  const onChange = useCallback((index: number) => {
    targetIndex.current = index;
    setExpanded(index === 1);
  }, []);
  useImperativeHandle(ref, () => ({ close: collapse }), [collapse]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (targetIndex.current === 0) return false;
      collapse();
      return true;
    });
    return () => subscription.remove();
  }, [collapse]);
  const header = useMemo(() => ({ renderCompact, expanded, toggle, onLayout: onHeaderLayout }), [renderCompact, expanded, toggle, onHeaderLayout]);

  return <View style={styles.container} pointerEvents="box-none"
    onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}>
    <HeaderContext.Provider value={header}>
      <BottomSheet ref={sheet} index={0} snapPoints={snapPoints}
        enableDynamicSizing={false} animateOnMount={false} enablePanDownToClose={false}
        enableContentPanningGesture enableHandlePanningGesture animationConfigs={animationConfigs}
        handleComponent={CompactHandle} backgroundStyle={styles.background} style={styles.shadow}
        onChange={onChange} onAnimate={(_, toIndex) => onChange(toIndex)}>
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
          accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
          {children}
        </BottomSheetScrollView>
      </BottomSheet>
    </HeaderContext.Provider>
  </View>;
});
export default MapOptionsSheet;

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  background: { backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  shadow: { elevation: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: -2 } },
  gripArea: { height: 16, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  content: { paddingBottom: 16 },
});
