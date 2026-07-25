import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { GradientButton } from '@/components/GradientButton';

type Step = 'find' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const { findAccount, resetPassword } = useAuth();
  const [step, setStep] = useState<Step>('find');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFind = async () => {
    setSubmitting(true);
    const exists = await findAccount(email);
    setSubmitting(false);
    if (exists) {
      setMessage(null);
      setStep('reset');
    } else {
      setMessage('No account found with that email.');
    }
  };

  const handleReset = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    const ok = await resetPassword(email, newPassword);
    setSubmitting(false);
    if (ok) {
      setMessage(null);
      setStep('done');
    } else {
      setMessage('Password must be at least 6 characters.');
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24 }]}
      bottomOffset={30}
    >
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.muted }]}>
        <Feather name={isRTL ? 'chevron-right' : 'chevron-left'} size={20} color={colors.foreground} />
      </Pressable>

      <LinearGradient colors={[colors.accent, colors.primary]} style={styles.iconWrap}>
        <Feather name={step === 'done' ? 'check-circle' : 'key'} size={24} color="#FFFFFF" />
      </LinearGradient>

      <Text style={[styles.title, { color: colors.foreground }]}>{t('auth.resetTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {step === 'find' ? t('auth.resetSubtitleStep1') : step === 'reset' ? t('auth.resetSubtitleStep2') : t('auth.resetSuccess')}
      </Text>

      {message ? <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text> : null}

      {step === 'find' && (
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
            />
          </View>
          <GradientButton label={t('auth.sendResetLink')} onPress={handleFind} loading={submitting} disabled={!email} />
        </View>
      )}

      {step === 'reset' && (
        <View style={styles.form}>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Feather name="lock" size={17} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('auth.newPassword')}
              placeholderTextColor={colors.mutedForeground}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
          </View>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Feather name="lock" size={17} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('auth.confirmNewPassword')}
              placeholderTextColor={colors.mutedForeground}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>
          <GradientButton
            label={t('auth.resetPassword')}
            onPress={handleReset}
            loading={submitting}
            disabled={!newPassword || !confirmPassword}
          />
        </View>
      )}

      {step === 'done' && (
        <View style={styles.form}>
          <GradientButton label={t('auth.backToLogin')} onPress={() => router.replace('/login')} />
        </View>
      )}
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
  subtitle: { fontSize: 14.5, fontFamily: 'Inter_400Regular', marginBottom: 20, lineHeight: 21 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 12 },
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
});
