import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';

export function CivBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        contentFit="cover"
        source={require('@/assets/images/indian-palace-chess-bg.png')}
        style={StyleSheet.absoluteFill}
        transition={220}
      />
      <LinearGradient
        colors={[
          'rgba(5, 11, 18, 0.2)',
          'rgba(5, 11, 18, 0.62)',
          'rgba(5, 11, 18, 0.38)',
          'rgba(5, 11, 18, 0.76)',
        ]}
        locations={[0, 0.32, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screenFrame} />
    </View>
  );
}

export function RoyalCorners() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.corner, styles.cornerTopLeft]} />
      <View style={[styles.corner, styles.cornerTopRight]} />
      <View style={[styles.corner, styles.cornerBottomLeft]} />
      <View style={[styles.corner, styles.cornerBottomRight]} />
    </View>
  );
}

export function OrnamentDivider() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.divider}>
      <View style={styles.dividerLine} />
      <View style={styles.dividerDiamond} />
      <View style={[styles.dividerDiamond, styles.dividerDiamondSmall]} />
      <View style={styles.dividerDiamond} />
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenFrame: {
    borderColor: 'rgba(201, 143, 28, 0.45)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 7,
    left: 7,
    position: 'absolute',
    right: 7,
    top: 7,
  },
  corner: {
    height: 24,
    position: 'absolute',
    width: 24,
  },
  cornerTopLeft: {
    borderLeftColor: colors.goldLight,
    borderLeftWidth: 2,
    borderTopColor: colors.goldLight,
    borderTopLeftRadius: 8,
    borderTopWidth: 2,
    left: -1,
    top: -1,
  },
  cornerTopRight: {
    borderRightColor: colors.goldLight,
    borderRightWidth: 2,
    borderTopColor: colors.goldLight,
    borderTopRightRadius: 8,
    borderTopWidth: 2,
    right: -1,
    top: -1,
  },
  cornerBottomLeft: {
    borderBottomColor: colors.goldLight,
    borderBottomLeftRadius: 8,
    borderBottomWidth: 2,
    borderLeftColor: colors.goldLight,
    borderLeftWidth: 2,
    bottom: -1,
    left: -1,
  },
  cornerBottomRight: {
    borderBottomColor: colors.goldLight,
    borderBottomRightRadius: 8,
    borderBottomWidth: 2,
    borderRightColor: colors.goldLight,
    borderRightWidth: 2,
    bottom: -1,
    right: -1,
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 17,
  },
  dividerLine: {
    backgroundColor: colors.border,
    height: 1,
    maxWidth: 72,
    width: '20%',
  },
  dividerDiamond: {
    backgroundColor: colors.goldDark,
    height: 7,
    transform: [{ rotate: '45deg' }],
    width: 7,
  },
  dividerDiamondSmall: {
    backgroundColor: colors.gold,
    height: 5,
    width: 5,
  },
});
