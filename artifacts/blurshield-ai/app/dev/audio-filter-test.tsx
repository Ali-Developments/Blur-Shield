import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { buildAudioTestPageHtml } from '@/lib/audioTestTone';

// Dev-only self-test: verifies the WebView can play audio via a synthetic
// CORS-free data-URI tone page. Useful for confirming audio playback works
// in the WebView before a real YouTube processing session.
export default function AudioFilterTestScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { t }   = useLanguage();
  const webviewRef = useRef<WebView>(null);
  const html = buildAudioTestPageHtml();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <ScreenHeader title={t('audioTest.title')} />
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t('audioTest.subtitle')}
        </Text>
      </View>
      <View style={{ height: 260 }}>
        <WebView
          ref={webviewRef}
          source={{ html }}
          style={{ flex: 1 }}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
        />
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {t('audioTest.instructions')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 6 },
  hint:     { fontSize: 12.5, fontFamily: 'Inter_500Medium', marginTop: 4, lineHeight: 18 },
});
