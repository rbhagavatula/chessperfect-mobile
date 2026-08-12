import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BOARD_THEMES,
  BOARD_THEME_OPTIONS,
  PIECE_ASSETS,
  PIECE_THEME_OPTIONS,
  type BoardThemeName,
  type PieceKey,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { colors } from '@/constants/colors';

const previewPieces: PieceKey[] = ['wK', 'wQ', 'bN'];

type ChessThemePickerProps = {
  boardTheme: BoardThemeName;
  onChangeBoardTheme: (theme: BoardThemeName) => void;
  onChangePieceTheme: (theme: PieceThemeName) => void;
  onClose: () => void;
  pieceTheme: PieceThemeName;
  visible: boolean;
};

export function ChessThemePicker({
  boardTheme,
  onChangeBoardTheme,
  onChangePieceTheme,
  onClose,
  pieceTheme,
  visible,
}: ChessThemePickerProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>BOARD APPEARANCE</Text>
            <Text style={styles.title}>Choose Your Chess Set</Text>
          </View>
          <Pressable
            accessibilityLabel="Close theme picker"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.closeText}>DONE</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>BOARD THEME</Text>
          <View style={styles.boardOptions}>
            {BOARD_THEME_OPTIONS.map((themeName) => {
              const theme = BOARD_THEMES[themeName];
              const selected = boardTheme === themeName;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={themeName}
                  onPress={() => onChangeBoardTheme(themeName)}
                  style={({ pressed }) => [
                    styles.boardOption,
                    selected && styles.selectedOption,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.boardSwatch}>
                    <View style={[styles.swatchSquare, { backgroundColor: theme.light }]} />
                    <View style={[styles.swatchSquare, { backgroundColor: theme.dark }]} />
                    <View style={[styles.swatchSquare, { backgroundColor: theme.dark }]} />
                    <View style={[styles.swatchSquare, { backgroundColor: theme.light }]} />
                  </View>
                  <Text style={[styles.optionLabel, selected && styles.selectedLabel]}>{theme.label}</Text>
                  {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, styles.pieceSectionTitle]}>PIECE SET</Text>
          <View style={styles.pieceOptions}>
            {PIECE_THEME_OPTIONS.map((theme) => {
              const selected = pieceTheme === theme.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={theme.id}
                  onPress={() => onChangePieceTheme(theme.id)}
                  style={({ pressed }) => [
                    styles.pieceOption,
                    selected && styles.selectedOption,
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.piecePreview}>
                    {previewPieces.map((key) => (
                      <Image
                        accessibilityIgnoresInvertColors
                        contentFit="contain"
                        key={`${theme.id}-${key}`}
                        source={PIECE_ASSETS[theme.id][key]}
                        style={styles.previewPiece}
                      />
                    ))}
                  </View>
                  <Text style={[styles.pieceLabel, selected && styles.selectedLabel]}>{theme.label}</Text>
                  {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#07111b', flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  eyebrow: { color: colors.saffron, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 3 },
  closeButton: {
    borderColor: colors.gold,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  closeText: { color: colors.goldLight, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  content: { paddingBottom: 34, paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { color: colors.sandstone, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  boardOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  boardOption: {
    alignItems: 'center',
    backgroundColor: '#0b1925',
    borderColor: '#314252',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 9,
    width: '48.5%',
  },
  selectedOption: { backgroundColor: '#14253a', borderColor: colors.goldLight, borderWidth: 1.5 },
  boardSwatch: { borderRadius: 5, flexDirection: 'row', flexWrap: 'wrap', height: 32, overflow: 'hidden', width: 40 },
  swatchSquare: { height: 16, width: 20 },
  optionLabel: { color: colors.cream, flex: 1, fontSize: 13, fontWeight: '800', marginLeft: 8 },
  selectedLabel: { color: colors.goldLight },
  checkmark: { color: colors.goldLight, fontSize: 17, fontWeight: '900' },
  pieceSectionTitle: { marginTop: 26 },
  pieceOptions: { gap: 8, marginTop: 10 },
  pieceOption: {
    alignItems: 'center',
    backgroundColor: '#0b1925',
    borderColor: '#314252',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  piecePreview: {
    alignItems: 'center',
    backgroundColor: '#c7ad7b',
    borderRadius: 7,
    flexDirection: 'row',
    height: 46,
    justifyContent: 'center',
    width: 116,
  },
  previewPiece: { height: 36, width: 36 },
  pieceLabel: { color: colors.cream, flex: 1, fontSize: 14, fontWeight: '800', marginLeft: 12 },
  pressed: { opacity: 0.7 },
});
