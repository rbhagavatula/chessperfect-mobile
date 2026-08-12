import { Image } from 'expo-image';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BOARD_THEMES,
  PIECE_ASSETS,
  pieceKey,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';

export type BoardPiece = {
  color: 'b' | 'w';
  type: 'b' | 'k' | 'n' | 'p' | 'q' | 'r';
};

type NativeChessBoardProps = {
  arrows?: readonly BoardArrow[];
  boardTheme: BoardThemeName;
  getPiece: (square: string) => BoardPiece | undefined;
  lastMove?: { from: string; to: string } | null;
  legalTargets?: readonly string[];
  onSquarePress?: (square: string) => void;
  orientation?: 'black' | 'white';
  pieceTheme: PieceThemeName;
  selectedSquare?: string | null;
  size: number;
  squareHighlights?: readonly BoardSquareHighlight[];
};

export type BoardAnnotationColor = 'blue' | 'default' | 'green' | 'red';
export type BoardArrow = { color: BoardAnnotationColor; from: string; to: string };
export type BoardSquareHighlight = { color: BoardAnnotationColor; square: string };

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const frameWidth = 4;

export function NativeChessBoard({
  arrows = [],
  boardTheme,
  getPiece,
  lastMove,
  legalTargets = [],
  onSquarePress,
  orientation = 'white',
  pieceTheme,
  selectedSquare,
  size,
  squareHighlights = [],
}: NativeChessBoardProps) {
  const theme = BOARD_THEMES[boardTheme];
  // A square whose size maps to a fractional device pixel can leave hairline
  // gaps after Android rounds adjacent view edges. Snap the square itself to a
  // whole physical-pixel size so all eight files and ranks meet seamlessly.
  const pixelRatio = PixelRatio.get();
  const squarePixels = Math.floor(((size - frameWidth * 2) * pixelRatio) / 8);
  const squareSize = squarePixels / pixelRatio;
  const innerSize = squareSize * 8;
  const displayedFiles = orientation === 'white' ? files : [...files].reverse();
  const displayedRanks = orientation === 'white' ? [...ranks].reverse() : ranks;
  const annotationColors: Record<BoardAnnotationColor, string> = {
    blue: 'rgba(37, 99, 235, 0.72)',
    default: 'rgba(217, 164, 39, 0.72)',
    green: 'rgba(22, 163, 74, 0.72)',
    red: 'rgba(220, 38, 38, 0.72)',
  };
  const squarePosition = (square: string) => {
    const fileIndex = displayedFiles.indexOf(square.charAt(0) as typeof files[number]);
    const rankIndex = displayedRanks.indexOf(Number(square.charAt(1)) as typeof ranks[number]);
    return fileIndex < 0 || rankIndex < 0 ? null : {
      x: fileIndex * squareSize + squareSize / 2,
      y: rankIndex * squareSize + squareSize / 2,
    };
  };

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: theme.frameDark,
          borderColor: theme.frameLight,
          height: innerSize + 8,
          width: innerSize + 8,
        },
      ]}>
      {displayedRanks.map((rank, rowIndex) => (
        <View key={rank} style={[styles.row, { height: squareSize }]}>
          {displayedFiles.map((file, columnIndex) => {
            const square = `${file}${rank}`;
            const piece = getPiece(square);
            const isLight = (files.indexOf(file) + rank) % 2 === 1;
            const isSelected = selectedSquare === square;
            const isTarget = legalTargets.includes(square);
            const isLastMove = lastMove?.from === square || lastMove?.to === square;
            const squareHighlight = squareHighlights.find((highlight) => highlight.square === square);
            return (
              <Pressable
                accessibilityLabel={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}` : ''}`}
                accessibilityRole="button"
                key={square}
                onPress={() => onSquarePress?.(square)}
                style={[
                  styles.square,
                  {
                    backgroundColor: isLight ? theme.light : theme.dark,
                    height: squareSize,
                    width: squareSize,
                  },
                  isLastMove && { backgroundColor: theme.highlight },
                  squareHighlight && { backgroundColor: annotationColors[squareHighlight.color] },
                  isSelected && styles.selected,
                ]}>
                {piece ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    contentFit="contain"
                    source={PIECE_ASSETS[pieceTheme][pieceKey(piece.color, piece.type)]}
                    style={styles.piece}
                  />
                ) : null}
                {isTarget ? <View style={[styles.target, piece && styles.captureTarget]} /> : null}
                {columnIndex === 0 ? (
                  <Text style={[styles.rank, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{rank}</Text>
                ) : null}
                {rowIndex === 7 ? (
                  <Text style={[styles.file, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{file}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View pointerEvents="none" style={[styles.annotationLayer, { height: innerSize, left: frameWidth, top: frameWidth, width: innerSize }]}>
        {arrows.map((arrow, index) => {
          const from = squarePosition(arrow.from);
          const to = squarePosition(arrow.to);
          if (!from || !to) return null;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = `${Math.atan2(dy, dx)}rad`;
          return (
            <View key={`${arrow.from}-${arrow.to}-${arrow.color}-${index}`}>
              <View style={[styles.arrowLine, { backgroundColor: annotationColors[arrow.color], left: (from.x + to.x - length) / 2, top: (from.y + to.y) / 2 - 3, transform: [{ rotate: angle }], width: length }]} />
              <View style={[styles.arrowHead, { backgroundColor: annotationColors[arrow.color], left: to.x - 7, top: to.y - 7 }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 5,
    borderWidth: frameWidth,
    elevation: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  row: { flexDirection: 'row' },
  annotationLayer: { position: 'absolute' },
  arrowLine: { borderRadius: 4, height: 6, position: 'absolute' },
  arrowHead: { borderRadius: 7, height: 14, position: 'absolute', width: 14 },
  square: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  selected: { backgroundColor: '#d8a928' },
  piece: { height: '88%', width: '88%' },
  target: {
    backgroundColor: 'rgba(12, 63, 42, 0.58)',
    borderRadius: 10,
    height: 15,
    position: 'absolute',
    width: 15,
  },
  captureTarget: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(94, 21, 17, 0.75)',
    borderRadius: 28,
    borderWidth: 4,
    height: '84%',
    width: '84%',
  },
  rank: { fontSize: 8, fontWeight: '900', left: 2, position: 'absolute', top: 1 },
  file: { bottom: 1, fontSize: 8, fontWeight: '900', position: 'absolute', right: 2 },
  lightCoordinate: { color: 'rgba(255, 255, 255, 0.82)' },
  darkCoordinate: { color: 'rgba(45, 28, 14, 0.76)' },
});
