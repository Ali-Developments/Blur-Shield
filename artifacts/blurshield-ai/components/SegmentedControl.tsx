import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Option<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  const { isRTL } = useLanguage();

  return (
    <View
      style={[
        styles.wrap,
        isRTL && { flexDirection: 'row-reverse' },
        { backgroundColor: colors.muted, borderRadius: colors.radius },
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            style={[
              styles.segment,
              {
                backgroundColor: active ? colors.primary : 'transparent',
                borderRadius: colors.radius - 4,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? '#FFFFFF' : colors.mutedForeground },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
