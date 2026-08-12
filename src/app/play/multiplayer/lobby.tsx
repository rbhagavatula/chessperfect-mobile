import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalButton } from '@/components/royal-button';
import { colors } from '@/constants/colors';
import { botTimeControls, normalizeBotSpeed } from '@/lib/bot-game';
import {
  cancelMultiplayerSeek,
  createMultiplayerSeek,
  fetchActiveSeek,
  fetchCurrentMultiplayerGame,
} from '@/lib/multiplayer-game';
import { restoreSession } from '@/lib/session';

type PreferredColor = 'black' | 'random' | 'white';

const colorOptions: { label: string; value: PreferredColor }[] = [
  { label: 'White', value: 'white' },
  { label: 'Random', value: 'random' },
  { label: 'Black', value: 'black' },
];

export default function MultiplayerLobbyScreen() {
  const params = useLocalSearchParams<{ speed?: string }>();
  const speed = normalizeBotSpeed(params.speed);
  const timeControls = useMemo(() => botTimeControls[speed], [speed]);
  const [timeControl, setTimeControl] = useState(timeControls[0]);
  const [rated, setRated] = useState(true);
  const [preferredColor, setPreferredColor] = useState<PreferredColor>('random');
  const [searching, setSearching] = useState(false);
  const [searchStartedAt, setSearchStartedAt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | undefined>(undefined);
  const actionRequestRef = useRef(false);
  const pollRequestRef = useRef(false);

  const openGame = useCallback((gameId: string) => {
    setSearching(false);
    router.replace({ pathname: '/play/multiplayer/game', params: { gameId } } as Href);
  }, []);

  const checkMatch = useCallback(async () => {
    if (pollRequestRef.current || !accessTokenRef.current) return;
    pollRequestRef.current = true;
    try {
      const active = await fetchActiveSeek(accessTokenRef.current);
      if (active.matched && active.gameId) {
        openGame(String(active.gameId));
        return;
      }
      if (!active.active && searching) {
        setSearching(false);
        setError('The search expired. Begin a new search when you are ready.');
      }
    } catch {
      // A temporary polling failure should not cancel an active matchmaking request.
    } finally {
      pollRequestRef.current = false;
    }
  }, [openGame, searching]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const session = await restoreSession();
        if (!mounted) return;
        if (!session) {
          router.replace('/sign-in');
          return;
        }
        accessTokenRef.current = session.accessToken;
        const ongoing = await fetchCurrentMultiplayerGame(session.accessToken);
        if (!mounted) return;
        if (ongoing?.id) {
          openGame(ongoing.id);
          return;
        }
        const active = await fetchActiveSeek(session.accessToken);
        if (!mounted) return;
        if (active.matched && active.gameId) {
          // MATCHED seeks remain in lobby history after a game ends. Confirm that
          // the referenced game is still live before restoring it.
          const matchedGame = await fetchCurrentMultiplayerGame(session.accessToken);
          if (!mounted) return;
          if (matchedGame?.id) openGame(matchedGame.id);
          return;
        }
        if (active.active) {
          if (active.timeControl && timeControls.includes(active.timeControl)) {
            setTimeControl(active.timeControl);
          }
          setSearching(true);
          setSearchStartedAt(Date.now());
        }
      } catch (caught) {
        if (__DEV__) console.error('[Multiplayer lobby restore failed]', caught);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [openGame, timeControls]);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      setElapsedSeconds(Math.floor((Date.now() - searchStartedAt) / 1000));
      void checkMatch();
    }, 1250);
    return () => clearInterval(timer);
  }, [checkMatch, searchStartedAt, searching]);

  async function beginSearch() {
    if (actionRequestRef.current || !accessTokenRef.current) return;
    setError(null);
    actionRequestRef.current = true;
    try {
      await createMultiplayerSeek(
        timeControl,
        rated,
        preferredColor === 'random' ? null : preferredColor,
        accessTokenRef.current,
      );
      const now = Date.now();
      setSearchStartedAt(now);
      setElapsedSeconds(0);
      setSearching(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Matchmaking could not start.';
      if (message === 'OPEN_SEEK_EXISTS') {
        setSearchStartedAt(Date.now());
        setSearching(true);
      } else {
        setError(message);
      }
    } finally {
      actionRequestRef.current = false;
    }
  }

  async function cancelSearch() {
    if (actionRequestRef.current || !accessTokenRef.current) return;
    actionRequestRef.current = true;
    try {
      await cancelMultiplayerSeek(accessTokenRef.current);
      setSearching(false);
      setElapsedSeconds(0);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The search could not be cancelled.');
    } finally {
      actionRequestRef.current = false;
    }
  }

  if (loading) {
    return (
      <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
        <CivBackdrop />
        <SafeAreaView edges={['top', 'bottom']} style={styles.loading}>
          <ActivityIndicator color={colors.goldLight} size="large" />
          <Text style={styles.loadingText}>Opening the royal arena…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Multiplayer" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Image
              contentFit="cover"
              source={require('@/assets/play/multiplayer-medallion-mobile-v1.jpg')}
              style={styles.medallion}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>ROYAL ARENA</Text>
              <Text style={styles.heading}>Challenge a Player</Text>
              <Text style={styles.subtitle}>Meet a worthy commander in a live rated or casual battle.</Text>
            </View>
          </View>

          {searching ? (
            <LinearGradient colors={['rgba(91, 24, 29, 0.98)', 'rgba(15, 11, 9, 0.99)']} style={styles.searchPanel}>
              <RoyalCorners />
              <View style={styles.radarRing}>
                <ActivityIndicator color={colors.goldLight} size="large" />
              </View>
              <Text style={styles.searchTitle}>Seeking a worthy opponent</Text>
              <Text style={styles.searchMeta}>{timeControl} · {rated ? 'Rated' : 'Casual'} · {elapsedSeconds}s</Text>
              <Text style={styles.searchHint}>You will enter the battle automatically when a match is found.</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => void cancelSearch()}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
                <Text style={styles.cancelLabel}>Cancel Search</Text>
              </Pressable>
            </LinearGradient>
          ) : (
            <>
              <LinearGradient colors={['rgba(58, 39, 24, 0.98)', 'rgba(14, 10, 8, 0.99)']} style={styles.panel}>
                <RoyalCorners />
                <SectionTitle label={`${speed} time control`} symbol="timer" />
                <View style={styles.choiceRow}>
                  {timeControls.map((option) => (
                    <ChoiceButton
                      key={option}
                      label={option}
                      onPress={() => setTimeControl(option)}
                      selected={timeControl === option}
                    />
                  ))}
                </View>

                <OrnamentDivider />
                <SectionTitle label="Battle stakes" symbol="military_tech" />
                <View style={styles.choiceRow}>
                  <ChoiceButton label="Rated" onPress={() => setRated(true)} selected={rated} />
                  <ChoiceButton label="Casual" onPress={() => setRated(false)} selected={!rated} />
                </View>

                <OrnamentDivider />
                <SectionTitle label="Preferred army" symbol="chess" />
                <View style={styles.choiceRow}>
                  {colorOptions.map((option) => (
                    <ChoiceButton
                      key={option.value}
                      label={option.label}
                      onPress={() => setPreferredColor(option.value)}
                      selected={preferredColor === option.value}
                    />
                  ))}
                </View>
              </LinearGradient>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <RoyalButton label="Find an Opponent" onPress={() => void beginSearch()} style={styles.findButton} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const sectionSymbols = {
  chess: { android: 'chess', ios: 'crown.fill', web: 'chess' },
  military_tech: { android: 'military_tech', ios: 'medal.fill', web: 'military_tech' },
  timer: { android: 'timer', ios: 'timer', web: 'timer' },
} as const;

function SectionTitle({ label, symbol }: { label: string; symbol: keyof typeof sectionSymbols }) {
  return (
    <View style={styles.sectionTitle}>
      <SymbolView name={sectionSymbols[symbol]} size={19} tintColor={colors.goldLight} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function ChoiceButton({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sandstone, fontFamily: 'serif', fontSize: 16, marginTop: 14 },
  content: { paddingBottom: 28, paddingHorizontal: 16 },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 18, paddingTop: 22 },
  medallion: { borderColor: colors.gold, borderRadius: 42, borderWidth: 2, height: 84, width: 84 },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: colors.cream, fontFamily: 'serif', fontSize: 24, fontWeight: '900', marginTop: 3 },
  subtitle: { color: colors.sandstone, fontSize: 12, lineHeight: 17, marginTop: 4 },
  panel: { borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 18, position: 'relative' },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  sectionLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center', marginTop: 13 },
  choice: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.82)', borderColor: '#765026', borderRadius: 10, borderWidth: 1, flexGrow: 1, justifyContent: 'center', minHeight: 44, minWidth: 82, paddingHorizontal: 13 },
  choiceSelected: { backgroundColor: '#74151a', borderColor: colors.goldLight, borderWidth: 1.5 },
  choiceLabel: { color: colors.sandstone, fontFamily: 'serif', fontSize: 15, fontWeight: '800' },
  choiceLabelSelected: { color: colors.cream },
  findButton: { marginTop: 18 },
  searchPanel: { alignItems: 'center', borderColor: colors.gold, borderRadius: 18, borderWidth: 1, marginTop: 10, minHeight: 340, paddingHorizontal: 22, paddingVertical: 40, position: 'relative' },
  radarRing: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.88)', borderColor: colors.goldLight, borderRadius: 46, borderWidth: 1, height: 92, justifyContent: 'center', width: 92 },
  searchTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900', marginTop: 22, textAlign: 'center' },
  searchMeta: { color: colors.goldLight, fontSize: 13, fontWeight: '800', marginTop: 8 },
  searchHint: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' },
  cancelButton: { borderBottomColor: colors.goldLight, borderBottomWidth: 2, marginTop: 28, paddingBottom: 3 },
  cancelLabel: { color: colors.goldLight, fontSize: 15, fontWeight: '900' },
  error: { color: '#fecdd3', fontSize: 12, marginTop: 14, textAlign: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
