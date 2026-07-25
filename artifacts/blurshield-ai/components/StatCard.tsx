import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { GlassCard } from '@/components/GlassCard';

export function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tint: string;
}) {
  const colors = useColors();
  return (
    <GlassCard style={styles.card} padding={16}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  label: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
  },
});
