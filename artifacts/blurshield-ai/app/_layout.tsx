import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { CoinProvider } from '@/contexts/CoinContext';
import { ProtectionProvider } from '@/contexts/ProtectionContext';

SplashScreen.preventAutoHideAsync();
// Required so the OAuth authorization browser tab can hand control back to
// the app once a provider redirects to our custom URI scheme.
WebBrowser.maybeCompleteAuthSession();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="language-select" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="platform/[id]" options={{ animation: 'fade' }} />
      <Stack.Screen name="blur-settings" />
      <Stack.Screen name="rewards" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="referral" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="help-support" />
      <Stack.Screen name="dev/audio-filter-test" options={{ animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <ThemeProvider>
              <ErrorBoundary>
                <LanguageProvider>
                  <AuthProvider>
                    <CoinProvider>
                      <ProtectionProvider>
                        <RootLayoutNav />
                      </ProtectionProvider>
                    </CoinProvider>
                  </AuthProvider>
                </LanguageProvider>
              </ErrorBoundary>
            </ThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
