import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalButton } from '@/components/royal-button';
import { colors } from '@/constants/colors';

type PlayMode = 'bot' | 'multiplayer' | 'tournament';

type GameOption = {
  label: string;
  source: ImageSource;
};

const timeControlOptions: readonly GameOption[] = [
  { label: 'Classical', source: require('@/assets/play/options/classical-emblem-mobile-v1.jpg') },
  { label: 'Rapid', source: require('@/assets/play/options/rapid-emblem-mobile-v1.jpg') },
  { label: 'Blitz', source: require('@/assets/play/options/blitz-emblem-mobile-v1.jpg') },
  { label: 'Bullet', source: require('@/assets/play/options/bullet-emblem-mobile-v1.jpg') },
];

const tournamentOptions: readonly GameOption[] = [
  { label: 'Race to Win', source: require('@/assets/play/options/race-to-win-emblem-mobile-v1.jpg') },
  { label: 'Swiss', source: require('@/assets/play/options/swiss-emblem-mobile-v1.jpg') },
  { label: 'Round Robin', source: require('@/assets/play/options/round-robin-emblem-mobile-v1.jpg') },
  { label: 'Knockout', source: require('@/assets/play/options/knockout-emblem-mobile-v1.jpg') },
];

const modeConfig = {
  multiplayer: {
    action: 'Find Opponent',
    heading: 'Choose Time Control',
    options: timeControlOptions,
    subtitle: 'How much time will you command?',
    title: 'Multiplayer',
  },
  bot: {
    action: 'Start Game',
    heading: 'Choose Time Control',
    options: timeControlOptions,
    subtitle: 'Set the pace for your training match.',
    title: 'Play against a Bot',
  },
  tournament: {
    action: 'View Tournaments',
    heading: 'Choose Tournament Format',
    options: tournamentOptions,
    subtitle: 'Select the path to tournament glory.',
    title: 'Tournament',
  },
} as const;

function normalizeMode(value?: string): PlayMode {
  return value === 'bot' || value === 'tournament' ? value : 'multiplayer';
}

export default function PlayModeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = normalizeMode(params.mode);
  const config = modeConfig[mode];
  const [selection, setSelection] = useState<string | null>(null);

  function continueWithSelection() {
    if (!selection) {
      Alert.alert(config.heading, 'Select an option to continue.');
      return;
    }
    if (mode === 'bot') {
      router.push({ pathname: '/play/bot/setup', params: { speed: selection } });
      return;
    }
    if (mode === 'multiplayer') {
      router.push({ pathname: '/play/multiplayer/lobby', params: { speed: selection } } as Href);
      return;
    }
    Alert.alert(config.action, `${selection} is selected. Matchmaking and game setup are the next milestone.`);
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title={config.title} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.heading}>{config.heading}</Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </View>

          <View style={styles.optionGrid}>
            {config.options.map((option) => {
              const selected = selection === option.label;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.label}
                  onPress={() => setSelection(option.label)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <LinearGradient
                    colors={selected ? ['#7f1d27', '#4a1017'] : ['rgba(55, 37, 23, 0.98)', 'rgba(19, 13, 10, 0.99)']}
                    style={styles.optionFace}>
                    <View style={[styles.optionEmblemFrame, selected && styles.optionEmblemFrameSelected]}>
                      <Image contentFit="cover" source={option.source} style={styles.optionEmblem} transition={160} />
                    </View>
                    <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.optionLabel}>
                      {option.label}
                    </Text>
                    {selected && (
                      <View style={styles.checkBadge}>
                        <SymbolView
                          name={{ android: 'check', ios: 'checkmark', web: 'check' }}
                          size={15}
                          tintColor="#3b2209"
                        />
                      </View>
                    )}
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionArea}>
            <RoyalButton label={config.action} onPress={continueWithSelection} />
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
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  intro: { alignItems: 'center', paddingBottom: 25, paddingTop: 35 },
  heading: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: { color: colors.sandstone, fontSize: 13, marginTop: 8, textAlign: 'center' },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  option: {
    backgroundColor: colors.goldDark,
    borderColor: '#93662d',
    borderRadius: 15,
    borderWidth: 1,
    minHeight: 154,
    overflow: 'hidden',
    padding: 2,
    width: '48.1%',
  },
  optionSelected: {
    borderColor: colors.goldLight,
    shadowColor: colors.gold,
    shadowOpacity: 0.52,
    shadowRadius: 9,
  },
  optionFace: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    padding: 12,
    position: 'relative',
  },
  optionLabel: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 9,
    textAlign: 'center',
  },
  optionEmblemFrame: {
    backgroundColor: '#130d09',
    borderColor: '#8f622c',
    borderRadius: 18,
    borderWidth: 1.5,
    elevation: 6,
    height: 84,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
    width: 84,
  },
  optionEmblemFrameSelected: {
    borderColor: colors.goldLight,
    elevation: 9,
    shadowColor: colors.goldLight,
    shadowOpacity: 0.42,
    shadowRadius: 8,
  },
  optionEmblem: { height: '100%', width: '100%' },
  checkBadge: {
    alignItems: 'center',
    backgroundColor: colors.goldLight,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  actionArea: { marginTop: 'auto', paddingTop: 34 },
  pressed: { opacity: 0.78 },
});
