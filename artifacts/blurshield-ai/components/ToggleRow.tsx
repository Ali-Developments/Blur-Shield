import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

export function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  icon,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: React.ReactNode;
}) {
  const colors = useColors();
  const { isRTL } = useLanguage();

  return (
    <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
      {icon}
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
  },
});
