import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';

const learningTools: {
  description: string;
  icon: SymbolViewProps['name'];
  label: string;
  route: '/learn/analysis' | '/learn/editor' | '/learn/puzzles';
}[] = [
  {
    description: 'Train tactical patterns, build your puzzle rating, and extend your winning streak.',
    icon: { android: 'extension', ios: 'puzzlepiece.fill', web: 'extension' },
    label: 'Puzzles',
    route: '/learn/puzzles',
  },
  {
    description: 'Explore legal variations, review notation, and evaluate positions with the royal engine.',
    icon: { android: 'query_stats', ios: 'chart.bar.xaxis', web: 'query_stats' },
    label: 'Analysis Board',
    route: '/learn/analysis',
  },
  {
    description: 'Create any position, configure its rules, and send it directly to analysis.',
    icon: { android: 'edit_square', ios: 'square.and.pencil', web: 'edit_square' },
    label: 'Board Editor',
    route: '/learn/editor',
  },
];

export default function LearnScreen() {
  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Learn" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>THE COMMANDER&apos;S LIBRARY</Text>
            <Text style={styles.heading}>Study the Battlefield</Text>
            <Text style={styles.caption}>Build positions, examine ideas, and sharpen your chess understanding.</Text>
          </View>

          <OrnamentDivider />

          <View style={styles.cards}>
            {learningTools.map((tool) => (
              <Pressable
                accessibilityLabel={tool.label}
                accessibilityRole="button"
                key={tool.label}
                onPress={() => router.push(tool.route as Href)}
                style={({ pressed }) => [styles.cardFrame, pressed && styles.pressed]}>
                <LinearGradient colors={['#5a3a22', '#24150e', '#0b0b0a']} style={styles.card}>
                  <RoyalCorners />
                  <View style={styles.iconMedallion}>
                    <SymbolView name={tool.icon} size={38} tintColor={colors.goldLight} />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardEyebrow}>CHESS TOOL</Text>
                    <Text style={styles.cardTitle}>{tool.label}</Text>
                    <Text style={styles.cardDescription}>{tool.description}</Text>
                  </View>
                  <View style={styles.openBadge}>
                    <Text style={styles.openLabel}>OPEN</Text>
                    <SymbolView
                      name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }}
                      size={18}
                      tintColor={colors.goldLight}
                    />
                  </View>
                </LinearGradient>
              </Pressable>
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
  content: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 13 },
  intro: { alignItems: 'center', paddingHorizontal: 14, paddingTop: 25 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: colors.cream, fontFamily: 'serif', fontSize: 28, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  caption: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 7, maxWidth: 360, textAlign: 'center' },
  cards: { gap: 14, marginTop: 5 },
  cardFrame: { borderColor: colors.goldLight, borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  card: { alignItems: 'center', borderColor: colors.goldDark, borderRadius: 14, borderWidth: 2, flexDirection: 'row', minHeight: 154, overflow: 'hidden', paddingHorizontal: 15, paddingVertical: 17 },
  iconMedallion: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.9)', borderColor: colors.gold, borderRadius: 37, borderWidth: 1.5, height: 74, justifyContent: 'center', width: 74 },
  cardCopy: { flex: 1, marginLeft: 14, minWidth: 0 },
  cardEyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  cardTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginTop: 3 },
  cardDescription: { color: colors.sandstone, fontSize: 10, lineHeight: 15, marginTop: 6 },
  openBadge: { alignItems: 'center', marginLeft: 5 },
  openLabel: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
});
