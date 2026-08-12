import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalButton } from '@/components/royal-button';
import { colors } from '@/constants/colors';
import {
  clearActiveBotGame,
  loadActiveBotGame,
  type ActiveBotGame,
} from '@/lib/active-bot-game';
import {
  botLevels,
  botTimeControls,
  normalizeBotSpeed,
  type BotColor,
} from '@/lib/bot-game';
import { restoreSession } from '@/lib/session';

const colorsToChoose: { label: string; symbol: string; value: BotColor }[] = [
  { label: 'White', symbol: '♔', value: 'white' },
  { label: 'Random', symbol: '♚', value: 'random' },
  { label: 'Black', symbol: '♚', value: 'black' },
];

const sectionSymbols = {
  chess: { android: 'chess', ios: 'crown.fill', web: 'chess' },
  smart_toy: { android: 'smart_toy', ios: 'cpu', web: 'smart_toy' },
  timer: { android: 'timer', ios: 'timer', web: 'timer' },
} as const;

export default function BotSetupScreen() {
  const params = useLocalSearchParams<{ speed?: string }>();
  const speed = normalizeBotSpeed(params.speed);
  const timeControls = useMemo(() => botTimeControls[speed], [speed]);
  const [timeControl, setTimeControl] = useState(timeControls[0]);
  const [level, setLevel] = useState(5);
  const [color, setColor] = useState<BotColor>('white');
  const [activeBotGame, setActiveBotGame] = useState<ActiveBotGame | null>(null);
  const levelConfig = botLevels[level - 1];

  useEffect(() => {
    let active = true;
    void restoreSession().then(async (session) => {
      const savedGame = session ? await loadActiveBotGame(session.username) : null;
      if (active) setActiveBotGame(savedGame);
    });
    return () => {
      active = false;
    };
  }, []);

  function beginNewGame() {
    const resolvedColor = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color;
    void clearActiveBotGame().finally(() => router.push({
      pathname: '/play/bot/game',
      params: { color: resolvedColor, level: String(level), timeControl },
    }));
  }

  function startGame() {
    if (!activeBotGame) {
      beginNewGame();
      return;
    }
    Alert.alert(
      'Begin a new battle?',
      'Your unfinished Stockfish game will be abandoned.',
      [
        { style: 'cancel', text: 'Keep Existing Game' },
        { onPress: beginNewGame, style: 'destructive', text: 'Begin New Battle' },
      ],
    );
  }

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
        <PlayScreenHeader title="Bot Challenge" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Image
              contentFit="cover"
              source={require('@/assets/play/bot-medallion-mobile-v1.jpg')}
              style={styles.botMedallion}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>ROYAL TRAINING MATCH</Text>
              <Text style={styles.heading}>Challenge Stockfish</Text>
              <Text style={styles.subtitle}>Choose your clock, opponent strength, and army.</Text>
            </View>
          </View>

          <LinearGradient colors={['rgba(58, 39, 24, 0.98)', 'rgba(14, 10, 8, 0.99)']} style={styles.panel}>
            <RoyalCorners />
            <SectionTitle label={`${speed} time control`} symbol="timer" />
            <View style={styles.timeControlRow}>
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
            <SectionTitle label="Stockfish strength" symbol="smart_toy" />
            <View style={styles.levelSummary}>
              <Text style={styles.levelName}>{levelConfig.label}</Text>
              <Text style={styles.levelMeta}>Level {levelConfig.level} · approximately {levelConfig.elo} Elo</Text>
            </View>
            <View style={styles.levelGrid}>
              {botLevels.map((option) => (
                <ChoiceButton
                  compact
                  key={option.level}
                  label={String(option.level)}
                  onPress={() => setLevel(option.level)}
                  selected={level === option.level}
                />
              ))}
            </View>

            <OrnamentDivider />
            <SectionTitle label="Command this army" symbol="chess" />
            <View style={styles.colorRow}>
              {colorsToChoose.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: color === option.value }}
                  key={option.value}
                  onPress={() => setColor(option.value)}
                  style={({ pressed }) => [
                    styles.colorChoice,
                    color === option.value && styles.choiceSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.king, option.value === 'white' && styles.whiteKing]}>{option.symbol}</Text>
                  <Text style={styles.colorLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </LinearGradient>

          {activeBotGame ? (
            <Pressable
              accessibilityRole="button"
              onPress={resumeBattle}
              style={({ pressed }) => [styles.resumeButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ android: 'history', ios: 'clock.arrow.circlepath', web: 'history' }}
                size={19}
                tintColor={colors.goldLight}
              />
              <View style={styles.resumeCopy}>
                <Text style={styles.resumeTitle}>Resume Existing Battle</Text>
                <Text style={styles.resumeMeta}>{activeBotGame.timeControl} · Level {activeBotGame.level}</Text>
              </View>
              <Text style={styles.resumeAction}>RESUME</Text>
            </Pressable>
          ) : null}

          <RoyalButton label="Begin the Battle" onPress={startGame} style={styles.startButton} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SectionTitle({ label, symbol }: { label: string; symbol: keyof typeof sectionSymbols }) {
  return (
    <View style={styles.sectionTitle}>
      <SymbolView
        name={sectionSymbols[symbol]}
        size={19}
        tintColor={colors.goldLight}
      />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  );
}

function ChoiceButton({
  compact = false,
  label,
  onPress,
  selected,
}: {
  compact?: boolean;
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
        compact && styles.choiceCompact,
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
  content: { paddingBottom: 28, paddingHorizontal: 16 },
  hero: { alignItems: 'center', flexDirection: 'row', gap: 14, paddingBottom: 18, paddingTop: 22 },
  botMedallion: { borderColor: colors.gold, borderRadius: 42, borderWidth: 2, height: 84, width: 84 },
  heroCopy: { flex: 1 },
  eyebrow: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: colors.cream, fontFamily: 'serif', fontSize: 24, fontWeight: '900', marginTop: 3 },
  subtitle: { color: colors.sandstone, fontSize: 12, lineHeight: 17, marginTop: 4 },
  panel: {
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 18,
    position: 'relative',
  },
  sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  sectionLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  timeControlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center', marginTop: 13 },
  choice: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 21, 0.82)',
    borderColor: '#765026',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 13,
  },
  choiceCompact: { minWidth: 46, paddingHorizontal: 8, width: '17.6%' },
  choiceSelected: { backgroundColor: '#74151a', borderColor: colors.goldLight, borderWidth: 1.5 },
  choiceLabel: { color: colors.sandstone, fontFamily: 'serif', fontSize: 15, fontWeight: '800' },
  choiceLabelSelected: { color: colors.cream },
  levelSummary: { alignItems: 'center', marginTop: 11 },
  levelName: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900' },
  levelMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 12 },
  colorRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  colorChoice: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 21, 0.82)',
    borderColor: '#765026',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 82,
    paddingVertical: 8,
  },
  king: { color: '#1d1811', fontSize: 37, textShadowColor: colors.goldLight, textShadowRadius: 2 },
  whiteKing: { color: '#f6e9c8' },
  colorLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 13, fontWeight: '800', marginTop: 2 },
  resumeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(82, 22, 26, 0.94)',
    borderColor: colors.goldLight,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 58,
    paddingHorizontal: 13,
  },
  resumeCopy: { flex: 1, marginLeft: 9 },
  resumeTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  resumeMeta: { color: colors.sandstone, fontSize: 10, marginTop: 2 },
  resumeAction: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  startButton: { marginTop: 18 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
