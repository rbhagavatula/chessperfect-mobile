import { Chess, type Square } from 'chess.js';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChessThemePicker } from '@/components/chess-theme-picker';
import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { NativeChessBoard } from '@/components/native-chess-board';
import { PlayScreenHeader } from '@/components/play-screen-header';
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
import {
  fetchMyDatabaseGameReview,
  queueMyDatabaseGameReview,
  type MyDatabaseGameReview,
} from '@/lib/my-database';
import {
  analyzePosition,
  type PositionAnalysis,
  type PositionAnalysisLine,
} from '@/lib/position-analysis';
import { restoreSession } from '@/lib/session';

type PromotionPiece = 'b' | 'n' | 'q' | 'r';
type TimelinePosition = { fen: string; san: string | null; uci: string | null };
type VariationLine = { positions: TimelinePosition[]; startPly: number };
type NotationMoveTarget =
  | { branch: 'main'; positionIndex: number }
  | { branch: 'variation'; positionIndex: number; variationIndex: number };
type LoadFormat = 'fen' | 'pgn';

const startFen = new Chess().fen();
function validFen(value?: string) {
  if (!value?.trim()) return null;
  try {
    return new Chess(value.trim()).fen();
  } catch {
    return null;
  }
}

function principalVariationSan(fen: string, principalVariation?: string | null) {
  if (!principalVariation) return '';
  const game = new Chess(fen);
  const moves: string[] = [];
  for (const uci of principalVariation.trim().split(/\s+/).slice(0, 8)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    try {
      const move = game.move({
        from: uci.slice(0, 2),
        promotion: (uci[4] || 'q') as PromotionPiece,
        to: uci.slice(2, 4),
      });
      if (!move) break;
      moves.push(move.san);
    } catch {
      break;
    }
  }
  return moves.map((move, index) => {
    const prefix = movePrefix(fen, index, index === 0);
    return [prefix, move].filter(Boolean).join('');
  }).join(' ');
}

function evaluationVerdict(centipawns?: number | null, mate?: number | null) {
  if (mate !== null && mate !== undefined) {
    return {
      symbol: mate > 0 ? '+-' : '-+',
      text: mate > 0 ? 'White has a forced mate' : 'Black has a forced mate',
    };
  }
  const value = centipawns ?? 0;
  const absolute = Math.abs(value);
  if (absolute < 25) return { symbol: '=', text: 'The position is equal' };
  const side = value > 0 ? 'White' : 'Black';
  if (absolute < 75) return { symbol: value > 0 ? '+/=' : '=/+', text: `${side} is slightly better` };
  if (absolute < 150) return { symbol: value > 0 ? '+=' : '=+', text: `${side} is clearly better` };
  if (absolute < 300) return { symbol: value > 0 ? '+/-' : '-/+', text: `${side} has a decisive advantage` };
  return { symbol: value > 0 ? '+-' : '-+', text: `${side} is winning` };
}

function evaluationSymbol(analysis: PositionAnalysisLine | null) {
  return evaluationVerdict(analysis?.centipawns, analysis?.mate).symbol;
}

function evaluationScore(analysis: PositionAnalysisLine | null) {
  if (!analysis) return '—';
  if (analysis.mate !== null && analysis.mate !== undefined) {
    return analysis.mate > 0 ? `M${analysis.mate}` : `-M${Math.abs(analysis.mate)}`;
  }
  const pawns = (analysis.centipawns ?? 0) / 100;
  return `${pawns > 0 ? '+' : pawns < 0 ? '-' : ''}${Math.abs(pawns).toFixed(2)}`;
}

function formattedEvaluation(centipawns?: number | null, mate?: number | null) {
  const line: PositionAnalysisLine = { centipawns, mate };
  return `${evaluationScore(line)} ${evaluationVerdict(centipawns, mate).symbol}`;
}

function evaluationWhitePercent(centipawns?: number | null, mate?: number | null) {
  if (mate !== null && mate !== undefined) return mate > 0 ? 96 : 4;
  const value = centipawns ?? 0;
  const normalized = 50 + (Math.atan(value / 400) / (Math.PI / 2)) * 46;
  return Math.max(4, Math.min(96, normalized));
}

function movePrefix(rootFen: string, relativePly: number, forceBlackPrefix = false) {
  const fields = rootFen.split(/\s+/);
  const startsWithBlack = fields[1] === 'b';
  const baseMoveNumber = Number.parseInt(fields[5] ?? '1', 10) || 1;
  const absoluteOffset = relativePly + (startsWithBlack ? 1 : 0);
  const moveNumber = baseMoveNumber + Math.floor(absoluteOffset / 2);
  if (absoluteOffset % 2 === 0) return `${moveNumber}.`;
  return forceBlackPrefix ? `${moveNumber}...` : '';
}

function formatMoveSequence(rootFen: string, positions: TimelinePosition[], startPly = 0) {
  return positions.map((position, index) => {
    const prefix = movePrefix(rootFen, startPly + index, index === 0);
    return [prefix, position.san ?? ''].filter(Boolean).join(' ');
  }).join(' ');
}

function formatNotation(timeline: TimelinePosition[], variations: VariationLine[]) {
  const rootFen = timeline[0]?.fen ?? startFen;
  const parts: string[] = [];
  timeline.slice(1).forEach((position, index) => {
    const prefix = movePrefix(rootFen, index);
    parts.push([prefix, position.san ?? ''].filter(Boolean).join(' '));
    variations
      .filter((variation) => variation.startPly === index)
      .forEach((variation) => {
        const variationText = formatMoveSequence(rootFen, variation.positions, variation.startPly);
        if (variationText) parts.push(`(${variationText})`);
      });
  });
  return parts.join(' ');
}

function pgnMovetext(pgn: string) {
  return pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, '').replace(/\s+/g, ' ').trim();
}

function timelineFromPgn(pgn?: string) {
  if (!pgn?.trim()) return null;
  try {
    const pgnGame = new Chess();
    pgnGame.loadPgn(pgn.trim());
    const moves = pgnGame.history({ verbose: true });
    const firstFen = moves[0]?.before ?? pgnGame.fen();
    return [
      { fen: firstFen, san: null, uci: null },
      ...moves.map((move) => ({
        fen: move.after,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      })),
    ] satisfies TimelinePosition[];
  } catch {
    return null;
  }
}

function exportPgn(timeline: TimelinePosition[], variations: VariationLine[], importedPgn: string | null) {
  if (importedPgn) return importedPgn.trim();
  const rootFen = timeline[0]?.fen ?? startFen;
  const headers = [
    '[Event "ChessPerfect Analysis"]',
    '[Site "ChessPerfect Mobile"]',
    '[Result "*"]',
  ];
  if (rootFen !== startFen) headers.push('[SetUp "1"]', `[FEN "${rootFen}"]`);
  const moves = formatNotation(timeline, variations);
  return `${headers.join('\n')}\n\n${moves ? `${moves} ` : ''}*`;
}

export default function AnalysisBoardScreen() {
  const params = useLocalSearchParams<{ fen?: string; gameId?: string; pgn?: string }>();
  const routeFen = validFen(typeof params.fen === 'string' ? params.fen : undefined);
  const routePgn = typeof params.pgn === 'string' ? params.pgn : undefined;
  const routeGameId = typeof params.gameId === 'string' && /^\d+$/.test(params.gameId)
    ? Number.parseInt(params.gameId, 10)
    : null;
  const { width } = useWindowDimensions();
  const boardAreaWidth = Math.min(width - 24, 520);
  const boardSize = boardAreaWidth - 44;
  const initialFen = routeFen ?? startFen;
  const routeTimeline = timelineFromPgn(routePgn);
  const initialTimeline = routeTimeline ?? [{ fen: initialFen, san: null, uci: null }];
  const [timeline, setTimeline] = useState<TimelinePosition[]>(initialTimeline);
  const [variations, setVariations] = useState<VariationLine[]>([]);
  const [importedPgn, setImportedPgn] = useState<string | null>(routeTimeline && routePgn ? routePgn : null);
  const [cursor, setCursor] = useState(initialTimeline.length - 1);
  const [notationSelection, setNotationSelection] = useState<NotationMoveTarget | null>(initialTimeline.length > 1
    ? { branch: 'main', positionIndex: initialTimeline.length - 1 }
    : null);
  const [moveMenuTarget, setMoveMenuTarget] = useState<NotationMoveTarget | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [orientation, setOrientation] = useState<'black' | 'white'>('white');
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [depthPickerOpen, setDepthPickerOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [loadFormat, setLoadFormat] = useState<LoadFormat>('fen');
  const [positionInput, setPositionInput] = useState(initialFen);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PositionAnalysis | null>(null);
  const [analysisFen, setAnalysisFen] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [engineLineCount, setEngineLineCount] = useState(3);
  const [engineDepth, setEngineDepth] = useState(14);
  const [gameReview, setGameReview] = useState<MyDatabaseGameReview | null>(null);
  const [gameReviewError, setGameReviewError] = useState<string | null>(null);
  const [gameReviewBusy, setGameReviewBusy] = useState(false);
  const [gameReviewRefreshKey, setGameReviewRefreshKey] = useState(0);
  const accessTokenRef = useRef<string | undefined>(undefined);
  const analysisSequenceRef = useRef(0);

  const variationPreview = notationSelection?.branch === 'variation'
    ? variations[notationSelection.variationIndex]?.positions[notationSelection.positionIndex]
    : null;
  const current = variationPreview ?? timeline[cursor];
  const currentFen = current?.fen ?? startFen;
  const game = useMemo(() => new Chess(currentFen), [currentFen]);
  const lastMove = current?.uci
    ? { from: current.uci.slice(0, 2), to: current.uci.slice(2, 4) }
    : null;
  const engineLines = useMemo<PositionAnalysisLine[]>(() => {
    if (!analysis) return [];
    if (analysis.lines?.length) return analysis.lines.slice(0, engineLineCount);
    return [analysis];
  }, [analysis, engineLineCount]);
  const notation = importedPgn ? pgnMovetext(importedPgn) : formatNotation(timeline, variations);
  const displayedEngineLines = useMemo(
    () => engineLines.map((line) => ({
      ...line,
      san: principalVariationSan(analysisFen ?? currentFen, line.principalVariation),
    })),
    [analysisFen, currentFen, engineLines],
  );
  const selectedGameReviewMove = notationSelection?.branch === 'main' && cursor > 0
    ? gameReview?.moves.find((move) => move.ply === cursor) ?? null
    : null;
  const currentEngineLine = analysisFen === currentFen ? engineLines[0] ?? null : null;
  const currentEvaluationCp = currentEngineLine?.centipawns ?? selectedGameReviewMove?.evaluationAfterCp ?? null;
  const currentEvaluationMate = currentEngineLine?.mate ?? selectedGameReviewMove?.mateAfter ?? null;

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
      analysisSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (routeGameId == null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loadReview = async () => {
      try {
        let review = await fetchMyDatabaseGameReview(routeGameId);
        if (review.status === 'NOT_REQUESTED') review = await queueMyDatabaseGameReview(routeGameId);
        if (!active) return;
        setGameReview(review);
        setGameReviewError(null);
        if (review.status === 'QUEUED' || review.status === 'ANALYZING') {
          timer = setTimeout(loadReview, 1500);
        }
      } catch (caught: unknown) {
        if (active) setGameReviewError(caught instanceof Error ? caught.message : 'The game review could not be loaded.');
      }
    };
    void loadReview();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameReviewRefreshKey, routeGameId]);

  useEffect(() => {
    if (!engineEnabled) return;

    const sequence = ++analysisSequenceRef.current;
    const timeout = setTimeout(() => {
      setAnalyzing(true);
      setAnalysisError(null);
      const progressiveDepths = [...new Set([
        Math.min(8, engineDepth),
        Math.min(12, engineDepth),
        engineDepth,
      ])].sort((left, right) => left - right);
      void (async () => {
        for (const depth of progressiveDepths) {
          const result = await analyzePosition(currentFen, depth, accessTokenRef.current, engineLineCount);
          if (sequence !== analysisSequenceRef.current) return;
          setAnalysis(result);
          setAnalysisFen(currentFen);
        }
      })()
        .catch((caught: unknown) => {
          if (sequence !== analysisSequenceRef.current) return;
          setAnalysisError(caught instanceof Error ? caught.message : 'The engine could not analyze this position.');
        })
        .finally(() => {
          if (sequence === analysisSequenceRef.current) setAnalyzing(false);
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
      if (sequence === analysisSequenceRef.current) analysisSequenceRef.current += 1;
    };
  }, [currentFen, engineDepth, engineEnabled, engineLineCount]);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setLegalTargets([]);
  }, []);

  function selectSquare(square: Square) {
    if (notationSelection?.branch === 'variation') return;
    if (game.isGameOver()) return;
    const clickedPiece = game.get(square);
    if (selected && legalTargets.includes(square)) {
      const mover = game.get(selected);
      if (mover?.type === 'p' && (square.endsWith('1') || square.endsWith('8'))) {
        setPendingPromotion({ from: selected, to: square });
        clearSelection();
        return;
      }
      playMove(selected, square);
      return;
    }
    if (clickedPiece?.color === game.turn()) {
      setSelected(square);
      setLegalTargets(game.moves({ square, verbose: true }).map((move) => move.to));
      return;
    }
    clearSelection();
  }

  function playMove(from: Square, to: Square, promotion?: PromotionPiece) {
    const nextGame = new Chess(currentFen);
    try {
      const move = nextGame.move({ from, promotion: promotion ?? 'q', to });
      if (!move) return;
      const abandonedContinuation = timeline.slice(cursor + 1);
      const nextTimeline = timeline.slice(0, cursor + 1);
      nextTimeline.push({
        fen: nextGame.fen(),
        san: move.san,
        uci: `${from}${to}${move.promotion ?? ''}`,
      });
      setTimeline(nextTimeline);
      if (abandonedContinuation.length > 0) {
        const abandonedMoves = abandonedContinuation.map((position) => position.uci).join(' ');
        setVariations((currentVariations) => [
          ...currentVariations.filter((variation) => !(
            variation.startPly === cursor
            && variation.positions.map((position) => position.uci).join(' ') === abandonedMoves
          )),
          { positions: abandonedContinuation, startPly: cursor },
        ]);
      }
      setImportedPgn(null);
      setCursor(nextTimeline.length - 1);
      setNotationSelection({ branch: 'main', positionIndex: nextTimeline.length - 1 });
      setPendingPromotion(null);
      setAnalysisError(null);
      setAnalyzing(false);
      analysisSequenceRef.current += 1;
      clearSelection();
    } catch {
      clearSelection();
    }
  }

  function moveCursor(nextCursor: number) {
    const boundedCursor = Math.max(0, Math.min(timeline.length - 1, nextCursor));
    setCursor(boundedCursor);
    setNotationSelection(boundedCursor === 0 ? null : { branch: 'main', positionIndex: boundedCursor });
    setAnalysisError(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function selectNotationMove(target: NotationMoveTarget) {
    setNotationSelection(target);
    if (target.branch === 'main') setCursor(target.positionIndex);
    setAnalysisError(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function openMoveMenu(target: NotationMoveTarget) {
    selectNotationMove(target);
    setMoveMenuTarget(target);
  }

  function promoteVariation() {
    if (moveMenuTarget?.branch !== 'variation') return;
    const variation = variations[moveMenuTarget.variationIndex];
    if (!variation) return;
    const branchPositionIndex = variation.startPly;
    const formerMainContinuation = timeline.slice(branchPositionIndex + 1);
    const promotedTimeline = [
      ...timeline.slice(0, branchPositionIndex + 1),
      ...variation.positions,
    ];
    const remainingVariations = variations.filter((_, index) => (
      index !== moveMenuTarget.variationIndex
      && variations[index].startPly <= branchPositionIndex
    ));
    if (formerMainContinuation.length > 0) {
      remainingVariations.push({
        positions: formerMainContinuation,
        startPly: branchPositionIndex,
      });
    }
    const promotedPositionIndex = branchPositionIndex + variation.positions.length;
    setTimeline(promotedTimeline);
    setVariations(remainingVariations);
    setCursor(promotedPositionIndex);
    setNotationSelection({ branch: 'main', positionIndex: promotedPositionIndex });
    setMoveMenuTarget(null);
    setImportedPgn(null);
    setAnalysisError(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function deleteSelectedMove() {
    if (!moveMenuTarget) return;
    if (moveMenuTarget.branch === 'main') {
      const branchPositionIndex = Math.max(0, moveMenuTarget.positionIndex - 1);
      setTimeline((currentTimeline) => currentTimeline.slice(0, moveMenuTarget.positionIndex));
      setVariations((currentVariations) => currentVariations.filter((variation) => variation.startPly < branchPositionIndex));
      setCursor(branchPositionIndex);
      setNotationSelection(branchPositionIndex === 0 ? null : { branch: 'main', positionIndex: branchPositionIndex });
    } else {
      const variation = variations[moveMenuTarget.variationIndex];
      if (!variation) return;
      const remainingPositions = variation.positions.slice(0, moveMenuTarget.positionIndex);
      setVariations((currentVariations) => remainingPositions.length === 0
        ? currentVariations.filter((_, index) => index !== moveMenuTarget.variationIndex)
        : currentVariations.map((item, index) => index === moveMenuTarget.variationIndex
          ? { ...item, positions: remainingPositions }
          : item));
      setCursor(variation.startPly);
      setNotationSelection(variation.startPly === 0 ? null : { branch: 'main', positionIndex: variation.startPly });
    }
    setMoveMenuTarget(null);
    setImportedPgn(null);
    setAnalysisError(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function deleteSelectedVariation() {
    if (moveMenuTarget?.branch !== 'variation') return;
    const variation = variations[moveMenuTarget.variationIndex];
    if (!variation) return;
    setVariations((currentVariations) => currentVariations.filter((_, index) => index !== moveMenuTarget.variationIndex));
    setCursor(variation.startPly);
    setNotationSelection(variation.startPly === 0 ? null : { branch: 'main', positionIndex: variation.startPly });
    setMoveMenuTarget(null);
    setImportedPgn(null);
    setAnalysisError(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function openLoadDialog() {
    setActionMenuOpen(false);
    setLoadFormat('fen');
    setPositionInput(currentFen);
    setLoadError(null);
    setLoadDialogOpen(true);
  }

  function changeLoadFormat(format: LoadFormat) {
    setLoadFormat(format);
    setPositionInput(format === 'fen' ? currentFen : '');
    setLoadError(null);
  }

  function loadPosition() {
    try {
      let nextTimeline: TimelinePosition[];
      if (loadFormat === 'fen') {
        const normalized = validFen(positionInput);
        if (!normalized) throw new Error('Enter a valid FEN position before loading it.');
        nextTimeline = [{ fen: normalized, san: null, uci: null }];
        setImportedPgn(null);
      } else {
        if (!positionInput.trim()) throw new Error('Paste PGN notation before loading it.');
        const pgnGame = new Chess();
        pgnGame.loadPgn(positionInput.trim());
        const moves = pgnGame.history({ verbose: true });
        const firstFen = moves[0]?.before ?? pgnGame.fen();
        nextTimeline = [
          { fen: firstFen, san: null, uci: null },
          ...moves.map((move) => ({
            fen: move.after,
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ''}`,
          })),
        ];
        setImportedPgn(positionInput.trim());
      }

      setTimeline(nextTimeline);
      setVariations([]);
      setCursor(nextTimeline.length - 1);
      setNotationSelection(nextTimeline.length > 1
        ? { branch: 'main', positionIndex: nextTimeline.length - 1 }
        : null);
      setLoadError(null);
      setLoadDialogOpen(false);
      setAnalysis(null);
      setAnalysisFen(null);
      setAnalysisError(null);
      setAnalyzing(false);
      analysisSequenceRef.current += 1;
      clearSelection();
    } catch (caught) {
      const fallback = loadFormat === 'fen'
        ? 'Enter a valid FEN position before loading it.'
        : 'The PGN could not be read. Check the notation and try again.';
      setLoadError(caught instanceof Error && caught.message ? caught.message : fallback);
    }
  }

  function resetBoard() {
    setTimeline([{ fen: startFen, san: null, uci: null }]);
    setVariations([]);
    setImportedPgn(null);
    setCursor(0);
    setNotationSelection(null);
    setMoveMenuTarget(null);
    setLoadError(null);
    setAnalysis(null);
    setAnalysisFen(null);
    setAnalyzing(false);
    analysisSequenceRef.current += 1;
    clearSelection();
  }

  function changeEngineState(enabled: boolean) {
    setEngineEnabled(enabled);
    if (enabled) return;
    analysisSequenceRef.current += 1;
    setAnalysis(null);
    setAnalysisFen(null);
    setAnalysisError(null);
    setAnalyzing(false);
  }

  function changeBoardTheme(next: BoardThemeName) {
    setBoardTheme(next);
    void saveChessPreferences({ boardTheme: next, pieceTheme }, accessTokenRef.current);
  }

  function changePieceTheme(next: PieceThemeName) {
    setPieceTheme(next);
    void saveChessPreferences({ boardTheme, pieceTheme: next }, accessTokenRef.current);
  }

  async function sharePgn() {
    setActionMenuOpen(false);
    await Share.share({
      message: exportPgn(timeline, variations, importedPgn),
      title: 'ChessPerfect Analysis PGN',
    });
  }

  async function retryGameReview() {
    if (routeGameId == null || gameReviewBusy) return;
    try {
      setGameReviewBusy(true);
      setGameReviewError(null);
      setGameReview(await queueMyDatabaseGameReview(routeGameId));
      setGameReviewRefreshKey((value) => value + 1);
    } catch (caught: unknown) {
      setGameReviewError(caught instanceof Error ? caught.message : 'The game review could not be started.');
    } finally {
      setGameReviewBusy(false);
    }
  }

  function confirmRerunGameReview() {
    Alert.alert(
      'Rerun game analysis?',
      'The saved review will be replaced when the new analysis finishes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rerun', onPress: () => void retryGameReview() },
      ],
    );
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Analysis Board" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.boardToolbar}>
            <ToolbarButton icon={{ android: 'menu', ios: 'ellipsis.circle.fill', web: 'menu' }} label="Options" onPress={() => setActionMenuOpen(true)} wide />
            <ToolbarButton icon={{ android: 'flip_camera_android', ios: 'arrow.triangle.2.circlepath', web: 'flip_camera_android' }} label="Flip" onPress={() => setOrientation((value) => value === 'white' ? 'black' : 'white')} />
            <ToolbarButton icon={{ android: 'restart_alt', ios: 'arrow.counterclockwise', web: 'restart_alt' }} label="Reset" onPress={resetBoard} />
          </View>

          <View style={[styles.boardWithEvaluation, { width: boardAreaWidth }]}>
            <EvaluationBar centipawns={currentEvaluationCp} mate={currentEvaluationMate} />
            <NativeChessBoard
              boardTheme={boardTheme}
              getPiece={(square) => game.get(square as Square)}
              lastMove={lastMove}
              legalTargets={legalTargets}
              onSquarePress={(square) => selectSquare(square as Square)}
              orientation={orientation}
              pieceTheme={pieceTheme}
              selectedSquare={selected}
              size={boardSize}
            />
          </View>

          <View style={styles.navigationRow}>
            <NavButton disabled={cursor === 0} icon={{ android: 'first_page', ios: 'backward.end.fill', web: 'first_page' }} label="Start" onPress={() => moveCursor(0)} />
            <NavButton disabled={cursor === 0} icon={{ android: 'chevron_left', ios: 'chevron.left', web: 'chevron_left' }} label="Back" onPress={() => moveCursor(cursor - 1)} />
            <View style={styles.turnPill}>
              <Text style={styles.turnLabel}>{game.turn() === 'w' ? 'White' : 'Black'} to move</Text>
              <Text style={styles.plyLabel}>Ply {cursor}</Text>
            </View>
            <NavButton disabled={cursor === timeline.length - 1} icon={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} label="Next" onPress={() => moveCursor(cursor + 1)} />
            <NavButton disabled={cursor === timeline.length - 1} icon={{ android: 'last_page', ios: 'forward.end.fill', web: 'last_page' }} label="End" onPress={() => moveCursor(timeline.length - 1)} />
          </View>

          <View style={styles.engineSection}>
            <View style={styles.engineControls}>
              <View style={styles.engineToggleGroup}>
                <Text style={styles.engineLabel}>Engine</Text>
                {analyzing ? <ActivityIndicator color={colors.goldLight} size="small" /> : null}
                <Switch
                  accessibilityLabel="Toggle analysis engine"
                  ios_backgroundColor="#2a211b"
                  onValueChange={changeEngineState}
                  thumbColor={engineEnabled ? colors.goldLight : colors.muted}
                  trackColor={{ false: '#342820', true: '#765616' }}
                  value={engineEnabled}
                />
                <Pressable
                  accessibilityLabel={`Engine depth ${engineDepth}`}
                  onPress={() => setDepthPickerOpen(true)}
                  style={({ pressed }) => [styles.compactSelector, pressed && styles.pressed]}>
                  <Text style={styles.compactSelectorLabel}>Depth</Text>
                  <Text style={styles.compactSelectorValue}>{engineDepth}</Text>
                  <SymbolView name={{ android: 'arrow_drop_down', ios: 'chevron.down', web: 'arrow_drop_down' }} size={15} tintColor={colors.goldLight} />
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel={`Engine lines ${engineLineCount}`}
                onPress={() => setLinePickerOpen(true)}
                style={({ pressed }) => [styles.lineSelector, pressed && styles.pressed]}>
                <Text style={styles.lineSelectorLabel}>Lines</Text>
                <Text style={styles.lineSelectorValue}>{engineLineCount}</Text>
                <SymbolView name={{ android: 'arrow_drop_down', ios: 'chevron.down', web: 'arrow_drop_down' }} size={17} tintColor={colors.goldLight} />
              </Pressable>
            </View>

            {engineEnabled ? (
              <View style={styles.engineResults}>
                {displayedEngineLines.length === 0 ? (
                  <Text numberOfLines={1} style={styles.engineStatus}>
                    {analyzing ? 'Calculating…' : 'Waiting for analysis…'}
                  </Text>
                ) : null}
                {displayedEngineLines.map((line, index) => (
                  <View key={`${line.bestMove ?? 'line'}-${index}`} style={styles.engineLineRow}>
                    <View style={styles.engineLineHeader}>
                      <Text style={styles.engineLineLabel}>{index === 0 ? 'MAIN LINE' : `ALTERNATIVE ${index}`}</Text>
                    </View>
                    <Text style={styles.engineLine}>
                      {line.san || 'No principal variation available.'}{' '}
                      <Text style={styles.engineLineEvaluation}>{evaluationScore(line)} {evaluationSymbol(line)}</Text>
                    </Text>
                    <Text style={styles.engineVerdict}>{evaluationVerdict(line.centipawns, line.mate).text}</Text>
                  </View>
                ))}
                {analysisError ? <Text numberOfLines={2} style={styles.error}>{analysisError}</Text> : null}
              </View>
            ) : null}
          </View>

          {routeGameId != null ? (
            <LinearGradient colors={['rgba(22, 49, 58, 0.98)', 'rgba(10, 16, 20, 0.99)']} style={styles.reviewPanel}>
              <Text style={styles.sectionLabel}>COMPLETE GAME REVIEW</Text>
              {gameReview?.status === 'COMPLETED' ? (
                selectedGameReviewMove ? (
                  <View>
                    <View style={styles.reviewActionRow}>
                      <Pressable disabled={gameReviewBusy} onPress={confirmRerunGameReview} style={styles.reviewRetry}>
                        <Text style={styles.reviewRetryText}>{gameReviewBusy ? 'Starting…' : 'Rerun analysis'}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.reviewHeadingRow}>
                      <View style={styles.reviewBadge}>
                        <Text style={styles.reviewBadgeSymbol}>{selectedGameReviewMove.symbol}</Text>
                        <Text style={styles.reviewBadgeText}>{selectedGameReviewMove.classification}</Text>
                      </View>
                      <Text style={styles.reviewEval}>
                        Eval {formattedEvaluation(selectedGameReviewMove.evaluationAfterCp, selectedGameReviewMove.mateAfter)} · loss {((selectedGameReviewMove.centipawnLoss ?? 0) / 100).toFixed(1)}
                      </Text>
                    </View>
                    <Text style={styles.reviewCommentary}>{selectedGameReviewMove.commentary}</Text>
                    {(selectedGameReviewMove.candidateLines?.length
                      ? selectedGameReviewMove.candidateLines
                      : selectedGameReviewMove.principalVariationSan
                        ? [{
                            rank: 1,
                            principalVariationSan: selectedGameReviewMove.principalVariationSan,
                            evaluationCp: selectedGameReviewMove.evaluationBeforeCp,
                            mate: selectedGameReviewMove.mateBefore,
                            evaluationText: evaluationVerdict(
                              selectedGameReviewMove.evaluationBeforeCp,
                              selectedGameReviewMove.mateBefore,
                            ).text,
                          }]
                        : []).map((line) => (
                      <View key={`review-line-${line.rank}`} style={styles.reviewVariation}>
                        <View style={styles.reviewVariationHeader}>
                          <Text style={styles.reviewVariationLabel}>
                            {line.rank === 1 ? 'MAIN ENGINE LINE' : `ALTERNATIVE IDEA ${line.rank - 1}`}
                          </Text>
                        </View>
                        <Text style={styles.reviewVariationText}>
                          {line.principalVariationSan || 'No continuation available.'}{' '}
                          <Text style={styles.reviewLineEvaluation}>
                            {formattedEvaluation(line.evaluationCp, line.mate)}
                          </Text>
                        </Text>
                        <Text style={styles.reviewLineVerdict}>
                          {line.evaluationText || evaluationVerdict(line.evaluationCp, line.mate).text}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View>
                    <View style={styles.reviewActionRow}>
                      <Pressable disabled={gameReviewBusy} onPress={confirmRerunGameReview} style={styles.reviewRetry}>
                        <Text style={styles.reviewRetryText}>{gameReviewBusy ? 'Starting…' : 'Rerun analysis'}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.reviewHeadingRow}>
                      <Text style={styles.reviewComplete}>REVIEW COMPLETE</Text>
                      <Text style={styles.reviewEval}>
                        White {gameReview.white.accuracy?.toFixed(1) ?? '—'}% · Black {gameReview.black.accuracy?.toFixed(1) ?? '—'}%
                      </Text>
                    </View>
                    <Text style={styles.reviewCommentary}>{gameReview.summaryCommentary}</Text>
                  </View>
                )
              ) : (
                <View style={styles.reviewLoadingRow}>
                  <View style={styles.reviewLoadingCopy}>
                    <Text style={styles.reviewComplete}>
                      {gameReview?.status === 'FAILED' ? 'REVIEW NEEDS ANOTHER TRY' : 'ANALYZING EVERY MOVE'}
                    </Text>
                    <Text style={styles.reviewMuted}>
                      {gameReview?.status === 'FAILED'
                        ? 'The chess engine is currently unavailable.'
                        : 'Adding explanations, variations, and move symbols.'}
                    </Text>
                    {gameReviewError ? <Text style={styles.error}>{gameReviewError}</Text> : null}
                  </View>
                  {gameReview?.status === 'FAILED' ? (
                    <Pressable disabled={gameReviewBusy} onPress={retryGameReview} style={styles.reviewRetry}>
                      <Text style={styles.reviewRetryText}>{gameReviewBusy ? 'Starting…' : 'Retry'}</Text>
                    </Pressable>
                  ) : <ActivityIndicator color={colors.goldLight} size="small" />}
                </View>
              )}
            </LinearGradient>
          ) : null}

          <LinearGradient colors={['rgba(58, 39, 24, 0.98)', 'rgba(14, 10, 8, 0.99)']} style={styles.panel}>
            <RoyalCorners />
            <OrnamentDivider />
            <Text style={styles.sectionLabel}>MOVE NOTATION</Text>
            {timeline.length === 1 ? (
              <Text style={styles.notation}>Make a legal move on the board to begin a variation.</Text>
            ) : (
              <View style={styles.notationTable}>
                {timeline.slice(1).map((position, index) => {
                  const mainTarget: NotationMoveTarget = { branch: 'main', positionIndex: index + 1 };
                  const mainSelected = notationSelection?.branch === 'main'
                    && notationSelection.positionIndex === mainTarget.positionIndex;
                  return (
                    <View key={`main-${index}-${position.uci}`} style={styles.notationCluster}>
                      <NotationMoveButton
                        label={`${movePrefix(timeline[0].fen, index)}${position.san ?? ''}${gameReview?.moves[index]?.symbol ? ` ${gameReview.moves[index].symbol}` : ''}`}
                        onLongPress={() => openMoveMenu(mainTarget)}
                        onPress={() => selectNotationMove(mainTarget)}
                        selected={mainSelected}
                      />
                      {variations.map((variation, variationIndex) => variation.startPly === index ? (
                        <View key={`variation-${variationIndex}`} style={styles.variationGroup}>
                          <Text style={styles.variationBracket}>(</Text>
                          {variation.positions.map((variationPosition, positionIndex) => {
                            const variationTarget: NotationMoveTarget = {
                              branch: 'variation',
                              positionIndex,
                              variationIndex,
                            };
                            const variationSelected = notationSelection?.branch === 'variation'
                              && notationSelection.variationIndex === variationIndex
                              && notationSelection.positionIndex === positionIndex;
                            return (
                              <NotationMoveButton
                                key={`${variationPosition.uci}-${positionIndex}`}
                                label={`${movePrefix(timeline[0].fen, variation.startPly + positionIndex, positionIndex === 0)}${variationPosition.san ?? ''}`}
                                onLongPress={() => openMoveMenu(variationTarget)}
                                onPress={() => selectNotationMove(variationTarget)}
                                selected={variationSelected}
                                variation
                              />
                            );
                          })}
                          <Text style={styles.variationBracket}>)</Text>
                        </View>
                      ) : null)}
                    </View>
                  );
                })}
              </View>
            )}
            {importedPgn && importedPgn.includes('(') ? (
              <Text style={styles.importedVariationNote}>Imported PGN variations: {notation}</Text>
            ) : null}
          </LinearGradient>

        </ScrollView>
      </SafeAreaView>

      <Modal animationType="fade" transparent visible={actionMenuOpen} onRequestClose={() => setActionMenuOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.menuPanel}>
            <Text style={styles.modalEyebrow}>ANALYSIS BOARD</Text>
            <Text style={styles.menuTitle}>Options</Text>
            <ActionMenuItem
              icon={{ android: 'palette', ios: 'paintpalette.fill', web: 'palette' }}
              label="Theme"
              onPress={() => {
                setActionMenuOpen(false);
                setThemePickerOpen(true);
              }}
            />
            <ActionMenuItem
              icon={{ android: 'edit_square', ios: 'square.and.pencil', web: 'edit_square' }}
              label="Board Editor"
              onPress={() => {
                setActionMenuOpen(false);
                router.push({ pathname: '/learn/editor', params: { fen: currentFen } } as unknown as Href);
              }}
            />
            <ActionMenuItem
              icon={{ android: 'upload_file', ios: 'doc.badge.plus', web: 'upload_file' }}
              label="Load FEN or PGN"
              onPress={openLoadDialog}
            />
            <ActionMenuItem
              icon={{ android: 'share', ios: 'square.and.arrow.up', web: 'share' }}
              label="Share PGN"
              onPress={() => void sharePgn()}
            />
            <Pressable onPress={() => setActionMenuOpen(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(moveMenuTarget)} onRequestClose={() => setMoveMenuTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.menuPanel}>
            <Text style={styles.modalEyebrow}>MOVE ACTIONS</Text>
            <Text style={styles.menuTitle}>Edit Notation</Text>
            <MoveMenuAction
              disabled={moveMenuTarget?.branch !== 'variation'}
              icon={{ android: 'upgrade', ios: 'arrow.up.to.line', web: 'upgrade' }}
              label="Promote"
              onPress={promoteVariation}
            />
            <MoveMenuAction
              icon={{ android: 'delete', ios: 'trash', web: 'delete' }}
              label="Delete"
              onPress={deleteSelectedMove}
            />
            <MoveMenuAction
              disabled={moveMenuTarget?.branch !== 'variation'}
              icon={{ android: 'delete_sweep', ios: 'trash.slash', web: 'delete_sweep' }}
              label="Delete Variation"
              onPress={deleteSelectedVariation}
            />
            <Pressable onPress={() => setMoveMenuTarget(null)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={linePickerOpen} onRequestClose={() => setLinePickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.linePickerPanel}>
            <Text style={styles.modalEyebrow}>ENGINE SETTINGS</Text>
            <Text style={styles.menuTitle}>Number of Lines</Text>
            <View style={styles.lineOptions}>
              {[1, 2, 3, 4, 5].map((count) => (
                <Pressable
                  accessibilityLabel={`${count} engine ${count === 1 ? 'line' : 'lines'}`}
                  key={count}
                  onPress={() => {
                    setEngineLineCount(count);
                    setLinePickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.lineOption,
                    engineLineCount === count && styles.lineOptionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.lineOptionText, engineLineCount === count && styles.lineOptionTextSelected]}>{count}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setLinePickerOpen(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={depthPickerOpen} onRequestClose={() => setDepthPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.linePickerPanel}>
            <Text style={styles.modalEyebrow}>ENGINE SETTINGS</Text>
            <Text style={styles.menuTitle}>Engine Depth</Text>
            <View style={styles.depthOptions}>
              {[8, 10, 12, 14, 16, 18, 20, 22].map((depth) => (
                <Pressable
                  accessibilityLabel={`Engine depth ${depth}`}
                  key={depth}
                  onPress={() => {
                    setEngineDepth(depth);
                    setDepthPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.depthOption,
                    engineDepth === depth && styles.lineOptionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.lineOptionText, engineDepth === depth && styles.lineOptionTextSelected]}>{depth}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setDepthPickerOpen(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={loadDialogOpen} onRequestClose={() => setLoadDialogOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={styles.loadPanel}>
            <Text style={styles.modalEyebrow}>IMPORT POSITION</Text>
            <Text style={styles.menuTitle}>Load FEN or PGN</Text>
            <View style={styles.formatTabs}>
              {(['fen', 'pgn'] as LoadFormat[]).map((format) => (
                <Pressable
                  key={format}
                  onPress={() => changeLoadFormat(format)}
                  style={[styles.formatTab, loadFormat === format && styles.formatTabSelected]}>
                  <Text style={[styles.formatTabText, loadFormat === format && styles.formatTabTextSelected]}>{format.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.inputInstruction}>
              {loadFormat === 'fen' ? 'Paste a complete FEN position.' : 'Paste a PGN game. Its full move history will be available.'}
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setPositionInput}
              placeholder={loadFormat === 'fen' ? 'Paste FEN here' : 'Paste PGN here'}
              placeholderTextColor={colors.muted}
              style={styles.positionInput}
              textAlignVertical="top"
              value={positionInput}
            />
            {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
            <View style={styles.loadActions}>
              <Pressable onPress={() => setLoadDialogOpen(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={loadPosition} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>Load</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(pendingPromotion)} onRequestClose={() => setPendingPromotion(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.promotionPanel}>
            <Text style={styles.promotionTitle}>Choose Promotion</Text>
            <View style={styles.promotionRow}>
              {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((promotion) => (
                <Pressable key={promotion} onPress={() => pendingPromotion && playMove(pendingPromotion.from, pendingPromotion.to, promotion)} style={({ pressed }) => [styles.promotionChoice, pressed && styles.pressed]}>
                  <Image contentFit="contain" source={PIECE_ASSETS[pieceTheme][pieceKey(game.turn(), promotion)]} style={styles.promotionPiece} />
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setPendingPromotion(null)} style={styles.cancelPromotion}>
              <Text style={styles.cancelPromotionText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

function ToolbarButton({ icon, label, onPress, wide = false }: { icon: SymbolViewProps['name']; label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.toolbarButton, wide && styles.toolbarButtonWide, pressed && styles.pressed]}>
      <SymbolView name={icon} size={19} tintColor={colors.goldLight} />
      <Text style={styles.toolbarLabel}>{label}</Text>
    </Pressable>
  );
}

function NotationMoveButton({
  label,
  onLongPress,
  onPress,
  selected,
  variation = false,
}: {
  label: string;
  onLongPress: () => void;
  onPress: () => void;
  selected: boolean;
  variation?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`Move ${label}`}
      delayLongPress={450}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.notationMove,
        variation && styles.variationMove,
        selected && styles.notationMoveSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.notationMoveText, variation && styles.variationMoveText, selected && styles.notationMoveTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MoveMenuAction({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionMenuItem, disabled && styles.moveActionDisabled, pressed && styles.pressed]}>
      <View style={styles.actionMenuIcon}>
        <SymbolView name={icon} size={22} tintColor={colors.goldLight} />
      </View>
      <Text style={styles.actionMenuLabel}>{label}</Text>
    </Pressable>
  );
}

function ActionMenuItem({ icon, label, onPress }: { icon: SymbolViewProps['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionMenuItem, pressed && styles.pressed]}>
      <View style={styles.actionMenuIcon}>
        <SymbolView name={icon} size={22} tintColor={colors.goldLight} />
      </View>
      <Text style={styles.actionMenuLabel}>{label}</Text>
      <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={20} tintColor={colors.sandstone} />
    </Pressable>
  );
}

function NavButton({ disabled, icon, label, onPress }: { disabled: boolean; icon: SymbolViewProps['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.navButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <SymbolView name={icon} size={22} tintColor={colors.goldLight} />
    </Pressable>
  );
}

function EvaluationBar({ centipawns, mate }: { centipawns?: number | null; mate?: number | null }) {
  const whitePercent = evaluationWhitePercent(centipawns, mate);
  const label = formattedEvaluation(centipawns, mate);
  return (
    <View accessibilityLabel={`White-perspective evaluation ${label}`} style={styles.evaluationBarFrame}>
      <View style={styles.evaluationBarTrack}>
        <View style={[styles.evaluationBarWhite, { height: `${whitePercent}%` }]} />
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.evaluationBarScore}>{evaluationScore({ centipawns, mate })}</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.evaluationBarSymbol}>{evaluationVerdict(centipawns, mate).symbol}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignItems: 'center', paddingBottom: 28, paddingHorizontal: 12, paddingTop: 10 },
  boardToolbar: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: 8, maxWidth: 520, width: '100%' },
  boardWithEvaluation: { alignItems: 'stretch', flexDirection: 'row', gap: 4, justifyContent: 'center' },
  evaluationBarFrame: { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: colors.border, borderRadius: 7, borderWidth: 1, padding: 2, width: 40 },
  evaluationBarTrack: { backgroundColor: '#101216', borderRadius: 4, flex: 1, minHeight: 220, overflow: 'hidden', position: 'relative' },
  evaluationBarWhite: { backgroundColor: '#f8f5eb', bottom: 0, left: 0, position: 'absolute', right: 0 },
  evaluationBarScore: { backgroundColor: 'rgba(3,7,12,0.88)', color: '#fff', fontFamily: 'monospace', fontSize: 8, fontWeight: '900', left: 1, paddingVertical: 3, position: 'absolute', right: 1, textAlign: 'center', top: 2 },
  evaluationBarSymbol: { backgroundColor: 'rgba(255,255,255,0.9)', bottom: 2, color: '#101216', fontFamily: 'serif', fontSize: 9, fontWeight: '900', left: 1, paddingVertical: 3, position: 'absolute', right: 1, textAlign: 'center' },
  toolbarButton: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 38 },
  toolbarButtonWide: { flex: 1.65 },
  toolbarLabel: { color: colors.sandstone, fontSize: 10, fontWeight: '800' },
  navigationRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 9, maxWidth: 520, width: '100%' },
  navButton: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  turnPill: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.goldDark, borderRadius: 9, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42 },
  turnLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 12, fontWeight: '900' },
  plyLabel: { color: colors.muted, fontSize: 8, marginTop: 1 },
  engineSection: { marginTop: 10, maxWidth: 520, width: '100%' },
  engineControls: { alignItems: 'center', borderBottomColor: colors.goldDark, borderBottomWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'space-between', paddingBottom: 7 },
  panel: { borderColor: colors.goldDark, borderRadius: 14, borderWidth: 1, marginTop: 12, maxWidth: 520, overflow: 'hidden', padding: 15, width: '100%' },
  reviewPanel: { borderColor: 'rgba(115, 220, 224, 0.45)', borderRadius: 14, borderWidth: 1, marginTop: 12, maxWidth: 520, overflow: 'hidden', padding: 15, width: '100%' },
  reviewActionRow: { alignItems: 'flex-end', marginTop: 8 },
  reviewHeadingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginTop: 9 },
  reviewBadge: { alignItems: 'center', backgroundColor: 'rgba(72, 201, 176, 0.13)', borderColor: 'rgba(115, 220, 224, 0.55)', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 5 },
  reviewBadgeSymbol: { color: '#9ff5ef', fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  reviewBadgeText: { color: '#d7fffb', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  reviewComplete: { color: '#9ff5ef', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  reviewEval: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 10, fontWeight: '700' },
  reviewCommentary: { color: colors.cream, fontSize: 12, lineHeight: 19, marginTop: 10 },
  reviewVariation: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(115, 220, 224, 0.22)', borderRadius: 9, borderWidth: 1, marginTop: 10, padding: 10 },
  reviewVariationHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  reviewVariationLabel: { color: '#83dcd8', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  reviewVariationText: { color: colors.cream, fontFamily: 'monospace', fontSize: 10, lineHeight: 17, marginTop: 5 },
  reviewLineEvaluation: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 9, fontWeight: '900' },
  reviewLineVerdict: { color: colors.sandstone, fontSize: 9, fontWeight: '700', marginTop: 4 },
  reviewLoadingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 9 },
  reviewLoadingCopy: { flex: 1 },
  reviewMuted: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 3 },
  reviewRetry: { borderColor: 'rgba(115, 220, 224, 0.55)', borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  reviewRetryText: { color: '#d7fffb', fontSize: 11, fontWeight: '900' },
  engineToggleGroup: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6 },
  engineLabel: { color: colors.goldLight, fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  compactSelector: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 3, minHeight: 34, paddingHorizontal: 7 },
  compactSelectorLabel: { color: colors.sandstone, fontSize: 8, fontWeight: '800' },
  compactSelectorValue: { color: colors.goldLight, fontFamily: 'serif', fontSize: 13, fontWeight: '900' },
  lineSelector: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 36, paddingHorizontal: 10 },
  lineSelectorLabel: { color: colors.sandstone, fontSize: 10, fontWeight: '800' },
  lineSelectorValue: { color: colors.goldLight, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  engineStatus: { color: colors.muted, fontSize: 10, lineHeight: 18, paddingHorizontal: 4, paddingVertical: 10 },
  engineResults: { overflow: 'hidden' },
  engineLineRow: { borderBottomColor: 'rgba(211, 165, 55, 0.22)', borderBottomWidth: 1, paddingHorizontal: 4, paddingVertical: 8 },
  engineLineHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  engineLineLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  engineScore: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 10, fontWeight: '800' },
  engineLine: { color: colors.cream, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, marginTop: 3 },
  engineLineEvaluation: { color: colors.goldLight, fontWeight: '900' },
  engineVerdict: { color: colors.muted, fontSize: 9, fontWeight: '700', marginTop: 2 },
  sectionLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  notation: { color: colors.cream, fontFamily: 'monospace', fontSize: 11, lineHeight: 18, marginTop: 7 },
  notationTable: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 7 },
  notationCluster: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  notationMove: { borderColor: 'transparent', borderRadius: 5, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 3 },
  notationMoveSelected: { backgroundColor: 'rgba(211, 165, 55, 0.25)', borderColor: colors.gold },
  notationMoveText: { color: colors.cream, fontFamily: 'monospace', fontSize: 11, fontWeight: '700' },
  notationMoveTextSelected: { color: colors.goldLight },
  variationGroup: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  variationBracket: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 11 },
  variationMove: { backgroundColor: 'rgba(211, 165, 55, 0.06)' },
  variationMoveText: { color: colors.sandstone, fontSize: 10 },
  importedVariationNote: { color: colors.muted, fontFamily: 'monospace', fontSize: 9, lineHeight: 14, marginTop: 8 },
  error: { color: '#fecdd3', fontSize: 10, lineHeight: 15, marginTop: 7 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.82)', flex: 1, justifyContent: 'center', padding: 24 },
  menuPanel: { backgroundColor: '#111a21', borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1.5, maxWidth: 420, padding: 20, width: '100%' },
  modalEyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  menuTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 23, fontWeight: '900', marginBottom: 14, marginTop: 3 },
  actionMenuItem: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.9)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 8, minHeight: 58, paddingHorizontal: 12 },
  actionMenuIcon: { alignItems: 'center', backgroundColor: 'rgba(211, 165, 55, 0.12)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  actionMenuLabel: { color: colors.cream, flex: 1, fontFamily: 'serif', fontSize: 15, fontWeight: '800' },
  moveActionDisabled: { opacity: 0.35 },
  modalCancelButton: { alignSelf: 'center', borderBottomColor: colors.goldLight, borderBottomWidth: 1.5, marginTop: 18, paddingBottom: 3, paddingHorizontal: 6 },
  modalCancelText: { color: colors.goldLight, fontSize: 13, fontWeight: '800' },
  linePickerPanel: { backgroundColor: '#111a21', borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1.5, maxWidth: 360, padding: 20, width: '100%' },
  lineOptions: { flexDirection: 'row', gap: 8 },
  depthOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  depthOption: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.9)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, height: 46, justifyContent: 'center', width: '22%' },
  lineOption: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.9)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, flex: 1, height: 48, justifyContent: 'center' },
  lineOptionSelected: { backgroundColor: colors.goldLight, borderColor: '#fff1b8' },
  lineOptionText: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900' },
  lineOptionTextSelected: { color: '#2e1b0e' },
  loadPanel: { backgroundColor: '#111a21', borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1.5, maxHeight: '86%', maxWidth: 520, padding: 20, width: '100%' },
  formatTabs: { backgroundColor: 'rgba(8, 15, 21, 0.9)', borderRadius: 9, flexDirection: 'row', padding: 3 },
  formatTab: { alignItems: 'center', borderRadius: 7, flex: 1, minHeight: 38, justifyContent: 'center' },
  formatTabSelected: { backgroundColor: colors.goldLight },
  formatTabText: { color: colors.sandstone, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  formatTabTextSelected: { color: '#2e1b0e' },
  inputInstruction: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 12 },
  positionInput: { backgroundColor: 'rgba(238, 224, 191, 0.97)', borderColor: colors.goldDark, borderRadius: 9, borderWidth: 1, color: '#15100c', fontFamily: 'monospace', fontSize: 10, lineHeight: 15, marginTop: 8, minHeight: 150, padding: 10 },
  loadActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  secondaryButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 18 },
  secondaryButtonText: { color: colors.sandstone, fontSize: 12, fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.goldLight, borderColor: '#fff1b8', borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 42, minWidth: 96, paddingHorizontal: 18 },
  primaryButtonText: { color: '#2e1b0e', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  promotionPanel: { alignItems: 'center', backgroundColor: '#111a21', borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1.5, maxWidth: 420, padding: 22, width: '100%' },
  promotionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900' },
  promotionRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  promotionChoice: { alignItems: 'center', backgroundColor: '#f0dfb8', borderColor: colors.gold, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 68 },
  promotionPiece: { height: 58, width: 58 },
  cancelPromotion: { borderBottomColor: colors.goldLight, borderBottomWidth: 1, marginTop: 20, paddingBottom: 2 },
  cancelPromotionText: { color: colors.goldLight, fontSize: 14, fontWeight: '800' },
});
