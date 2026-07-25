import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { GradientButton } from '@/components/GradientButton';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { login, loginWithProvider, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    clearError();
    setSubmitting(true);
    const ok = await login(email, password);
    setSubmitting(false);
    if (ok) router.replace('/home');
  };

  const handleProvider = async (provider: 'google' | 'apple') => {
    setSubmitting(true);
    await loginWithProvider(provider);
    setSubmitting(false);
    router.replace('/home');
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 40 }]}
      bottomOffset={30}
    >
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.iconWrap}>
        <Feather name="shield" size={26} color="#FFFFFF" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.foreground }]}>{t('auth.welcomeBack')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('auth.loginSubtitle')}
      </Text>

      <View style={styles.form}>
        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Feather name="mail" size={17} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            testID="login-email-input"
          />
        </View>

        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Feather name="lock" size={17} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('auth.password')}
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            testID="login-password-input"
          />
          <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>
            {error === 'invalid' ? 'Incorrect email or password.' : 'Something went wrong.'}
          </Text>
        ) : null}

        <Link href="/forgot-password" asChild>
          <Pressable style={{ alignSelf: isRTL ? 'flex-start' : 'flex-end' }}>
            <Text style={[styles.link, { color: colors.primary }]}>{t('auth.forgotPassword')}</Text>
          </Pressable>
        </Link>

        <GradientButton
          label={t('auth.login')}
          onPress={handleLogin}
          loading={submitting}
          disabled={!email || !password}
        />

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
            {t('auth.orContinueWith')}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <GradientButton
          label={t('auth.google')}
          variant="outline"
          icon={<Feather name="chrome" size={17} color={colors.foreground} />}
          onPress={() => handleProvider('google')}
        />
        <GradientButton
          label={t('auth.apple')}
          variant="outline"
          icon={<Feather name="command" size={17} color={colors.foreground} />}
          onPress={() => handleProvider('apple')}
        />

        <View style={[styles.bottomRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
            {t('auth.noAccount')}
          </Text>
          <Link href="/register" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}> {t('auth.signUp')}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14.5,
    fontFamily: 'Inter_400Regular',
    marginBottom: 28,
  },
  form: { gap: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    height: 54,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    height: '100%',
  },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  link: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
  },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 12.5, fontFamily: 'Inter_400Regular' },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
});
