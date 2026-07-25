import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();

  return (
    <View style={[styles.row, isRTL && styles.rowRTL]}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        style={[styles.iconBtn, { backgroundColor: colors.muted }]}
        hitSlop={8}
      >
        <Feather
          name={isRTL ? 'chevron-right' : 'chevron-left'}
          size={20}
          color={colors.foreground}
        />
      </Pressable>
      <Text
        style={[styles.title, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  rowRTL: {
    flexDirection: 'row-reverse',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
  },
  right: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
});
