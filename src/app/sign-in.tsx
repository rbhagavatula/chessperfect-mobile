import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider } from '@/components/civ-ornament';
import { RoyalPanel } from '@/components/royal-panel';
import { colors } from '@/constants/colors';
import { ApiError } from '@/lib/api';
import { signInWithPassword } from '@/lib/auth';
import { config } from '@/lib/config';
import { saveSession } from '@/lib/session';

export default function SignInScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const passwordInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  function revealForm() {
    // Wait for the keyboard animation to resize the viewport before scrolling.
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250);
  }

  async function signIn() {
    const normalizedUsername = username.trim();
    setError(undefined);

    if (!normalizedUsername || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (normalizedUsername.includes('@')) {
      setError('Use your ChessPerfect username, not your email address.');
      return;
    }

    try {
      setSubmitting(true);
      const response = await signInWithPassword(normalizedUsername, password);

      if (response.mustChangePassword) {
        setError('Change your temporary password on chessperfect.com before using the mobile app.');
        return;
      }
      if (response.academyConsentRequired) {
        setError('Complete the required academy consent on chessperfect.com before using the mobile app.');
        return;
      }

      await saveSession({
        accessToken: response.accessToken,
        expiresAt:
          typeof response.expiresIn === 'number'
            ? Date.now() + response.expiresIn * 1000
            : undefined,
        loginSessionId: response.loginSessionId || undefined,
        refreshToken: response.refreshToken,
        tokenType: response.tokenType,
        username: normalizedUsername,
      });
      setPassword('');
      router.replace({ pathname: '/home', params: { username: normalizedUsername } });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError('That username or password is not correct.');
      } else if (caught instanceof ApiError && caught.status === 403) {
        setError(caught.message || 'This account does not have mobile access.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openAccountPage(path: '/forgot-password' | '/signup') {
    void WebBrowser.openBrowserAsync(`${config.apiBaseUrl}${path}`);
  }

  return (
    <LinearGradient
      colors={[colors.ink, colors.indigo, colors.terracottaDeep, colors.ink]}
      locations={[0, 0.45, 0.8, 1]}
      style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}>
            <RoyalPanel style={styles.card}>
              <Image
                accessibilityIgnoresInvertColors
                contentFit="contain"
                source={require('@/assets/images/chessperfect-logo-transparent-v2.png')}
                style={styles.mark}
              />
              <Text style={styles.kicker}>YOUR CHESS JOURNEY</Text>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Return to the board and continue a tradition that began with Chaturanga.
              </Text>

              <OrnamentDivider />

              {error ? (
                <View accessibilityLiveRegion="polite" style={styles.errorBanner}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>USERNAME</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  editable={!submitting}
                  maxLength={80}
                  onChangeText={setUsername}
                  onFocus={revealForm}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  placeholder="Your ChessPerfect username"
                  placeholderTextColor="#887a70"
                  returnKeyType="next"
                  style={styles.input}
                  value={username}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>PASSWORD</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="current-password"
                    editable={!submitting}
                    maxLength={128}
                    onChangeText={setPassword}
                    onFocus={revealForm}
                    onSubmitEditing={signIn}
                    placeholder="Enter your password"
                    placeholderTextColor="#887a70"
                    returnKeyType="done"
                    secureTextEntry={!passwordVisible}
                    style={styles.passwordInput}
                    ref={passwordInputRef}
                    value={password}
                  />
                  <Pressable
                    accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setPasswordVisible((visible) => !visible)}>
                    <Text style={styles.showText}>{passwordVisible ? 'HIDE' : 'SHOW'}</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={signIn}
                style={({ pressed }) => [
                  styles.signInButton,
                  pressed && styles.pressed,
                  submitting && styles.disabled,
                ]}>
                <LinearGradient
                  colors={['#b51f17', colors.terracotta, '#6f0d0a']}
                  style={styles.buttonGradient}>
                  {submitting ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Text style={styles.buttonText}>Sign in</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.accountLinks}>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={10}
                  onPress={() => openAccountPage('/forgot-password')}
                  style={({ pressed }) => [
                    styles.accountLinkButton,
                    pressed && styles.linkPressed,
                  ]}>
                  <Text style={styles.accountLinkText}>Forgot Password</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  hitSlop={10}
                  onPress={() => openAccountPage('/signup')}
                  style={({ pressed }) => [
                    styles.accountLinkButton,
                    pressed && styles.linkPressed,
                  ]}>
                  <Text style={styles.accountLinkText}>Register</Text>
                </Pressable>
              </View>
            </RoyalPanel>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
  },
  mark: {
    alignSelf: 'center',
    height: 88,
    marginBottom: 10,
    width: 88,
  },
  kicker: {
    color: colors.saffron,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 7,
    textAlign: 'center',
  },
  title: {
    color: colors.goldLight,
    fontFamily: 'serif',
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.42)',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
    padding: 12,
  },
  errorText: { color: '#fecdd3', fontSize: 14, lineHeight: 20 },
  fieldGroup: { marginBottom: 18 },
  label: {
    color: colors.sandstone,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(232, 238, 248, 0.98)',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  passwordRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(232, 238, 248, 0.98)',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingRight: 14,
  },
  passwordInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  showText: { color: colors.saffron, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  signInButton: {
    borderColor: colors.gold,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  buttonGradient: { alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  buttonText: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '900' },
  accountLinks: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingBottom: 2,
    paddingTop: 14,
  },
  accountLinkText: {
    color: colors.goldLight,
    fontSize: 15,
    fontWeight: '700',
  },
  accountLinkButton: {
    borderBottomColor: colors.goldLight,
    borderBottomWidth: 2,
    paddingBottom: 2,
  },
  linkPressed: { opacity: 0.62 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
