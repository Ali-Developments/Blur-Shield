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

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { register, error, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRegister = async () => {
    clearError();
    setLocalError(null);
    if (password !== confirmPassword) {
      setLocalError('mismatch');
      return;
    }
    setSubmitting(true);
    const ok = await register(name, email, password);
    setSubmitting(false);
    if (ok) router.replace('/home');
  };

  const errorMessage = localError
    ? 'Passwords do not match.'
    : error === 'exists'
      ? 'An account with this email already exists.'
      : error === 'validation'
        ? 'Please fill all fields — password must be 6+ characters.'
        : null;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      bottomOffset={30}
    >
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
        <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color={colors.foreground} />
      </Pressable>

      <LinearGradient colors={[colors.secondary, colors.accent]} style={styles.iconWrap}>
        <Feather name="user-plus" size={24} color="#FFFFFF" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.foreground }]}>{t('auth.createAccountTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {t('auth.createAccountSubtitle')}
      </Text>

      <View style={styles.form}>
        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Feather name="user" size={17} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('auth.name')}
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
          />
        </View>

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
            secureTextEntry
          />
        </View>

        <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
          <Feather name="lock" size={17} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('auth.confirmPassword')}
            placeholderTextColor={colors.mutedForeground}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        {errorMessage ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{errorMessage}</Text>
        ) : null}

        <GradientButton
          label={t('auth.register')}
          onPress={handleRegister}
          loading={submitting}
          disabled={!name || !email || !password || !confirmPassword}
        />

        <View style={[styles.bottomRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
            {t('auth.haveAccount')}
          </Text>
          <Link href="/login" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}> {t('auth.signIn')}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingBottom: 40 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  subtitle: { fontSize: 14.5, fontFamily: 'Inter_400Regular', marginBottom: 24 },
  form: { gap: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    height: 54,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium', height: '100%' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  link: { fontSize: 13.5, fontFamily: 'Inter_600SemiBold' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
});
