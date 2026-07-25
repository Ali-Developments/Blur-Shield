import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/contexts/ThemeContext';

const LANGUAGE_CHOSEN_KEY = '@blurshield/language_chosen';
const ONBOARDING_SEEN_KEY = '@blurshield/onboarding_seen';

export default function SplashGate() {
  const colors = useColors();
  const { isReady: langReady } = useLanguage();
  const { isReady: authReady, user } = useAuth();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!langReady || !authReady || navigatedRef.current) return;

    (async () => {
      const [languageChosen, onboardingSeen] = await Promise.all([
        AsyncStorage.getItem(LANGUAGE_CHOSEN_KEY),
        AsyncStorage.getItem(ONBOARDING_SEEN_KEY),
      ]);

      await new Promise((resolve) => setTimeout(resolve, 900));
      navigatedRef.current = true;

      if (!languageChosen) {
        router.replace('/language-select');
      } else if (!onboardingSeen) {
        router.replace('/onboarding');
      } else if (!user) {
        router.replace('/login');
      } else {
        router.replace('/home');
      }
    })();
  }, [langReady, authReady, user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.logo}
      >
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImage}
          contentFit="cover"
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 108,
    height: 108,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});
