import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';

type RoyalPanelProps = {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

export function RoyalPanel({ children, contentStyle, style }: RoyalPanelProps) {
  return (
    <View style={[styles.panel, style]}>
      <LinearGradient
        colors={['rgba(14, 29, 44, 0.98)', 'rgba(5, 15, 25, 0.99)', 'rgba(3, 10, 17, 0.99)']}
        locations={[0, 0.52, 1]}
        style={styles.panelSurface}
      />

      <View style={[styles.content, contentStyle]}>{children}</View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.frame}>
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/top.png')}
          style={styles.topEdge}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/right.png')}
          style={styles.rightEdge}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/bottom.png')}
          style={styles.bottomEdge}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/left.png')}
          style={styles.leftEdge}
        />

        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/top-left.png')}
          style={styles.topLeft}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/top-right.png')}
          style={styles.topRight}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/bottom-right.png')}
          style={styles.bottomRight}
        />
        <Image
          contentFit="fill"
          source={require('@/assets/frames/indian-royal-panel/bottom-left.png')}
          style={styles.bottomLeft}
        />
      </View>
    </View>
  );
}

const frameSize = 76;
const edgeOverlap = 54;
const frameOutset = -9;

const styles = StyleSheet.create({
  panel: {
    shadowColor: colors.ink,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.44,
    shadowRadius: 24,
  },
  panelSurface: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: 4,
    bottom: 18,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 18,
  },
  content: {
    paddingBottom: 60,
    paddingHorizontal: 28,
    paddingTop: 30,
    zIndex: 1,
  },
  frame: {
    bottom: frameOutset,
    left: frameOutset,
    position: 'absolute',
    right: frameOutset,
    top: frameOutset,
    zIndex: 2,
  },
  topEdge: {
    height: frameSize,
    left: edgeOverlap,
    position: 'absolute',
    right: edgeOverlap,
    top: 0,
  },
  rightEdge: {
    bottom: edgeOverlap,
    position: 'absolute',
    right: 0,
    top: edgeOverlap,
    width: frameSize,
  },
  bottomEdge: {
    bottom: 0,
    height: frameSize,
    left: edgeOverlap,
    position: 'absolute',
    right: edgeOverlap,
  },
  leftEdge: {
    bottom: edgeOverlap,
    left: 0,
    position: 'absolute',
    top: edgeOverlap,
    width: frameSize,
  },
  topLeft: {
    height: frameSize,
    left: 0,
    position: 'absolute',
    top: 0,
    width: frameSize,
  },
  topRight: {
    height: frameSize,
    position: 'absolute',
    right: 0,
    top: 0,
    width: frameSize,
  },
  bottomRight: {
    bottom: 0,
    height: frameSize,
    position: 'absolute',
    right: 0,
    width: frameSize,
  },
  bottomLeft: {
    bottom: 0,
    height: frameSize,
    left: 0,
    position: 'absolute',
    width: frameSize,
  },
});
