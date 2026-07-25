import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/contexts/ThemeContext';

export function ProtectionBadge({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  const colors = useColors();
  const color = active ? colors.success : colors.destructive;
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: `${color}1A`, borderColor: `${color}40` },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{active ? activeLabel : inactiveLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
  },
});
