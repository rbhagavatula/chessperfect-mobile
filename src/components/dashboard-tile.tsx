import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type DashboardTileProps = {
  accent: string;
  compact: boolean;
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
};

export function DashboardTile({ accent, compact, icon, label, onPress }: DashboardTileProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, compact && styles.tileCompact, pressed && styles.pressed]}>
      <LinearGradient
        colors={['rgba(15, 39, 62, 0.98)', 'rgba(5, 17, 29, 0.99)']}
        style={styles.surface}>
        <View style={[styles.iconHalo, compact && styles.iconHaloCompact, { borderColor: accent }]}>
          <LinearGradient
            colors={[`${accent}42`, 'rgba(3, 12, 22, 0.92)']}
            style={styles.iconGradient}>
            <SymbolView
              name={icon}
              size={compact ? 37 : 45}
              tintColor={accent}
            />
          </LinearGradient>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.label, compact && styles.labelCompact]}>
          {label}
        </Text>
        <View style={styles.ornament}>
          <View style={[styles.line, { backgroundColor: accent }]} />
          <View style={[styles.diamond, { backgroundColor: accent }]} />
          <View style={[styles.line, { backgroundColor: accent }]} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderColor: colors.gold,
    borderRadius: 17,
    borderWidth: 1,
    minHeight: 164,
    overflow: 'hidden',
    width: '42%',
  },
  tileCompact: { minHeight: 142 },
  surface: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  iconHalo: {
    alignItems: 'center',
    borderRadius: 44,
    borderWidth: 1,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  iconHaloCompact: { height: 68, width: 68 },
  iconGradient: {
    alignItems: 'center',
    borderRadius: 40,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  label: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
  },
  labelCompact: { fontSize: 14, marginTop: 8 },
  ornament: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 9 },
  line: { height: 1, opacity: 0.62, width: 24 },
  diamond: { height: 6, transform: [{ rotate: '45deg' }], width: 6 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
