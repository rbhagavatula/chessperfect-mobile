import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CeremonialVideoBackdrop } from '@/components/ceremonial-video-backdrop';
import { RoyalButton } from '@/components/royal-button';
import { colors } from '@/constants/colors';
import { config } from '@/lib/config';
import { restoreSession } from '@/lib/session';

export default function WelcomeScreen() {
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let active = true;

    void restoreSession().then((session) => {
      if (!active) return;
      if (session) {
        router.replace({ pathname: '/home', params: { username: session.username } });
      } else {
        setSessionResolved(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function openAccountPage(path: '/forgot-password' | '/signup') {
    void WebBrowser.openBrowserAsync(`${config.apiBaseUrl}${path}`);
  }

  return (
    <LinearGradient
      colors={[colors.ink, colors.indigo, colors.terracottaDeep, colors.ink]}
      locations={[0, 0.42, 0.78, 1]}
      style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        {sessionResolved && <CeremonialVideoBackdrop />}

        <View style={styles.hero}>
          <Image
            accessibilityLabel="ChessPerfect"
            contentFit="contain"
            source={require('@/assets/images/chessperfect-brand-mark.png')}
            style={styles.logo}
          />
          <Text style={styles.brandTitle}>Chess Perfect</Text>
          <Text style={styles.brandCaption}>A complete ECO system</Text>
          <View style={styles.floralDivider}>
            <View style={styles.floralLine} />
            <View style={styles.separatorDot} />
            <View style={styles.floralDiamond} />
            <View style={styles.separatorDot} />
            <View style={styles.floralLine} />
          </View>
        </View>

        <View style={styles.actions}>
          <RoyalButton
            label="Sign in"
            onPress={() => router.push('/sign-in')}
          />
          <View style={styles.accountLinks}>
            <Pressable
              accessibilityRole="link"
              hitSlop={10}
              onPress={() => openAccountPage('/forgot-password')}
              style={({ pressed }) => [styles.accountLinkButton, pressed && styles.linkPressed]}>
              <Text style={styles.accountLinkText}>Forgot Password</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              hitSlop={10}
              onPress={() => openAccountPage('/signup')}
              style={({ pressed }) => [styles.accountLinkButton, pressed && styles.linkPressed]}>
              <Text style={styles.accountLinkText}>Register</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { height: 240, width: 240 },
  brandTitle: {
    color: colors.goldLight,
    fontFamily: 'serif',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 8,
    textAlign: 'center',
  },
  brandCaption: {
    color: colors.sandstone,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginTop: 7,
    textAlign: 'center',
  },
  floralDivider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 13,
  },
  floralLine: {
    backgroundColor: colors.gold,
    height: 1,
    opacity: 0.82,
    width: 54,
  },
  separatorDot: {
    backgroundColor: colors.gold,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  floralDiamond: {
    backgroundColor: colors.goldLight,
    height: 8,
    transform: [{ rotate: '45deg' }],
    width: 8,
  },
  actions: { paddingBottom: 8 },
  accountLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 16,
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
});
