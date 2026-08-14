import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

type PlayScreenHeaderProps = {
  rightAction?: {
    accessibilityLabel: string;
    icon: SymbolViewProps['name'];
    onPress: () => void;
  };
  showSettings?: boolean;
  title: string;
};

export function PlayScreenHeader({ rightAction, showSettings = true, title }: PlayScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <SymbolView
          name={{ android: 'arrow_back', ios: 'arrow.left', web: 'arrow_back' }}
          size={29}
          tintColor={colors.goldLight}
        />
      </Pressable>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {rightAction ? (
        <Pressable
          accessibilityLabel={rightAction.accessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={rightAction.onPress}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <SymbolView name={rightAction.icon} size={27} tintColor={colors.goldLight} />
        </Pressable>
      ) : showSettings ? (
        <Pressable
          accessibilityLabel="Play settings"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => Alert.alert('Play settings', 'Game preferences are coming next.')}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
          <SymbolView
            name={{ android: 'settings', ios: 'gearshape.fill', web: 'settings' }}
            size={27}
            tintColor={colors.sandstone}
          />
        </Pressable>
      ) : <View style={styles.headerButton} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: 'rgba(4, 14, 23, 0.97)',
    borderBottomColor: 'rgba(225, 183, 99, 0.72)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 57,
    paddingHorizontal: 8,
  },
  headerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: '#e7c88b',
    flex: 1,
    fontFamily: 'serif',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  pressed: { opacity: 0.66 },
});
