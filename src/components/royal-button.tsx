import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';

type RoyalButtonProps = {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
};

export function RoyalButton({ label, onPress, style }: RoyalButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shell, style, pressed && styles.pressed]}>
      <LinearGradient
        colors={[colors.goldLight, colors.gold, colors.goldDark, colors.gold]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.goldRim}>
        <LinearGradient
          colors={['#c3211a', '#9f1510', '#710b09']}
          end={{ x: 0.75, y: 1 }}
          start={{ x: 0.25, y: 0 }}
          style={styles.face}>
          <Text style={styles.label}>{label}</Text>
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 17,
    shadowColor: '#000000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 7,
  },
  goldRim: { borderRadius: 17, overflow: 'hidden', padding: 3 },
  face: {
    alignItems: 'center',
    borderColor: 'rgba(255, 231, 157, 0.42)',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 53,
    overflow: 'hidden',
    paddingHorizontal: 24,
  },
  label: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 2,
    zIndex: 2,
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
});
