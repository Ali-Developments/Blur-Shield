import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { GradientButton } from '@/components/GradientButton';

const ONBOARDING_SEEN_KEY = '@blurshield/onboarding_seen';
const { width } = Dimensions.get('window');

const ICONS: (keyof typeof Feather.glyphMap)[] = ['shield', 'eye-off', 'gift'];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const slides = [
    { title: t('onboarding.slide1Title'), body: t('onboarding.slide1Body') },
    { title: t('onboarding.slide2Title'), body: t('onboarding.slide2Body') },
    { title: t('onboarding.slide3Title'), body: t('onboarding.slide3Body') },
  ];

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    router.replace('/login');
  };

  const goNext = () => {
    if (index < slides.length - 1) {
      const nextIndex = index + 1;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setIndex(nextIndex);
    } else {
      finish();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topRow, { paddingTop: insets.top + 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.primary : colors.border,
                  width: i === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={finish}>
          <Text style={[styles.skip, { color: colors.mutedForeground }]}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            <LinearGradient
              colors={[colors.primary, colors.secondary, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.illustration}
            >
              {i === 0 ? (
                <Image
                  source={require('@/assets/illustrations/ai_guardian.png')}
                  style={styles.illustrationImage}
                  contentFit="cover"
                />
              ) : (
                <Feather name={ICONS[i]} size={64} color="#FFFFFF" />
              )}
            </LinearGradient>
            <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{item.body}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <GradientButton
          label={index === slides.length - 1 ? t('onboarding.getStarted') : t('onboarding.next')}
          onPress={goNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  skip: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  slide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 20,
  },
  illustration: {
    width: 220,
    height: 220,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
    overflow: 'hidden',
  },
  illustrationImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
  },
});
