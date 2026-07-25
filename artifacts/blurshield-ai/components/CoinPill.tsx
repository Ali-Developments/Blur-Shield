import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';

export function CoinPill({ amount }: { amount: number }) {
  const colors = useColors();
  return (
    <View style={[styles.pill, { backgroundColor: `${colors.warning}1F` }]}>
      <Feather name="circle" size={12} color={colors.warning} />
      <Text style={[styles.text, { color: colors.warning }]}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 100,
  },
  text: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
