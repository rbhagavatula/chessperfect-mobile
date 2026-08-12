import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { RoyalDashboardCard } from '@/components/royal-dashboard-card';
import { colors } from '@/constants/colors';
import { getJson } from '@/lib/api';
import { clearSelectedAcademy } from '@/lib/academy';
import { config } from '@/lib/config';
import { getSession, logoutSession } from '@/lib/session';

type DashboardCard = {
  label: string;
  source: ImageSource;
};

type BottomDestination = {
  icon: SymbolViewProps['name'];
  label: string;
};

type MeView = {
  avatarKey?: string | null;
  displayName?: string | null;
  tenantMemberships?: {
    role?: string | null;
  }[] | null;
};

const academyDashboardRoles = new Set([
  'STUDENT',
  'OWNER',
  // Academy employees currently receive one of these tenant roles from the backend.
  'EMPLOYEE',
  'ADMIN',
  'STAFF',
  'COACH',
]);

function hasActiveAcademyAssociation(me: MeView) {
  return (me.tenantMemberships ?? []).some((membership) => {
    const role = membership.role?.trim().toUpperCase();
    return role ? academyDashboardRoles.has(role) : false;
  });
}

function resolveAvatarUri(avatarKey?: string | null) {
  const key = avatarKey?.trim();
  if (!key) return null;
  if (/^(https?:|data:)/i.test(key)) return key;
  if (key.startsWith('/')) return `${config.apiBaseUrl}${key}`;
  return null;
}

const dashboardCards: DashboardCard[] = [
  { label: 'PLAY', source: require('@/assets/dashboard/play-card-mobile-v1.jpg') },
  { label: 'LEARN', source: require('@/assets/dashboard/learn-card-mobile-v1.jpg') },
  { label: 'SHOP', source: require('@/assets/dashboard/shop-card-mobile-v1.jpg') },
  { label: 'MY ACADEMY', source: require('@/assets/dashboard/academy-card-mobile-v1.jpg') },
];

const bottomDestinations: BottomDestination[] = [
  { icon: { android: 'home', ios: 'house.fill', web: 'home' }, label: 'HOME' },
  { icon: { android: 'emoji_events', ios: 'trophy.fill', web: 'emoji_events' }, label: 'LEADERBOARD' },
  { icon: { android: 'groups', ios: 'person.2.fill', web: 'groups' }, label: 'FRIENDS' },
  { icon: { android: 'mail', ios: 'envelope.fill', web: 'mail' }, label: 'INBOX' },
];

export default function HomeScreen() {
  const params = useLocalSearchParams<{ username?: string }>();
  const displayName = typeof params.username === 'string' && params.username.trim()
    ? params.username.trim()
    : 'Player';
  const [activeDestination, setActiveDestination] = useState('HOME');
  const [commanderName, setCommanderName] = useState(displayName);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showMyAcademy, setShowMyAcademy] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPlayerIdentity() {
      try {
        const session = await getSession();
        if (!session) return;
        const me = await getJson<MeView>('/api/v1/global/me', session.accessToken);
        if (!active) return;
        if (me.displayName?.trim()) setCommanderName(me.displayName.trim());
        setAvatarUri(resolveAvatarUri(me.avatarKey));
        setShowMyAcademy(hasActiveAcademyAssociation(me));
      } catch {
        // Keep the username and initials fallback when profile enrichment is unavailable.
      }
    }

    loadPlayerIdentity();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await Promise.all([logoutSession(), clearSelectedAcademy()]);
    router.replace('/sign-in');
  }

  function openSettings() {
    Alert.alert('Settings', 'Choose an action', [
      { onPress: () => router.push('/account' as Href), text: 'My Account' },
      { style: 'cancel', text: 'Cancel' },
      { onPress: signOut, style: 'destructive', text: 'Sign out' },
    ]);
  }

  function openCard(label: string) {
    if (label === 'PLAY') {
      router.push('../play');
      return;
    }
    if (label === 'LEARN') {
      router.push('../learn');
      return;
    }
    if (label === 'MY ACADEMY') {
      router.push('/academy' as Href);
      return;
    }
    Alert.alert(label, `${label} is the next ChessPerfect mobile experience we will build.`);
  }

  function selectBottomDestination(label: string) {
    setActiveDestination(label);
    if (label !== 'HOME') {
      Alert.alert(label, `${label} is coming in the next ChessPerfect mobile milestone.`);
    }
  }

  return (
    <LinearGradient
      colors={['#160e0a', '#25170f', '#0b0706']}
      locations={[0, 0.48, 1]}
      style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerToolbar}>
            <View style={styles.toolbarSpacer} />
            <Text style={styles.headerTitle}>ChessPerfect</Text>
            <Pressable
              accessibilityLabel="Settings"
              accessibilityRole="button"
              onPress={openSettings}
              style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ android: 'settings', ios: 'gearshape.fill', web: 'settings' }}
                size={27}
                tintColor={colors.sandstone}
              />
            </Pressable>
          </View>

          <View style={styles.profileRow}>
            <Pressable
              accessibilityLabel={`${commanderName} profile`}
              accessibilityRole="button"
              onPress={() => router.push('/account' as Href)}
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              {avatarUri ? (
                <Image contentFit="cover" source={{ uri: avatarUri }} style={styles.avatarImage} transition={180} />
              ) : (
                <LinearGradient colors={['#8c6438', '#352116']} style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{commanderName.charAt(0).toUpperCase()}</Text>
                </LinearGradient>
              )}
            </Pressable>
            <View style={styles.profileCopy}>
              <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.commanderName}>
                COMMANDER {commanderName.toUpperCase()}
              </Text>
              <Text style={styles.rating}>LEVEL 12 · 820 XP</Text>
            </View>
            <View style={styles.currencyGroup}>
              <View style={styles.currencyPill}>
                <Text style={styles.currencyText}>1,250</Text>
                <View style={styles.coin}>
                  <Text style={styles.coinMark}>♟</Text>
                </View>
              </View>
              <View style={styles.currencyPill}>
                <Text style={styles.currencyText}>24</Text>
                <Text style={styles.gem}>◆</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityLabel="Solve the Daily Puzzle"
            accessibilityRole="button"
            onPress={() => openCard('Daily Puzzle')}
            style={({ pressed }) => [styles.puzzleBanner, pressed && styles.pressed]}>
            <Image
              contentFit="cover"
              source={require('@/assets/dashboard/daily-puzzle-banner-mobile-v1.jpg')}
              style={StyleSheet.absoluteFill}
              transition={180}
            />
            <LinearGradient
              colors={['rgba(8, 5, 4, 0.97)', 'rgba(8, 5, 4, 0.72)', 'rgba(8, 5, 4, 0.02)']}
              locations={[0, 0.54, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.puzzleCopy}>
              <Text style={styles.puzzleTitle}>Daily Puzzle</Text>
              <Text numberOfLines={1} style={styles.puzzleSubtitle}>Fortress Defense · Checkmate in 2</Text>
              <LinearGradient colors={['#ffe095', '#d7a33b', '#f5cb6d']} style={styles.solveButton}>
                <Text style={styles.solveButtonText}>SOLVE NOW</Text>
              </LinearGradient>
            </View>
          </Pressable>

          <View style={styles.cardsGrid}>
            {dashboardCards
              .filter((card) => card.label !== 'MY ACADEMY' || showMyAcademy)
              .map((card) => (
                <RoyalDashboardCard
                  key={card.label}
                  label={card.label}
                  onPress={() => openCard(card.label)}
                  source={card.source}
                />
              ))}
          </View>
        </ScrollView>

        <View style={styles.bottomNavigation}>
          {bottomDestinations.map((destination) => {
            const active = activeDestination === destination.label;
            return (
              <Pressable
                accessibilityLabel={destination.label}
                accessibilityRole="button"
                key={destination.label}
                onPress={() => selectBottomDestination(destination.label)}
                style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}>
                <SymbolView
                  name={destination.icon}
                  size={24}
                  tintColor={active ? colors.goldLight : colors.muted}
                />
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  numberOfLines={1}
                  style={[styles.bottomLabel, active && styles.bottomLabelActive]}>
                  {destination.label}
                </Text>
                {active && <View style={styles.activeIndicator} />}
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    backgroundColor: 'rgba(19, 13, 10, 0.95)',
    borderBottomColor: 'rgba(224, 182, 99, 0.62)',
    borderBottomWidth: 1,
    paddingBottom: 9,
    paddingHorizontal: 13,
    paddingTop: 4,
  },
  headerToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 32,
  },
  toolbarSpacer: { width: 34 },
  headerTitle: {
    color: '#e7c88b',
    flex: 1,
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  settingsButton: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    marginLeft: 4,
    width: 34,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(55, 39, 27, 0.96)',
    borderColor: '#d4ae68',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  avatarImage: { height: '100%', width: '100%' },
  avatarFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  avatarInitial: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 30,
    fontWeight: '900',
    textShadowColor: '#1d0c05',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  profileCopy: {
    flex: 1,
    marginLeft: 9,
    minWidth: 0,
  },
  commanderName: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  rating: {
    color: colors.sandstone,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  currencyGroup: {
    gap: 5,
    marginLeft: 6,
  },
  currencyPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(47, 36, 27, 0.96)',
    borderColor: 'rgba(211, 172, 97, 0.38)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    height: 26,
    justifyContent: 'flex-end',
    minWidth: 62,
    paddingHorizontal: 7,
  },
  currencyText: {
    color: '#ead5a7',
    fontSize: 11,
    fontWeight: '800',
  },
  coin: {
    alignItems: 'center',
    backgroundColor: '#e8b941',
    borderColor: '#ffe39b',
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    marginLeft: 5,
    width: 16,
  },
  coinMark: { color: '#6b3c0d', fontSize: 9, fontWeight: '900' },
  gem: { color: '#d83b57', fontSize: 16, marginLeft: 5, textShadowColor: '#ff9cac', textShadowRadius: 4 },
  content: {
    paddingBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 13,
  },
  puzzleBanner: {
    borderColor: '#d8ae61',
    borderRadius: 14,
    borderWidth: 1.5,
    height: 145,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 7,
  },
  puzzleCopy: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 17,
    width: '66%',
  },
  puzzleTitle: {
    color: '#f3d79c',
    fontFamily: 'serif',
    fontSize: 23,
    fontWeight: '900',
  },
  puzzleSubtitle: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 12,
    marginTop: 2,
  },
  solveButton: {
    alignItems: 'center',
    borderColor: '#ffe7a3',
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 34,
    width: 112,
  },
  solveButtonText: {
    color: '#2e1b0e',
    fontFamily: 'serif',
    fontSize: 12,
    fontWeight: '900',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 15,
  },
  bottomNavigation: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(23, 15, 11, 0.98)',
    borderTopColor: 'rgba(222, 180, 97, 0.58)',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 3,
  },
  bottomItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    position: 'relative',
  },
  bottomLabel: {
    color: colors.muted,
    fontFamily: 'serif',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 4,
  },
  bottomLabelActive: { color: colors.goldLight },
  activeIndicator: {
    backgroundColor: colors.goldLight,
    borderRadius: 2,
    bottom: 2,
    height: 3,
    position: 'absolute',
    width: 28,
  },
  pressed: { opacity: 0.76 },
});
