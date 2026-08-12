import { Chess, type Square } from 'chess.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChessThemePicker } from '@/components/chess-theme-picker';
import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
import { NativeChessBoard } from '@/components/native-chess-board';
import { PlayScreenHeader } from '@/components/play-screen-header';
import {
  DEFAULT_BOARD_THEME,
  DEFAULT_PIECE_THEME,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { colors } from '@/constants/colors';
import { loadChessPreferences, saveChessPreferences } from '@/lib/chess-preferences';
import { analyzePosition } from '@/lib/position-analysis';
import {
  fetchMyPuzzleRating,
  fetchNextPuzzle,
  submitPuzzleAttempt,
  submitPuzzleReaction,
  type PlayerPuzzleRating,
  type PuzzleDetail,
  type PuzzleDifficultyMode,
} from '@/lib/puzzles';
import { restoreSession } from '@/lib/session';

type SolutionNode = { children: SolutionNode[]; move?: string };
type PickerKind = 'category' | 'difficulty' | null;

const difficulties: PuzzleDifficultyMode[] = ['ANY', 'EASY', 'NORMAL', 'HARD', 'HARDEST', 'PROGRESSIVE'];
const categories = [
  'RANDOM',
  'CHECK',
  'CAPTURE',
  'THREAT',
  'PAWN_MOVE',
  'MATE',
  'BACK_RANK_MATE',
  'DOUBLE_ATTACK',
  'PIN',
  'X_RAY',
  'WINNING_MATERIAL',
  'FAVOURABLE_EXCHANGE',
  'OUTPOST',
  'PLAY_ON_7TH_RANK',
  'ISOLATED_PAWN_STRUCTURE',
  'ENDGAME',
];

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeUci(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function isUci(value?: string) {
  return Boolean(value && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value));
}

function normalizeSolutionRoot(raw: unknown): SolutionNode {
  if (!raw || typeof raw !== 'object') return { children: [] };
  const value = raw as { branches?: unknown; children?: unknown; move?: unknown; root?: unknown };
  if (value.root) return normalizeSolutionRoot(value.root);
  const children = Array.isArray(value.children)
    ? value.children
    : Array.isArray(value.branches)
      ? value.branches
      : [];
  return {
    move: typeof value.move === 'string' ? normalizeUci(value.move) : undefined,
    children: children
      .map(normalizeSolutionRoot)
      .filter((node) => isUci(node.move)),
  };
}

function lineToTree(moves: string[]) {
  const root: SolutionNode = { children: [] };
  let node = root;
  moves.forEach((move) => {
    const child: SolutionNode = { children: [], move };
    node.children = [child];
    node = child;
  });
  return root;
}

function parseTreeLine(raw?: string) {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as { moves?: unknown };
    const root = normalizeSolutionRoot(parsed);
    const result: string[] = [];
    let node = root;
    while (node.children.length) {
      const next = node.children[0];
      if (!next.move) break;
      result.push(next.move);
      node = next;
    }
    if (result.length) return result;
    if (Array.isArray(parsed.moves)) {
      return parsed.moves.map((move) => normalizeUci(String(move ?? ''))).filter(isUci);
    }
  } catch {
    return [];
  }
  return [];
}

function parseSolutionTree(puzzle: PuzzleDetail | null) {
  if (!puzzle) return { children: [] };
  if (puzzle.solutionTreeJson?.trim()) {
    try {
      const root = normalizeSolutionRoot(JSON.parse(puzzle.solutionTreeJson));
      if (root.children.length) return root;
    } catch {
      // Fall back to a linear solution.
    }
  }
  const treeMoves = parseTreeLine(puzzle.solutionTreeJson);
  if (treeMoves.length) return lineToTree(treeMoves);
  const pvMoves = puzzle.principalVariation
    .split(/\s+/)
    .map((move) => normalizeUci(move.replace(/[!?+#]+$/g, '')))
    .filter(isUci);
  return lineToTree(pvMoves.length ? pvMoves : [normalizeUci(puzzle.solutionUci)].filter(isUci));
}

function findNodeByPath(root: SolutionNode, path: string[]) {
  let node = root;
  path.forEach((move) => {
    node = node.children.find((child) => child.move === move) ?? node;
  });
  return node;
}

function sideLabel(side?: string) {
  return side === 'b' || side === 'BLACK' ? 'Black' : 'White';
}

function sideColor(side?: string) {
  return side === 'b' || side === 'BLACK' ? 'b' : 'w';
}

function pieceName(type?: string) {
  return ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as Record<string, string>)[type ?? ''] ?? 'piece';
}

export default function PuzzlesScreen() {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 24, 520);
  const accessTokenRef = useRef<string | undefined>(undefined);
  const engineSequenceRef = useRef(0);
  const seenPuzzleIdsRef = useRef<number[]>([]);
  const [difficulty, setDifficulty] = useState<PuzzleDifficultyMode>('ANY');
  const [category, setCategory] = useState('RANDOM');
  const [selected, setSelected] = useState<PuzzleDetail | null>(null);
  const [rating, setRating] = useState<PlayerPuzzleRating | null>(null);
  const [boardFen, setBoardFen] = useState('');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [solutionPath, setSolutionPath] = useState<string[]>([]);
  const [firstSubmittedMove, setFirstSubmittedMove] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [attemptFinished, setAttemptFinished] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(false);
  const [failedSolution, setFailedSolution] = useState<{ san: string; uci: string } | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [puzzleSettingsOpen, setPuzzleSettingsOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [engineMoves, setEngineMoves] = useState<string[]>([]);

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
    return () => { active = false; };
  }, []);

  useEffect(() => {
    void fetchMyPuzzleRating().then(setRating).catch(() => setRating(null));
  }, []);

  useEffect(() => {
    let active = true;
    void fetchNextPuzzle({
      category,
      difficulty,
      excludePuzzleIds: seenPuzzleIdsRef.current,
    })
      .then((detail) => {
        if (!active) return;
        selectPuzzle(detail);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSelected(null);
        setLoadError(error instanceof Error ? error.message : 'Unable to load puzzles.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, difficulty]);

  function selectPuzzle(puzzle: PuzzleDetail | null) {
    if (puzzle && puzzle.id > 0 && !seenPuzzleIdsRef.current.includes(puzzle.id)) {
      seenPuzzleIdsRef.current = [...seenPuzzleIdsRef.current, puzzle.id].slice(-50);
    }
    setSelected(puzzle);
    setBoardFen(puzzle?.fen ?? '');
    setSelectedSquare(null);
    setLastMove(null);
    setSolutionPath([]);
    setBoardFlipped(false);
    setFirstSubmittedMove('');
    setAttemptCount(0);
    setAttemptFinished(false);
    setFailedAttempt(false);
    setFailedSolution(null);
    setHintShown(false);
    setSolutionRevealed(false);
    setSolved(false);
    setSubmitting(false);
    setFeedback(null);
  }

  useEffect(() => {
    const sequence = ++engineSequenceRef.current;
    if (!selected || !boardFen || submitting || solved || solutionRevealed || !accessTokenRef.current) {
      setEngineMoves([]);
      return;
    }
    void analyzePosition(boardFen, 12, accessTokenRef.current, 3)
      .then((analysis) => {
        if (engineSequenceRef.current !== sequence) return;
        const lines = analysis.lines?.length ? analysis.lines : [analysis];
        setEngineMoves(lines.map((line) => normalizeUci(line.bestMove ?? line.principalVariation?.split(/\s+/)[0])).filter(isUci));
      })
      .catch(() => { if (engineSequenceRef.current === sequence) setEngineMoves([]); });
  }, [boardFen, selected, solutionRevealed, solved, submitting]);

  const game = useMemo(() => {
    if (!boardFen) return null;
    try { return new Chess(boardFen); } catch { return null; }
  }, [boardFen]);
  const solutionTree = useMemo(() => parseSolutionTree(selected), [selected]);
  const solutionNode = useMemo(() => findNodeByPath(solutionTree, solutionPath), [solutionPath, solutionTree]);
  const legalTargets = useMemo(() => {
    if (!game || !selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true }).map((move) => move.to);
  }, [game, selectedSquare]);
  const puzzleOrientation = sideColor(selected?.sideToMove) === 'b' ? 'black' : 'white';
  const orientation = boardFlipped
    ? puzzleOrientation === 'white' ? 'black' : 'white'
    : puzzleOrientation;
  function resetPuzzle() {
    if (!selected) return;
    setBoardFen(selected.fen);
    setSelectedSquare(null);
    setLastMove(null);
    setSolutionPath([]);
    setFirstSubmittedMove('');
    setSolved(false);
    setAttemptFinished(false);
    setFailedAttempt(false);
    setHintShown(false);
    setFailedSolution(null);
    setSolutionRevealed(false);
    setFeedback(`${sideLabel(selected.sideToMove)} to move. Puzzle reset.`);
  }

  async function finishAttempt(resultOverride: boolean | null, submittedMove: string, customFeedback?: string) {
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await submitPuzzleAttempt(selected.id, {
        submittedMoveUci: submittedMove,
        firstAttempt: attemptCount === 0,
        ...(resultOverride === null ? {} : { solved: resultOverride }),
      });
      setAttemptCount((value) => value + 1);
      setRating({
        attemptsCount: (rating?.attemptsCount ?? 0) + 1,
        bestStreak: result.bestStreak,
        currentStreak: result.currentStreak,
        rating: result.playerRatingAfter,
        solvedCount: (rating?.solvedCount ?? 0) + (result.solved ? 1 : 0),
      });
      setSolved(result.solved);
      setAttemptFinished(true);
      setFailedAttempt(!result.solved);
      setFailedSolution(result.solved ? null : { san: result.solutionSan, uci: result.solutionUci });
      setFeedback(customFeedback ?? (result.ratedAsCorrect
        ? 'Correct on the first attempt.'
        : result.solved ? 'Puzzle solved.' : 'Not quite. Try a hint, reset the board, or view the solution.'));
    } catch {
      setBoardFen(selected.fen);
      setLastMove(null);
      setFeedback('Unable to submit this move. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBoardMove(from: Square, to: Square) {
    if (!selected || !game || submitting || attemptFinished || solutionRevealed) return;
    const next = new Chess(boardFen);
    let applied;
    try { applied = next.move({ from, to, promotion: 'q' }); } catch { applied = null; }
    if (!applied) {
      setSelectedSquare(null);
      setFeedback('That move is not legal in this position.');
      return;
    }
    const submittedMove = `${applied.from}${applied.to}${applied.promotion ?? ''}`.toLowerCase();
    const firstMove = firstSubmittedMove || submittedMove;
    const matchingBranch = solutionNode.children.find((child) => child.move === submittedMove);
    const hasStoredBranches = solutionNode.children.length > 0;
    const engineAccepts = hasStoredBranches && !matchingBranch && engineMoves.includes(submittedMove);
    setBoardFen(next.fen());
    setLastMove({ from: applied.from, to: applied.to });
    setSelectedSquare(null);
    setFirstSubmittedMove(firstMove);

    if (!hasStoredBranches) {
      setFeedback('Submitted. Checking the solution...');
      await finishAttempt(null, firstMove);
      return;
    }
    if (!matchingBranch && !engineAccepts) {
      setFeedback('That move is not part of the solution line.');
      await finishAttempt(false, firstMove);
      return;
    }
    if (engineAccepts) {
      await finishAttempt(true, firstMove, 'Engine accepts this move. Puzzle solved through an alternate line.');
      return;
    }

    let nextNode = matchingBranch;
    const nextPath = [submittedMove];
    const studentTurn = sideColor(selected.sideToMove);
    while (nextNode?.children.length && next.turn() !== studentTurn) {
      const replyNode = nextNode.children[Math.floor(Math.random() * nextNode.children.length)];
      const reply = normalizeUci(replyNode.move);
      if (!isUci(reply)) break;
      let replyMove;
      try {
        replyMove = next.move({
          from: reply.slice(0, 2) as Square,
          to: reply.slice(2, 4) as Square,
          promotion: reply.slice(4, 5) || 'q',
        });
      } catch { replyMove = null; }
      if (!replyMove) break;
      setLastMove({ from: replyMove.from, to: replyMove.to });
      nextPath.push(reply);
      nextNode = replyNode;
    }
    setBoardFen(next.fen());
    setSolutionPath((path) => [...path, ...nextPath]);
    if (!nextNode?.children.length) {
      await finishAttempt(true, firstMove);
      return;
    }
    setFeedback('Correct. Continue with the next move.');
  }

  function handleSquare(square: string) {
    if (!game || submitting || attemptFinished || solved || solutionRevealed) return;
    const target = square as Square;
    const piece = game.get(target);
    if (!selectedSquare) {
      if (piece?.color === game.turn()) setSelectedSquare(target);
      return;
    }
    if (selectedSquare === target) {
      setSelectedSquare(null);
      return;
    }
    const selectedPiece = game.get(selectedSquare);
    if (piece && selectedPiece && piece.color === selectedPiece.color) {
      setSelectedSquare(target);
      return;
    }
    void submitBoardMove(selectedSquare, target);
  }

  function showHint() {
    if (!selected) return;
    const solution = normalizeUci(failedSolution?.uci || selected.solutionUci);
    if (!isUci(solution)) {
      setFeedback('Hint: look for the move that changes the evaluation immediately.');
    } else {
      const start = new Chess(selected.fen);
      const piece = start.get(solution.slice(0, 2) as Square);
      setFeedback(`Hint: start by looking at the ${pieceName(piece?.type)} on ${solution.slice(0, 2)}.`);
    }
    setHintShown(true);
  }

  function showSolution() {
    if (!selected) return;
    const solution = failedSolution ?? { san: selected.solutionSan, uci: selected.solutionUci };
    const uci = normalizeUci(solution.uci);
    setSelectedSquare(null);
    setSolutionRevealed(true);
    if (isUci(uci)) {
      const solutionGame = new Chess(selected.fen);
      try {
        const move = solutionGame.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.slice(4, 5) || 'q',
        });
        if (move) {
          setBoardFen(solutionGame.fen());
          setLastMove({ from: move.from, to: move.to });
        }
      } catch {
        setBoardFen(selected.fen);
        setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      }
    }
    setFeedback(`Not the solution. Correct move: ${solution.san || solution.uci}.`);
  }

  async function nextPuzzle() {
    setSubmitting(true);
    try {
      const next = await fetchNextPuzzle({
        category,
        difficulty,
        excludePuzzleIds: seenPuzzleIdsRef.current,
      });
      selectPuzzle(next);
    } catch {
      setFeedback('Unable to load the next puzzle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function reactAndNext(reaction: 'LIKE' | 'DISLIKE') {
    if (!selected) return;
    try {
      const result = await submitPuzzleReaction(selected.id, reaction);
      setSelected({ ...selected, ...result });
    } finally {
      await nextPuzzle();
    }
  }

  function changeBoardTheme(next: BoardThemeName) {
    setBoardTheme(next);
    void saveChessPreferences({ boardTheme: next, pieceTheme }, accessTokenRef.current);
  }

  function changePieceTheme(next: PieceThemeName) {
    setPieceTheme(next);
    void saveChessPreferences({ boardTheme, pieceTheme: next }, accessTokenRef.current);
  }

  const pickerOptions = picker === 'category' ? categories : difficulties;
  const selectedPickerValue = picker === 'category' ? category : difficulty;

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Puzzles" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.stateText}>Loading puzzles...</Text>
            </View>
          ) : selected && game ? (
            <>
              <View style={styles.boardToolbar}>
                <View style={styles.boardHeading}>
                  <Text style={styles.turnLabel}>{sideLabel(selected.sideToMove).toUpperCase()} TO MOVE</Text>
                  <Text numberOfLines={1} style={styles.boardTitle}>Find the best move</Text>
                </View>
                <View style={styles.boardToolbarActions}>
                  <Pressable onPress={() => setActionMenuOpen(true)} style={styles.themeButton}>
                    <SymbolView name={{ android: 'menu', ios: 'ellipsis.circle.fill', web: 'menu' }} size={18} tintColor={colors.goldLight} />
                    <Text style={styles.themeButtonText}>OPTIONS</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.boardWrap}>
                <NativeChessBoard
                  boardTheme={boardTheme}
                  getPiece={(square) => game.get(square as Square) ?? undefined}
                  lastMove={lastMove}
                  legalTargets={legalTargets}
                  onSquarePress={handleSquare}
                  orientation={orientation}
                  pieceTheme={pieceTheme}
                  selectedSquare={selectedSquare}
                  size={boardSize}
                />
                {submitting ? <View style={styles.boardBusy}><ActivityIndicator color={colors.goldLight} /></View> : null}
              </View>

              <View style={styles.puzzlePanel}>
                <RoyalCorners />
                <View style={styles.metrics}>
                  <Metric label="MOVE" value={sideLabel(selected.sideToMove)} />
                  <Metric label="LEVEL" value={titleCase(selected.difficulty)} />
                  <Metric label="RATING" value={String(selected.rating)} />
                  <Metric label="TRIES" value={String(attemptCount)} />
                </View>

                <View style={styles.actionHeader}>
                  <Text style={styles.sectionTitle}>SOLVE ON THE BOARD</Text>
                  <View style={styles.actionHeaderButtons}>
                    <SmallButton
                      label="RESET"
                      onPress={resetPuzzle}
                      symbol={{ android: 'refresh', ios: 'arrow.clockwise', web: 'refresh' }}
                    />
                    {attemptFinished ? (
                      <SmallButton
                        label="NEXT"
                        onPress={() => void nextPuzzle()}
                        symbol={{ android: 'arrow_forward', ios: 'arrow.right', web: 'arrow_forward' }}
                      />
                    ) : null}
                  </View>
                </View>
                {!attemptFinished ? <Text style={styles.instructions}>Tap a piece, then its destination. Correct moves advance automatically.</Text> : null}
                {feedback ? (
                  <View style={[styles.feedback, solved && styles.feedbackSolved]}>
                    <SymbolView
                      name={solved
                        ? { android: 'check_circle', ios: 'checkmark.circle.fill', web: 'check_circle' }
                        : { android: 'info', ios: 'info.circle.fill', web: 'info' }}
                      size={19}
                      tintColor={solved ? '#7ee0a1' : colors.goldLight}
                    />
                    <Text style={styles.feedbackText}>{feedback}</Text>
                  </View>
                ) : null}
                {failedAttempt && !solutionRevealed ? (
                  <View style={styles.tripleActions}>
                    <RoyalButton
                      disabled={hintShown}
                      label="HINT"
                      onPress={showHint}
                      symbol={{ android: 'lightbulb', ios: 'lightbulb.fill', web: 'lightbulb' }}
                    />
                    <RoyalButton
                      label="SOLUTION"
                      onPress={showSolution}
                      symbol={{ android: 'visibility', ios: 'eye.fill', web: 'visibility' }}
                    />
                    <RoyalButton
                      label="ANALYZE"
                      onPress={() => router.push({ pathname: '/learn/analysis', params: { fen: selected.fen } } as Href)}
                      symbol={{ android: 'query_stats', ios: 'chart.bar.xaxis', web: 'query_stats' }}
                    />
                  </View>
                ) : null}
                {attemptFinished ? (
                  <View style={styles.reactionActions}>
                    <RoyalButton
                      label="LIKE"
                      onPress={() => void reactAndNext('LIKE')}
                      symbol={{ android: 'thumb_up', ios: 'hand.thumbsup.fill', web: 'thumb_up' }}
                    />
                    <RoyalButton
                      label="DISLIKE"
                      onPress={() => void reactAndNext('DISLIKE')}
                      symbol={{ android: 'thumb_down', ios: 'hand.thumbsdown.fill', web: 'thumb_down' }}
                    />
                  </View>
                ) : null}

                <View style={styles.ratingPanel}>
                  <View style={styles.ratingTop}>
                    <Text style={styles.ratingLabel}>YOUR PUZZLE RATING</Text>
                    <Text style={styles.ratingValue}>{rating?.rating ?? 1200}</Text>
                  </View>
                  <View style={styles.ratingMetrics}>
                    <Metric label="SOLVED" value={String(rating?.solvedCount ?? 0)} />
                    <Metric label="STREAK" value={String(rating?.currentStreak ?? 0)} />
                    <Metric label="BEST" value={String(rating?.bestStreak ?? 0)} />
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.source}>Source: {selected.sourceLabel || 'TWIC game'}</Text>
                <Text style={styles.source}>{selected.likeCount ?? 0} likes · {selected.dislikeCount ?? 0} dislikes</Text>
              </View>
            </>
          ) : (
            <View style={styles.statePanel}>
              <Text style={styles.stateTitle}>{loadError ? 'The puzzle chamber is unavailable' : 'No puzzles found'}</Text>
              <Text style={styles.stateText}>{loadError ?? 'No beta puzzles have been generated for these filters yet.'}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal animationType="fade" onRequestClose={() => setActionMenuOpen(false)} transparent visible={actionMenuOpen}>
        <Pressable onPress={() => setActionMenuOpen(false)} style={styles.modalBackdrop}>
          <Pressable style={styles.actionMenuPanel}>
            <Text style={styles.modalEyebrow}>PUZZLES</Text>
            <Text style={styles.menuTitle}>Options</Text>
            <ActionMenuItem
              icon={{ android: 'tune', ios: 'slider.horizontal.3', web: 'tune' }}
              label="Puzzle Settings"
              onPress={() => {
                setActionMenuOpen(false);
                setPuzzleSettingsOpen(true);
              }}
            />
            <ActionMenuItem
              icon={{ android: 'palette', ios: 'paintpalette.fill', web: 'palette' }}
              label="Theme"
              onPress={() => {
                setActionMenuOpen(false);
                setThemePickerOpen(true);
              }}
            />
            <ActionMenuItem
              icon={{ android: 'swap_vert', ios: 'arrow.up.arrow.down', web: 'swap_vert' }}
              label="Flip Board"
              onPress={() => {
                setBoardFlipped((value) => !value);
                setActionMenuOpen(false);
              }}
            />
            <Pressable onPress={() => setActionMenuOpen(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setPuzzleSettingsOpen(false)} transparent visible={puzzleSettingsOpen}>
        <Pressable onPress={() => setPuzzleSettingsOpen(false)} style={styles.modalBackdrop}>
          <Pressable style={styles.actionMenuPanel}>
            <Text style={styles.modalEyebrow}>PUZZLE SELECTION</Text>
            <Text style={styles.menuTitle}>Puzzle Settings</Text>
            <Text style={styles.settingsDescription}>Choose which tactical positions should appear.</Text>
            <View style={styles.settingsFields}>
              <FilterButton
                label="CATEGORY"
                onPress={() => {
                  setPuzzleSettingsOpen(false);
                  setPicker('category');
                }}
                value={titleCase(category)}
              />
              <FilterButton
                label="DIFFICULTY"
                onPress={() => {
                  setPuzzleSettingsOpen(false);
                  setPicker('difficulty');
                }}
                value={titleCase(difficulty)}
              />
            </View>
            <Pressable onPress={() => setPuzzleSettingsOpen(false)} style={styles.modalCancelButton}>
              <Text style={styles.modalCancelText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setPicker(null)} transparent visible={picker !== null}>
        <Pressable onPress={() => setPicker(null)} style={styles.modalBackdrop}>
          <Pressable style={styles.pickerPanel}>
            <Text style={styles.pickerTitle}>Choose {picker === 'category' ? 'Category' : 'Difficulty'}</Text>
            <ScrollView style={styles.pickerScroll}>
              {pickerOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (selectedPickerValue === option) {
                      setPicker(null);
                      return;
                    }
                    setLoading(true);
                    setLoadError(null);
                    if (picker === 'category') setCategory(option);
                    else setDifficulty(option as PuzzleDifficultyMode);
                    setPicker(null);
                  }}
                  style={[styles.pickerOption, selectedPickerValue === option && styles.pickerOptionSelected]}>
                  <Text style={[styles.pickerOptionText, selectedPickerValue === option && styles.pickerOptionTextSelected]}>{titleCase(option)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
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

function ActionMenuItem({
  icon,
  label,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionMenuItem, pressed && styles.pressed]}>
      <View style={styles.actionMenuIcon}>
        <SymbolView name={icon} size={21} tintColor={colors.goldLight} />
      </View>
      <Text style={styles.actionMenuLabel}>{label}</Text>
      <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={18} tintColor={colors.gold} />
    </Pressable>
  );
}

function FilterButton({ label, onPress, value }: { label: string; onPress: () => void; value: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.filterValueRow}>
        <Text numberOfLines={1} style={styles.filterValue}>{value}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </View>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SmallButton({ label, onPress, symbol }: { label: string; onPress: () => void; symbol: SymbolViewProps['name'] }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
      <SymbolView name={symbol} size={14} tintColor={colors.goldLight} />
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

function RoyalButton({ disabled = false, label, onPress, symbol }: { disabled?: boolean; label: string; onPress: () => void; symbol: SymbolViewProps['name'] }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.royalButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <SymbolView name={symbol} size={17} tintColor={colors.goldLight} />
      <Text style={styles.royalButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingBottom: 34, paddingHorizontal: 12 },
  filterButton: { backgroundColor: '#0b1722', borderColor: 'rgba(218, 173, 82, 0.45)', borderRadius: 9, borderWidth: 1, flex: 1, minWidth: 0, paddingHorizontal: 10, paddingVertical: 8 },
  filterLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  filterValueRow: { alignItems: 'center', flexDirection: 'row', marginTop: 3 },
  filterValue: { color: colors.cream, flex: 1, fontSize: 12, fontWeight: '800' },
  chevron: { color: colors.goldLight, fontSize: 16 },
  statePanel: { alignItems: 'center', backgroundColor: 'rgba(7, 17, 27, 0.92)', borderColor: colors.goldDark, borderRadius: 15, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 230, padding: 24 },
  stateTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center' },
  boardToolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 17, paddingHorizontal: 3 },
  boardHeading: { flex: 1, minWidth: 0, paddingRight: 8 },
  turnLabel: { color: colors.saffron, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  boardTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 13, fontWeight: '800', marginTop: 2 },
  boardToolbarActions: { flexDirection: 'row', gap: 6 },
  themeButton: { alignItems: 'center', backgroundColor: 'rgba(7, 17, 27, 0.94)', borderColor: colors.gold, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  themeButtonText: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  boardWrap: { alignItems: 'center', marginTop: 9, position: 'relative' },
  boardBusy: { alignItems: 'center', backgroundColor: 'rgba(3, 7, 11, 0.38)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  puzzlePanel: { backgroundColor: 'rgba(7, 17, 27, 0.95)', borderColor: colors.goldDark, borderRadius: 15, borderWidth: 1.5, marginTop: 14, overflow: 'hidden', padding: 15 },
  metrics: { backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.09)', borderRadius: 9, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10 },
  metric: { flex: 1, minWidth: 0, paddingHorizontal: 3 },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  metricValue: { color: colors.cream, fontSize: 12, fontWeight: '900', marginTop: 3 },
  actionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  sectionTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  actionHeaderButtons: { flexDirection: 'row', gap: 6 },
  smallButton: { alignItems: 'center', borderColor: colors.goldDark, borderRadius: 7, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  smallButtonText: { color: colors.goldLight, fontSize: 8, fontWeight: '900' },
  instructions: { color: colors.sandstone, fontSize: 11, lineHeight: 16, marginTop: 9 },
  feedback: { alignItems: 'flex-start', backgroundColor: 'rgba(165, 107, 24, 0.12)', borderColor: 'rgba(225, 184, 99, 0.28)', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 11, padding: 10 },
  feedbackSolved: { backgroundColor: 'rgba(34, 128, 76, 0.13)', borderColor: 'rgba(92, 207, 139, 0.32)' },
  feedbackText: { color: colors.cream, flex: 1, fontSize: 11, lineHeight: 16 },
  tripleActions: { flexDirection: 'row', gap: 6, marginTop: 11 },
  reactionActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  royalButton: { alignItems: 'center', backgroundColor: '#101a22', borderColor: colors.goldDark, borderRadius: 8, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 39, paddingHorizontal: 5 },
  royalButtonText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.3 },
  disabled: { opacity: 0.42 },
  ratingPanel: { backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.09)', borderRadius: 9, borderWidth: 1, marginTop: 15, padding: 11 },
  ratingTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  ratingLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  ratingValue: { color: colors.goldLight, fontFamily: 'serif', fontSize: 25, fontWeight: '900' },
  ratingMetrics: { flexDirection: 'row', marginTop: 5 },
  source: { color: colors.muted, fontSize: 9, marginTop: 7 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 22 },
  actionMenuPanel: { backgroundColor: '#07131f', borderColor: colors.gold, borderRadius: 15, borderWidth: 1.5, padding: 16, width: '100%' },
  modalEyebrow: { color: colors.saffron, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  menuTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 24, fontWeight: '900', marginBottom: 13, marginTop: 3, textAlign: 'center' },
  actionMenuItem: { alignItems: 'center', backgroundColor: '#0b1925', borderColor: 'rgba(218, 173, 82, 0.35)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 8, minHeight: 56, paddingHorizontal: 11 },
  actionMenuIcon: { alignItems: 'center', backgroundColor: 'rgba(218, 173, 82, 0.1)', borderColor: colors.goldDark, borderRadius: 8, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  actionMenuLabel: { color: colors.cream, flex: 1, fontFamily: 'serif', fontSize: 16, fontWeight: '900', marginLeft: 11 },
  modalCancelButton: { alignItems: 'center', borderColor: colors.goldDark, borderRadius: 9, borderWidth: 1, marginTop: 15, paddingVertical: 10 },
  modalCancelText: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  settingsDescription: { color: colors.sandstone, fontSize: 11, lineHeight: 16, marginBottom: 13, marginTop: -5, textAlign: 'center' },
  settingsFields: { gap: 10 },
  pickerPanel: { backgroundColor: '#07131f', borderColor: colors.gold, borderRadius: 15, borderWidth: 1.5, maxHeight: '72%', padding: 15, width: '100%' },
  pickerTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
  pickerScroll: { flexGrow: 0 },
  pickerOption: { borderBottomColor: 'rgba(225, 184, 99, 0.16)', borderBottomWidth: 1, paddingHorizontal: 10, paddingVertical: 13 },
  pickerOptionSelected: { backgroundColor: 'rgba(225, 184, 99, 0.13)', borderRadius: 7 },
  pickerOptionText: { color: colors.cream, fontSize: 13, fontWeight: '700' },
  pickerOptionTextSelected: { color: colors.goldLight },
  pressed: { opacity: 0.72 },
});
