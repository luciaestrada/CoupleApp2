import React from 'react';
import { View } from 'react-native';

export default function TabIcon({ name, color }) {
  const line = { borderWidth: 1.8, borderColor: color, position: 'absolute' };
  return (
    <View accessible={false} style={{ width: 26, height: 26 }}>
      {name === 'Inicio' ? (
        <>
          <View
            style={{
              ...line,
              width: 14,
              height: 14,
              left: 6,
              top: 4,
              transform: [{ rotate: '45deg' }],
              borderRightWidth: 0,
              borderBottomWidth: 0,
            }}
          />
          <View
            style={{
              ...line,
              width: 16,
              height: 13,
              left: 5,
              top: 11,
              borderTopWidth: 0,
              borderRadius: 2,
            }}
          />
        </>
      ) : name === 'Mapa' ? (
        <>
          <View
            style={{
              ...line,
              width: 18,
              height: 18,
              left: 4,
              top: 2,
              borderRadius: 12,
              borderBottomRightRadius: 1,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              ...line,
              width: 6,
              height: 6,
              borderRadius: 6,
              top: 8,
              left: 10,
            }}
          />
        </>
      ) : name === 'Recuerdos' ? (
        <>
          <View
            style={{
              ...line,
              width: 22,
              height: 20,
              left: 2,
              top: 3,
              borderRadius: 4,
            }}
          />
          <View
            style={{
              ...line,
              width: 5,
              height: 5,
              borderRadius: 5,
              left: 6,
              top: 7,
            }}
          />
          <View
            style={{
              ...line,
              width: 9,
              height: 9,
              top: 12,
              left: 12,
              borderRightWidth: 0,
              borderBottomWidth: 0,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </>
      ) : name === 'Chat' ? (
        <>
          <View
            style={{
              ...line,
              width: 22,
              height: 18,
              left: 2,
              top: 3,
              borderRadius: 6,
              borderBottomLeftRadius: 0,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 10,
              height: 2,
              backgroundColor: color,
              left: 8,
              top: 10,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 6,
              height: 2,
              backgroundColor: color,
              left: 8,
              top: 14,
            }}
          />
        </>
      ) : (
        <>
          <View
            style={{
              ...line,
              width: 9,
              height: 9,
              left: 8,
              top: 2,
              borderRadius: 9,
            }}
          />
          <View
            style={{
              ...line,
              width: 20,
              height: 10,
              left: 3,
              top: 14,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomWidth: 0,
            }}
          />
        </>
      )}
    </View>
  );
}
