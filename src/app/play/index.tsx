import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { PlayModeCard } from '@/components/play-mode-card';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import { loadActiveBotGame, type ActiveBotGame } from '@/lib/active-bot-game';
import { botLevels } from '@/lib/bot-game';
import { restoreSession } from '@/lib/session';

const modes = [
  {
    id: 'multiplayer',
    source: require('@/assets/play/multiplayer-medallion-mobile-v1.jpg'),
    subtitle: 'Challenge players around the world',
    title: 'Multiplayer',
  },
  {
    id: 'bot',
    source: require('@/assets/play/bot-medallion-mobile-v1.jpg'),
    subtitle: 'Train against a worthy opponent',
    title: 'Play against a Bot',
  },
  {
    id: 'tournament',
    source: require('@/assets/play/tournament-medallion-mobile-v1.jpg'),
    subtitle: 'Compete for glory and rewards',
    title: 'Tournament',
  },
] as const;

export default function PlayScreen() {
  const [activeBotGame, setActiveBotGame] = useState<ActiveBotGame | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void restoreSession().then(async (session) => {
      const savedGame = session ? await loadActiveBotGame(session.username) : null;
      if (active) setActiveBotGame(savedGame);
    });
    return () => {
      active = false;
    };
  }, []));

  function resumeBattle() {
    if (!activeBotGame) return;
    router.push({
      pathname: '/play/bot/game',
      params: {
        color: activeBotGame.userSide === 'w' ? 'white' : 'black',
        level: String(activeBotGame.level),
        resume: '1',
        timeControl: activeBotGame.timeControl,
      },
    });
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Play" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.heading}>Choose Your Battle</Text>
            <Text style={styles.caption}>Select a game mode and prepare your strategy.</Text>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <View style={styles.dividerGem} />
              <View style={styles.dividerLine} />
            </View>
          </View>

          {activeBotGame ? (
            <Pressable
              accessibilityLabel="Resume unfinished game against Stockfish"
              accessibilityRole="button"
              onPress={resumeBattle}
              style={({ pressed }) => [styles.resumeFrame, pressed && styles.pressed]}>
              <LinearGradient colors={['#7b1d24', '#361014']} style={styles.resumeBattle}>
                <View style={styles.resumeIcon}>
                  <SymbolView
                    name={{ android: 'history', ios: 'clock.arrow.circlepath', web: 'history' }}
                    size={24}
                    tintColor={colors.goldLight}
                  />
                </View>
                <View style={styles.resumeCopy}>
                  <Text style={styles.resumeEyebrow}>UNFINISHED BATTLE</Text>
                  <Text style={styles.resumeTitle}>Resume against Stockfish</Text>
                  <Text style={styles.resumeMeta}>
                    {activeBotGame.timeControl} · {botLevels[activeBotGame.level - 1]?.label ?? `Level ${activeBotGame.level}`} · Move {Math.floor(activeBotGame.movesUci.length / 2) + 1}
                  </Text>
                </View>
                <Text style={styles.resumeAction}>RESUME</Text>
              </LinearGradient>
            </Pressable>
          ) : null}

          <View style={styles.cards}>
            {modes.map((mode) => (
              <PlayModeCard
                key={mode.id}
                onPress={() => router.push({ pathname: '/play/[mode]', params: { mode: mode.id } })}
                source={mode.source}
                subtitle={mode.subtitle}
                title={mode.title}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingBottom: 19,
    paddingHorizontal: 13,
  },
  intro: {
    alignItems: 'center',
    minHeight: 117,
    paddingTop: 18,
  },
  heading: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: '#1b0b04',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  caption: {
    color: colors.sandstone,
    fontSize: 12,
    marginTop: 7,
    textAlign: 'center',
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
  },
  dividerLine: { backgroundColor: colors.goldDark, height: 1, width: 64 },
  dividerGem: {
    backgroundColor: '#8a2027',
    borderColor: colors.goldLight,
    borderWidth: 1,
    height: 9,
    transform: [{ rotate: '45deg' }],
    width: 9,
  },
  resumeFrame: {
    backgroundColor: colors.goldDark,
    borderColor: colors.goldLight,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 15,
    overflow: 'hidden',
    padding: 2,
  },
  resumeBattle: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    minHeight: 74,
    paddingHorizontal: 12,
  },
  resumeIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 13, 18, 0.75)',
    borderColor: colors.gold,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  resumeCopy: { flex: 1, marginLeft: 11 },
  resumeEyebrow: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  resumeTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 16, fontWeight: '900', marginTop: 2 },
  resumeMeta: { color: colors.sandstone, fontSize: 10, marginTop: 2 },
  resumeAction: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginLeft: 8 },
  cards: { gap: 15 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
