import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type PlayModeCardProps = {
  onPress: () => void;
  source: ImageSource;
  subtitle: string;
  title: string;
};

export function PlayModeCard({ onPress, source, subtitle, title }: PlayModeCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <LinearGradient
        colors={['#e5c178', '#8c612d', '#f0cd82']}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.goldFrame}>
        <LinearGradient
          colors={['rgba(54, 35, 20, 0.99)', 'rgba(22, 14, 10, 0.99)']}
          style={styles.cardFace}>
          <View style={styles.medallionFrame}>
            <Image contentFit="cover" source={source} style={styles.medallion} transition={180} />
          </View>
          <View style={styles.copy}>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text>
          </View>
          <SymbolView
            name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }}
            size={34}
            tintColor={colors.goldLight}
          />
          <View pointerEvents="none" style={styles.cornerTopLeft} />
          <View pointerEvents="none" style={styles.cornerBottomRight} />
        </LinearGradient>
      </LinearGradient>
      <View pointerEvents="none" style={styles.topGem}>
        <View style={styles.topGemInset} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 16,
    minHeight: 143,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.72,
    shadowRadius: 7,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.987 }],
  },
  goldFrame: {
    borderRadius: 16,
    flex: 1,
    padding: 2,
  },
  cardFace: {
    alignItems: 'center',
    borderColor: '#6d481f',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 139,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  medallionFrame: {
    backgroundColor: '#21130c',
    borderColor: '#c49240',
    borderRadius: 55,
    borderWidth: 1.5,
    height: 108,
    overflow: 'hidden',
    width: 108,
  },
  medallion: { height: '100%', width: '100%' },
  copy: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  title: {
    color: colors.cream,
    fontFamily: 'serif',
    fontSize: 22,
    fontWeight: '900',
    textShadowColor: '#160905',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 2,
  },
  subtitle: {
    color: colors.sandstone,
    fontFamily: 'serif',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 7,
  },
  topGem: {
    alignItems: 'center',
    backgroundColor: '#d0a45a',
    height: 18,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -9,
    position: 'absolute',
    top: -8,
    transform: [{ rotate: '45deg' }],
    width: 18,
  },
  topGemInset: {
    backgroundColor: '#841d27',
    borderColor: '#f1c96f',
    borderWidth: 1,
    height: 11,
    width: 11,
  },
  cornerTopLeft: {
    borderLeftColor: 'rgba(249, 222, 159, 0.72)',
    borderLeftWidth: 1,
    borderTopColor: 'rgba(249, 222, 159, 0.72)',
    borderTopLeftRadius: 9,
    borderTopWidth: 1,
    height: 24,
    left: 6,
    position: 'absolute',
    top: 6,
    width: 24,
  },
  cornerBottomRight: {
    borderBottomColor: 'rgba(249, 222, 159, 0.72)',
    borderBottomRightRadius: 9,
    borderBottomWidth: 1,
    borderRightColor: 'rgba(249, 222, 159, 0.72)',
    borderRightWidth: 1,
    bottom: 6,
    height: 24,
    position: 'absolute',
    right: 6,
    width: 24,
  },
});
