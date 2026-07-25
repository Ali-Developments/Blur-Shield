import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { GradientButton } from '@/components/GradientButton';

const LANGUAGE_CHOSEN_KEY = '@blurshield/language_chosen';

const OPTIONS: { value: Language; labelKey: 'english' | 'arabic'; native: string }[] = [
  { value: 'en', labelKey: 'english', native: 'English' },
  { value: 'ar', labelKey: 'arabic', native: 'العربية' },
];

export default function LanguageSelectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLanguage();
  const [selected, setSelected] = useState<Language>(language);

  const handleContinue = async () => {
    await setLanguage(selected);
    await AsyncStorage.setItem(LANGUAGE_CHOSEN_KEY, '1');
    router.replace('/onboarding');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 60 }]}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.iconWrap}
      >
        <Feather name="globe" size={28} color="#FFFFFF" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.foreground }]}>{t('language.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('language.subtitle')}
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(opt.value);
              }}
              style={[
                styles.option,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? `${colors.primary}12` : colors.card,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                {opt.native}
              </Text>
              {active ? (
                <View style={[styles.check, { backgroundColor: colors.primary }]}>
                  <Feather name="check" size={13} color="#FFFFFF" />
                </View>
              ) : (
                <View style={[styles.checkEmpty, { borderColor: colors.border }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingBottom: insets.bottom + 20 }}>
        <GradientButton label={t('language.continueLabel')} onPress={handleContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14.5,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
    marginBottom: 32,
  },
  options: {
    gap: 12,
    flex: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1.5,
  },
  optionLabel: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
