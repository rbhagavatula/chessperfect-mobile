import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';

export type DashboardSection = 'Home' | 'Play' | 'Learn' | 'Analyze' | 'Academy' | 'Profile';

type NavItem = {
  icon: SymbolViewProps['name'];
  label: DashboardSection;
};

const navItems: NavItem[] = [
  { icon: { android: 'home', ios: 'house.fill', web: 'home' }, label: 'Home' },
  { icon: { android: 'swords', ios: 'gamecontroller.fill', web: 'swords' }, label: 'Play' },
  { icon: { android: 'menu_book', ios: 'book.fill', web: 'menu_book' }, label: 'Learn' },
  { icon: { android: 'query_stats', ios: 'chart.bar.xaxis', web: 'query_stats' }, label: 'Analyze' },
  { icon: { android: 'school', ios: 'graduationcap.fill', web: 'school' }, label: 'Academy' },
  { icon: { android: 'person', ios: 'person.crop.circle.fill', web: 'person' }, label: 'Profile' },
];

type DashboardSidebarProps = {
  activeSection: DashboardSection;
  expanded: boolean;
  onSelect: (section: DashboardSection) => void;
  onSignOut: () => void;
  onToggle: () => void;
};

export function DashboardSidebar({
  activeSection,
  expanded,
  onSelect,
  onSignOut,
  onToggle,
}: DashboardSidebarProps) {
  const [expansion] = useState(() => new Animated.Value(expanded ? 1 : 0));

  useEffect(() => {
    Animated.timing(expansion, {
      duration: 260,
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [expanded, expansion]);

  const width = expansion.interpolate({ inputRange: [0, 1], outputRange: [64, 118] });
  const labelOpacity = expansion.interpolate({ inputRange: [0.35, 1], outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.shell, { width }]}>
      <View style={styles.rail}>
        <View style={styles.logoArea}>
          <Image
            accessibilityLabel="ChessPerfect"
            contentFit="contain"
            source={require('@/assets/images/chessperfect-logo-transparent-v2.png')}
            style={styles.logo}
          />
        </View>

        <View style={styles.navList}>
          {navItems.map((item) => {
            const selected = item.label === activeSection;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={item.label}
                onPress={() => onSelect(item.label)}
                style={({ pressed }) => [
                  styles.navItem,
                  selected && styles.navItemSelected,
                  pressed && styles.pressed,
                ]}>
                <SymbolView
                  name={item.icon}
                  size={27}
                  tintColor={selected ? colors.goldLight : colors.sandstone}
                />
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    styles.navLabel,
                    selected && styles.navLabelSelected,
                    { opacity: labelOpacity },
                  ]}>
                  {item.label}
                </Animated.Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          onPress={onSignOut}
          style={({ pressed }) => [styles.navItem, styles.signOutItem, pressed && styles.pressed]}>
          <SymbolView
            name={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right', web: 'logout' }}
            size={25}
            tintColor={colors.gold}
          />
          <Animated.Text numberOfLines={1} style={[styles.signOutLabel, { opacity: labelOpacity }]}>
            Sign out
          </Animated.Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityLabel={expanded ? 'Collapse side menu' : 'Expand side menu'}
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}>
        <SymbolView
          name={
            expanded
              ? { android: 'chevron_left', ios: 'chevron.left', web: 'chevron_left' }
              : { android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }
          }
          size={23}
          tintColor={colors.ink}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    elevation: 12,
    shadowColor: colors.ink,
    shadowOffset: { height: 0, width: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    zIndex: 4,
  },
  rail: {
    backgroundColor: 'rgba(3, 13, 24, 0.93)',
    borderRightColor: colors.gold,
    borderRightWidth: 1,
    flex: 1,
    overflow: 'hidden',
    paddingBottom: 10,
    paddingTop: 8,
  },
  logoArea: {
    alignItems: 'center',
    borderBottomColor: 'rgba(201, 143, 28, 0.3)',
    borderBottomWidth: 1,
    height: 76,
    justifyContent: 'center',
    marginBottom: 8,
  },
  logo: { height: 56, width: 56 },
  navList: { flex: 1, gap: 5, paddingTop: 4 },
  navItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 7,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  navItemSelected: {
    backgroundColor: 'rgba(15, 54, 84, 0.94)',
    borderColor: colors.gold,
  },
  navLabel: {
    color: colors.sandstone,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  navLabelSelected: { color: colors.goldLight },
  signOutItem: { marginTop: 'auto' },
  signOutLabel: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
  },
  toggle: {
    alignItems: 'center',
    backgroundColor: colors.goldLight,
    borderColor: '#fff0b5',
    borderRadius: 18,
    borderWidth: 2,
    elevation: 7,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    right: -18,
    top: 86,
    width: 36,
  },
  togglePressed: { backgroundColor: colors.gold, transform: [{ scale: 0.95 }] },
  pressed: { opacity: 0.72 },
});
