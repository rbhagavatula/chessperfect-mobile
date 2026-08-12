import { Chess, type Square } from 'chess.js';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChessThemePicker } from '@/components/chess-theme-picker';
import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { NativeChessBoard, type BoardPiece } from '@/components/native-chess-board';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalButton } from '@/components/royal-button';
import {
  DEFAULT_BOARD_THEME,
  DEFAULT_PIECE_THEME,
  PIECE_ASSETS,
  pieceKey,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { colors } from '@/constants/colors';
import { loadChessPreferences, saveChessPreferences } from '@/lib/chess-preferences';
import { restoreSession } from '@/lib/session';

type PieceMap = Partial<Record<Square, BoardPiece>>;
type EditorTool = BoardPiece | 'erase' | 'move';
type CastlingRights = Record<'K' | 'Q' | 'k' | 'q', boolean>;

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const startFen = new Chess().fen();

function piecesFromFen(fen: string): PieceMap {
  const pieces: PieceMap = {};
  const board = fen.split(' ')[0];
  board.split('/').forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const character of row) {
      if (/\d/.test(character)) {
        fileIndex += Number.parseInt(character, 10);
        continue;
      }
      const square = `${files[fileIndex]}${8 - rowIndex}` as Square;
      pieces[square] = {
        color: character === character.toLowerCase() ? 'b' : 'w',
        type: character.toLowerCase() as BoardPiece['type'],
      };
      fileIndex += 1;
    }
  });
  return pieces;
}

function boardPartFromPieces(pieces: PieceMap) {
  return ranks.map((rank) => {
    let empty = 0;
    let row = '';
    files.forEach((file) => {
      const piece = pieces[`${file}${rank}` as Square];
      if (!piece) {
        empty += 1;
        return;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    });
    return row + (empty ? String(empty) : '');
  }).join('/');
}

function castlingString(castling: CastlingRights) {
  const value = `${castling.K ? 'K' : ''}${castling.Q ? 'Q' : ''}${castling.k ? 'k' : ''}${castling.q ? 'q' : ''}`;
  return value || '-';
}

function buildFen(pieces: PieceMap, turn: 'b' | 'w', castling: CastlingRights, enPassant: string) {
  const normalizedEnPassant = /^([a-h][36]|-)$/.test(enPassant) ? enPassant : '-';
  return `${boardPartFromPieces(pieces)} ${turn} ${castlingString(castling)} ${normalizedEnPassant} 0 1`;
}

function normalizedFen(value?: string) {
  if (!value?.trim()) return null;
  try {
    return new Chess(value.trim()).fen();
  } catch {
    return null;
  }
}

const palette: BoardPiece[] = (['w', 'b'] as const).flatMap((color) =>
  (['k', 'q', 'r', 'b', 'n', 'p'] as const).map((type) => ({ color, type })),
);

export default function BoardEditorScreen() {
  const params = useLocalSearchParams<{ fen?: string }>();
  const routeFen = normalizedFen(typeof params.fen === 'string' ? params.fen : undefined) ?? startFen;
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 24, 520);
  const [pieces, setPieces] = useState<PieceMap>(() => piecesFromFen(routeFen));
  const [turn, setTurn] = useState<'b' | 'w'>(() => routeFen.split(' ')[1] === 'b' ? 'b' : 'w');
  const [castling, setCastling] = useState<CastlingRights>(() => {
    const rights = routeFen.split(' ')[2] ?? '-';
    return { K: rights.includes('K'), Q: rights.includes('Q'), k: rights.includes('k'), q: rights.includes('q') };
  });
  const [enPassant, setEnPassant] = useState(routeFen.split(' ')[3] ?? '-');
  const [tool, setTool] = useState<EditorTool>('move');
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [orientation, setOrientation] = useState<'black' | 'white'>('white');
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [fenInput, setFenInput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | undefined>(undefined);

  const currentFen = useMemo(
    () => buildFen(pieces, turn, castling, enPassant),
    [castling, enPassant, pieces, turn],
  );
  const enPassantOptions = useMemo(
    () => ['-', ...files.map((file) => `${file}${turn === 'w' ? '6' : '3'}`)],
    [turn],
  );

  useEffect(() => {
    let active = true;
    void restoreSession().then(async (session) => {
      if (!active || !session) return;
      accessTokenRef.current = session.accessToken;
      const preferences = await loadChessPreferences(session.accessToken);
      if (!active) return;
      setBoardTheme(preferences.boardTheme);
      setPieceTheme(preferences.pieceTheme);
    });
    return () => {
      active = false;
    };
  }, []);

  function updateSquare(square: Square) {
    setError(null);
    setFenInput(null);
    if (tool === 'move') {
      if (!moveFrom) {
        if (pieces[square]) setMoveFrom(square);
        return;
      }
      setPieces((current) => {
        const movingPiece = current[moveFrom];
        if (!movingPiece) return current;
        const next = { ...current };
        delete next[moveFrom];
        next[square] = movingPiece;
        return next;
      });
      setMoveFrom(null);
      return;
    }
    setMoveFrom(null);
    setPieces((current) => {
      const next = { ...current };
      if (tool === 'erase') delete next[square];
      else next[square] = tool;
      return next;
    });
  }

  function applyFen(value = fenInput ?? currentFen) {
    const fen = normalizedFen(value);
    if (!fen) {
      setError('This FEN is not a legal chess position.');
      return;
    }
    const [, nextTurn, rights, nextEnPassant] = fen.split(' ');
    setPieces(piecesFromFen(fen));
    setTurn(nextTurn === 'b' ? 'b' : 'w');
    setCastling({ K: rights.includes('K'), Q: rights.includes('Q'), k: rights.includes('k'), q: rights.includes('q') });
    setEnPassant(nextEnPassant || '-');
    setFenInput(null);
    setMoveFrom(null);
    setError(null);
  }

  function clearBoard() {
    setPieces({});
    setTurn('w');
    setCastling({ K: false, Q: false, k: false, q: false });
    setEnPassant('-');
    setFenInput(null);
    setMoveFrom(null);
    setError(null);
  }

  function openAnalysis() {
    const fen = normalizedFen(currentFen);
    if (!fen) {
      setError('Add exactly one king for each side and create a legal position before analyzing.');
      return;
    }
    router.push({ pathname: '/learn/analysis', params: { fen } } as unknown as Href);
  }

  function changeBoardTheme(next: BoardThemeName) {
    setBoardTheme(next);
    void saveChessPreferences({ boardTheme: next, pieceTheme }, accessTokenRef.current);
  }

  function changePieceTheme(next: PieceThemeName) {
    setPieceTheme(next);
    void saveChessPreferences({ boardTheme, pieceTheme: next }, accessTokenRef.current);
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Board Editor" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.boardToolbar}>
            <EditorToolbar icon={{ android: 'open_with', ios: 'move.3d', web: 'open_with' }} label="Move" onPress={() => { setTool('move'); setMoveFrom(null); }} selected={tool === 'move'} />
            <EditorToolbar icon={{ android: 'ink_eraser', ios: 'eraser.fill', web: 'ink_eraser' }} label="Erase" onPress={() => { setTool('erase'); setMoveFrom(null); }} selected={tool === 'erase'} />
            <EditorToolbar icon={{ android: 'flip_camera_android', ios: 'arrow.triangle.2.circlepath', web: 'flip_camera_android' }} label="Flip" onPress={() => setOrientation((value) => value === 'white' ? 'black' : 'white')} />
            <EditorToolbar icon={{ android: 'palette', ios: 'paintpalette.fill', web: 'palette' }} label="Theme" onPress={() => setThemePickerOpen(true)} />
          </View>

          <NativeChessBoard
            boardTheme={boardTheme}
            getPiece={(square) => pieces[square as Square]}
            onSquarePress={(square) => updateSquare(square as Square)}
            orientation={orientation}
            pieceTheme={pieceTheme}
            selectedSquare={moveFrom}
            size={boardSize}
          />

          <LinearGradient colors={['rgba(58, 39, 24, 0.98)', 'rgba(14, 10, 8, 0.99)']} style={styles.panel}>
            <RoyalCorners />
            <Text style={styles.eyebrow}>POSITION WORKSHOP</Text>
            <Text style={styles.panelTitle}>Choose a Piece</Text>
            <Text style={styles.hint}>Select a piece, then tap any square to place it.</Text>
            <View style={styles.palette}>
              {palette.map((piece) => {
                const selected = typeof tool === 'object' && tool.color === piece.color && tool.type === piece.type;
                return (
                  <Pressable
                    accessibilityLabel={`${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}`}
                    key={`${piece.color}${piece.type}`}
                    onPress={() => { setTool(piece); setMoveFrom(null); }}
                    style={({ pressed }) => [styles.pieceChoice, selected && styles.pieceChoiceSelected, pressed && styles.pressed]}>
                    <Image contentFit="contain" source={PIECE_ASSETS[pieceTheme][pieceKey(piece.color, piece.type)]} style={styles.palettePiece} />
                  </Pressable>
                );
              })}
            </View>

            <OrnamentDivider />
            <Text style={styles.sectionLabel}>SIDE TO MOVE</Text>
            <View style={styles.choiceRow}>
              <Choice label="White" onPress={() => { setTurn('w'); setFenInput(null); }} selected={turn === 'w'} />
              <Choice label="Black" onPress={() => { setTurn('b'); setFenInput(null); }} selected={turn === 'b'} />
            </View>

            <Text style={styles.sectionLabel}>CASTLING RIGHTS</Text>
            <View style={styles.castlingGrid}>
              {([
                ['K', 'White O-O'],
                ['Q', 'White O-O-O'],
                ['k', 'Black O-O'],
                ['q', 'Black O-O-O'],
              ] as const).map(([key, label]) => (
                <Choice key={key} label={label} onPress={() => { setCastling((value) => ({ ...value, [key]: !value[key] })); setFenInput(null); }} selected={castling[key]} />
              ))}
            </View>

            <Text style={styles.sectionLabel}>EN PASSANT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.enPassantScroller}>
              <View style={styles.enPassantRow}>
                {enPassantOptions.map((option) => (
                  <Pressable key={option} onPress={() => { setEnPassant(option); setFenInput(null); }} style={[styles.enPassantChoice, enPassant === option && styles.enPassantChoiceSelected]}>
                    <Text style={[styles.enPassantLabel, enPassant === option && styles.enPassantLabelSelected]}>{option === '-' ? 'None' : option}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </LinearGradient>

          <View style={styles.fenPanel}>
            <Text style={styles.sectionLabel}>FEN POSITION</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setFenInput}
              placeholder="Paste a FEN position"
              placeholderTextColor={colors.muted}
              style={styles.fenInput}
              value={fenInput ?? currentFen}
            />
            <View style={styles.fenActions}>
              <Pressable onPress={() => applyFen()} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                <Text style={styles.linkLabel}>Load FEN</Text>
              </Pressable>
              <Pressable onPress={() => applyFen(startFen)} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                <Text style={styles.linkLabel}>Start Position</Text>
              </Pressable>
              <Pressable onPress={clearBoard} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                <Text style={[styles.linkLabel, styles.clearLabel]}>Clear Board</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <RoyalButton label="Open in Analysis Board" onPress={openAnalysis} style={styles.analysisButton} />
        </ScrollView>
      </SafeAreaView>

      <ChessThemePicker
        boardTheme={boardTheme}
        onChangeBoardTheme={changeBoardTheme}
        onChangePieceTheme={changePieceTheme}
        onClose={() => setThemePickerOpen(false)}
        pieceTheme={pieceTheme}
        visible={themePickerOpen}
      />
    </LinearGradient>
  );
}

function EditorToolbar({ icon, label, onPress, selected = false }: { icon: SymbolViewProps['name']; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.toolbarButton, selected && styles.toolbarButtonSelected, pressed && styles.pressed]}>
      <SymbolView name={icon} size={18} tintColor={colors.goldLight} />
      <Text style={styles.toolbarLabel}>{label}</Text>
    </Pressable>
  );
}

function Choice({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignItems: 'center', paddingBottom: 30, paddingHorizontal: 12, paddingTop: 10 },
  boardToolbar: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: 8, maxWidth: 520, width: '100%' },
  toolbarButton: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 38 },
  toolbarButtonSelected: { backgroundColor: '#6f1b22', borderColor: colors.goldLight },
  toolbarLabel: { color: colors.sandstone, fontSize: 10, fontWeight: '800' },
  panel: { borderColor: colors.goldDark, borderRadius: 14, borderWidth: 1, marginTop: 12, maxWidth: 520, overflow: 'hidden', padding: 15, width: '100%' },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  panelTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 3 },
  hint: { color: colors.sandstone, fontSize: 10, marginTop: 3 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12 },
  pieceChoice: { alignItems: 'center', backgroundColor: '#ead9b4', borderColor: '#8c7047', borderRadius: 8, borderWidth: 1, height: 48, justifyContent: 'center', width: '14.7%' },
  pieceChoiceSelected: { backgroundColor: '#fff0b5', borderColor: '#f4c95d', borderWidth: 2 },
  palettePiece: { height: 42, width: 42 },
  sectionLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, marginTop: 10 },
  choiceRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  castlingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  choice: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.88)', borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 36, minWidth: '45%', paddingHorizontal: 7 },
  choiceSelected: { backgroundColor: '#6f1b22', borderColor: colors.goldLight },
  choiceLabel: { color: colors.sandstone, fontSize: 10, fontWeight: '800' },
  choiceLabelSelected: { color: colors.goldLight },
  enPassantScroller: { marginTop: 7 },
  enPassantRow: { flexDirection: 'row', gap: 6, paddingRight: 6 },
  enPassantChoice: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.88)', borderColor: colors.border, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 34, minWidth: 48, paddingHorizontal: 10 },
  enPassantChoiceSelected: { backgroundColor: '#6f1b22', borderColor: colors.goldLight },
  enPassantLabel: { color: colors.sandstone, fontSize: 10, fontWeight: '800' },
  enPassantLabelSelected: { color: colors.goldLight },
  fenPanel: { backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 12, borderWidth: 1, marginTop: 12, maxWidth: 520, padding: 13, width: '100%' },
  fenInput: { backgroundColor: 'rgba(238, 224, 191, 0.96)', borderColor: colors.goldDark, borderRadius: 9, borderWidth: 1, color: '#15100c', fontFamily: 'monospace', fontSize: 10, lineHeight: 15, marginTop: 8, minHeight: 64, padding: 9, textAlignVertical: 'top' },
  fenActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 10 },
  linkButton: { borderBottomColor: colors.goldLight, borderBottomWidth: 1.5, paddingBottom: 2 },
  linkLabel: { color: colors.goldLight, fontSize: 11, fontWeight: '800' },
  clearLabel: { color: '#f4a7a7' },
  error: { color: '#fecdd3', fontSize: 10, lineHeight: 15, marginTop: 8 },
  analysisButton: { marginTop: 16, maxWidth: 520, width: '100%' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
