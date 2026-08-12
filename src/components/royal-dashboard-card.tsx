import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type RoyalDashboardCardProps = {
  label: string;
  onPress: () => void;
  source: ImageSource;
};

export function RoyalDashboardCard({ label, onPress, source }: RoyalDashboardCardProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <View style={styles.outerFrame}>
        <View style={styles.innerFrame}>
          <Image contentFit="cover" source={source} style={styles.image} transition={180} />
          <LinearGradient
            colors={['rgba(20, 9, 6, 0)', 'rgba(20, 9, 6, 0.68)', 'rgba(12, 5, 4, 0.96)']}
            locations={[0, 0.48, 1]}
            style={styles.labelShade}>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.label}>
              {label}
            </Text>
          </LinearGradient>
          <View pointerEvents="none" style={styles.cornerTopLeft} />
          <View pointerEvents="none" style={styles.cornerTopRight} />
        </View>
        <View pointerEvents="none" style={styles.bottomGem}>
          <View style={styles.bottomGemInset} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    aspectRatio: 0.82,
    width: '48.4%',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  outerFrame: {
    backgroundColor: '#b69b71',
    borderColor: '#d9bd80',
    borderRadius: 14,
    borderWidth: 2,
    flex: 1,
    padding: 5,
    shadowColor: '#000000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 7,
  },
  innerFrame: {
    borderColor: '#7f1f25',
    borderRadius: 9,
    borderWidth: 2,
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#3b251b',
  },
  labelShade: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    minHeight: '38%',
    paddingBottom: 13,
    paddingHorizontal: 7,
    position: 'absolute',
    right: 0,
  },
  label: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
    textShadowColor: '#241006',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  cornerTopLeft: {
    borderLeftColor: 'rgba(248, 225, 175, 0.8)',
    borderLeftWidth: 1,
    borderTopColor: 'rgba(248, 225, 175, 0.8)',
    borderTopLeftRadius: 7,
    borderTopWidth: 1,
    height: 28,
    left: 5,
    position: 'absolute',
    top: 5,
    width: 28,
  },
  cornerTopRight: {
    borderRightColor: 'rgba(248, 225, 175, 0.8)',
    borderRightWidth: 1,
    borderTopColor: 'rgba(248, 225, 175, 0.8)',
    borderTopRightRadius: 7,
    borderTopWidth: 1,
    height: 28,
    position: 'absolute',
    right: 5,
    top: 5,
    width: 28,
  },
  bottomGem: {
    alignItems: 'center',
    backgroundColor: '#a88a59',
    bottom: -8,
    height: 18,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -9,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 18,
  },
  bottomGemInset: {
    backgroundColor: '#7b1723',
    borderColor: '#e7bc5b',
    borderWidth: 1,
    height: 11,
    width: 11,
  },
});
