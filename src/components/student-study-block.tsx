import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { NativeChessBoard, type BoardPiece } from '@/components/native-chess-board';
import { RoyalCorners } from '@/components/civ-ornament';
import { colors } from '@/constants/colors';
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_THEME, type BoardThemeName, type PieceThemeName } from '@/constants/chess-themes';
import { academyAssetSource, type AcademyStudyContext, type StudentStudyBlock } from '@/lib/academy-study';
import { getStoredChessPreferences } from '@/lib/chess-preferences';

type Props = {
  assistanceDisabled?: boolean;
  block: StudentStudyBlock;
  context: AcademyStudyContext;
  onCompletionChange: (complete: boolean) => void;
  onLiveStateChange?: (state: StudentStudyLiveState) => void;
};

export type StudentStudyLiveState = {
  attemptCount: number;
  currentFen?: string | null;
  lastMove?: string | null;
  solutionUsed: boolean;
  state: 'FAILED' | 'IN_PROGRESS' | 'SOLVED';
};

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function safeChess(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function parseSolution(value: string) {
  return value.toLowerCase().match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g) ?? [];
}

function pieceType(piece: string): BoardPiece['type'] {
  return piece === 'knight' ? 'n' : piece.charAt(0) as BoardPiece['type'];
}

function squareAt(file: number, rank: number) {
  return file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? `${files[file]}${rank}` : null;
}

function legalPieceSquares(piece: string, start: string) {
  const file = files.indexOf(start.charAt(0));
  const rank = Number(start.charAt(1));
  const squares: string[] = [];
  const add = (nextFile: number, nextRank: number) => {
    const square = squareAt(nextFile, nextRank);
    if (square) squares.push(square);
  };
  const rays = (directions: [number, number][]) => directions.forEach(([dx, dy]) => {
    for (let distance = 1; distance < 8; distance += 1) add(file + dx * distance, rank + dy * distance);
  });

  if (piece === 'rook' || piece === 'queen') rays([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  if (piece === 'bishop' || piece === 'queen') rays([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  if (piece === 'knight') [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].forEach(([dx, dy]) => add(file + dx, rank + dy));
  if (piece === 'king') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dx, dy]) => add(file + dx, rank + dy));
  if (piece === 'pawn') {
    add(file, rank + 1);
    if (rank === 2) add(file, rank + 2);
  }
  return [...new Set(squares)];
}

function randomStartSquare(piece: string, previous?: string) {
  const candidates: string[] = [];
  for (let rank = piece === 'pawn' ? 2 : 1; rank <= (piece === 'pawn' ? 6 : 8); rank += 1) {
    for (const file of files) {
      const square = `${file}${rank}`;
      if (square !== previous && legalPieceSquares(piece, square).length) candidates.push(square);
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] || 'd4';
}

function StaticBlock({ block, onCompletionChange }: Pick<Props, 'block' | 'onCompletionChange'>) {
  useEffect(() => onCompletionChange(true), [onCompletionChange]);
  return (
    <View style={styles.blockPanel}>
      <RoyalCorners />
      <Text style={styles.blockEyebrow}>STUDY NOTE</Text>
      <Text style={styles.blockTitle}>{block.title || 'Lesson Note'}</Text>
      <Text style={styles.memoText}>{block.content || 'No content was added for this block yet.'}</Text>
    </View>
  );
}

function VideoBlock({ block, onCompletionChange }: Pick<Props, 'block' | 'onCompletionChange'>) {
  const url = block.content?.trim();
  const validUrl = /^https?:\/\//i.test(url || '');
  useEffect(() => onCompletionChange(true), [onCompletionChange]);
  return (
    <View style={styles.blockPanel}>
      <RoyalCorners />
      <View style={styles.videoIcon}><SymbolView name={{ android: 'play_circle', ios: 'play.circle.fill', web: 'play_circle' }} size={52} tintColor={colors.goldLight} /></View>
      <Text style={[styles.blockTitle, styles.centerText]}>{block.title || 'Video Lesson'}</Text>
      <Text style={[styles.memoText, styles.centerText]}>{validUrl ? 'Open this lesson video in the secure browser, then return here to continue.' : 'This video block does not have a valid link yet.'}</Text>
      <Pressable disabled={!validUrl} onPress={() => validUrl && void WebBrowser.openBrowserAsync(url)} style={[styles.primaryButton, !validUrl && styles.disabledButton]}>
        <Text style={styles.primaryButtonText}>OPEN VIDEO</Text>
      </Pressable>
    </View>
  );
}

function McqBlock({ block, context, onCompletionChange, onLiveStateChange }: Props) {
  const config = block.mcqConfig;
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = submitted && selected === config?.correctOptionId;
  const questionImage = academyAssetSource(context, config?.questionImageKey);

  useEffect(() => onCompletionChange(correct), [correct, onCompletionChange]);
  if (!config) return <StaticBlock block={block} onCompletionChange={onCompletionChange} />;

  return (
    <View style={styles.blockPanel}>
      <RoyalCorners />
      <Text style={styles.blockEyebrow}>MULTIPLE CHOICE</Text>
      <Text style={styles.blockTitle}>{block.title || 'Question'}</Text>
      {block.content ? <Text style={styles.memoText}>{block.content}</Text> : null}
      {questionImage ? <Image contentFit="contain" source={questionImage} style={styles.questionImage} /> : null}
      <Text style={styles.questionText}>{config.questionText}</Text>
      <View style={styles.options}>
        {config.options.map((option, index) => {
          const active = selected === option.id;
          const showCorrect = submitted && option.id === config.correctOptionId;
          const showWrong = submitted && active && !showCorrect;
          return (
            <Pressable disabled={submitted} key={option.id} onPress={() => setSelected(option.id)} style={[styles.option, active && styles.optionActive, showCorrect && styles.optionCorrect, showWrong && styles.optionWrong]}>
              <View style={styles.optionNumber}><Text style={styles.optionNumberText}>{index + 1}</Text></View>
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {submitted ? <Text style={[styles.feedback, correct ? styles.feedbackGood : styles.feedbackBad]}>{correct ? 'Correct. You may continue.' : 'Not quite. The correct answer is highlighted.'}</Text> : null}
      <Pressable disabled={!selected} onPress={() => {
        if (submitted && !correct) {
          setSelected(null);
          setSubmitted(false);
          return;
        }
        setSubmitted(true);
        onLiveStateChange?.({ attemptCount: 1, solutionUsed: false, state: selected === config.correctOptionId ? 'SOLVED' : 'FAILED' });
      }} style={[styles.primaryButton, !selected && styles.disabledButton]}>
        <Text style={styles.primaryButtonText}>{submitted && !correct ? 'TRY AGAIN' : submitted ? 'ANSWERED' : 'SUBMIT ANSWER'}</Text>
      </Pressable>
    </View>
  );
}

function InteractiveBlock({ block, onCompletionChange, onLiveStateChange }: Pick<Props, 'block' | 'onCompletionChange' | 'onLiveStateChange'>) {
  const config = block.interactiveConfig;
  const { width } = useWindowDimensions();
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [fen, setFen] = useState(config?.startFen || '');
  const [selected, setSelected] = useState<Square | null>(null);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [feedback, setFeedback] = useState('Play the best continuation on the board.');
  const [solved, setSolved] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solution = useMemo(() => parseSolution(config?.coachSolution || ''), [config?.coachSolution]);
  const game = useMemo(() => safeChess(fen), [fen]);
  const legalTargets = useMemo(() => game && selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : [], [game, selected]);
  const boardSize = Math.min(width - 46, 410);

  useEffect(() => {
    void getStoredChessPreferences().then((preferences) => {
      setBoardTheme(preferences.boardTheme);
      setPieceTheme(preferences.pieceTheme);
    });
    return () => { if (replyTimer.current) clearTimeout(replyTimer.current); };
  }, []);
  useEffect(() => onCompletionChange(solved || !config || !safeChess(config.startFen)), [config, onCompletionChange, solved]);

  const reset = useCallback(() => {
    if (!config) return;
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setFen(config.startFen);
    setSelected(null);
    setSolutionIndex(0);
    setLastMove(null);
    setSolved(false);
    setAttemptCount(0);
    setFeedback('Play the best continuation on the board.');
  }, [config]);

  function applyReply(sourceFen: string, index: number) {
    const reply = solution[index];
    if (!reply) {
      setSolved(true);
      setFeedback('Excellent. You found the full continuation.');
      return;
    }
    replyTimer.current = setTimeout(() => {
      const replyGame = safeChess(sourceFen);
      if (!replyGame) return;
      const move = replyGame.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply.slice(4, 5) || 'q' });
      if (!move) return;
      setFen(replyGame.fen());
      setLastMove({ from: move.from, to: move.to });
      setSolutionIndex(index + 1);
      if (index + 1 >= solution.length) {
        setSolved(true);
        setFeedback('Excellent. You found the full continuation.');
      } else {
        setFeedback('Good. Find the next move.');
      }
    }, 450);
  }

  function handleSquare(square: string) {
    if (!game || solved || !config) return;
    const target = square as Square;
    if (!selected) {
      const piece = game.get(target);
      if (piece?.color === game.turn()) setSelected(target);
      return;
    }
    if (selected === target) { setSelected(null); return; }
    const expected = solution[solutionIndex];
    const attempted = `${selected}${target}`;
    const expectedWithoutPromotion = expected?.slice(0, 4);
    if (expected && attempted !== expectedWithoutPromotion) {
      const nextAttempts = attemptCount + 1;
      setAttemptCount(nextAttempts);
      setSelected(null);
      setFeedback('That is not the planned continuation. Look again for the strongest move.');
      onLiveStateChange?.({ attemptCount: nextAttempts, currentFen: fen, lastMove: attempted, solutionUsed: false, state: 'FAILED' });
      return;
    }
    const next = safeChess(fen);
    if (!next) return;
    const move = next.move({ from: selected, to: target, promotion: expected?.slice(4, 5) || 'q' });
    setSelected(null);
    if (!move) { setFeedback('That move is not legal in this position.'); return; }
    setFen(next.fen());
    setLastMove({ from: move.from, to: move.to });
    const nextIndex = solutionIndex + 1;
    setSolutionIndex(nextIndex);
    if (!solution.length || nextIndex >= solution.length) {
      setSolved(true);
      setFeedback('Excellent. The continuation is complete.');
      onLiveStateChange?.({ attemptCount, currentFen: next.fen(), lastMove: `${move.from}${move.to}${move.promotion ?? ''}`, solutionUsed: false, state: 'SOLVED' });
    } else {
      setFeedback('Correct. The reply is being played.');
      onLiveStateChange?.({ attemptCount, currentFen: next.fen(), lastMove: `${move.from}${move.to}${move.promotion ?? ''}`, solutionUsed: false, state: 'IN_PROGRESS' });
      applyReply(next.fen(), nextIndex);
    }
  }

  if (!config || !game) return <StaticBlock block={block} onCompletionChange={onCompletionChange} />;
  const sideToMove = game.turn() === 'w' ? 'White' : 'Black';
  return (
    <View style={styles.blockPanel}>
      <RoyalCorners />
      <View style={styles.blockHeadingRow}>
        <View style={styles.blockHeadingCopy}><Text style={styles.blockEyebrow}>INTERACTIVE POSITION</Text><Text style={styles.blockTitle}>{block.title || config.puzzleTitle || 'Find the continuation'}</Text></View>
        <Pressable onPress={reset} style={styles.resetButton}><SymbolView name={{ android: 'refresh', ios: 'arrow.clockwise', web: 'refresh' }} size={17} tintColor={colors.goldLight} /></Pressable>
      </View>
      <View accessibilityLabel={`${sideToMove} to move`} style={styles.turnIndicator}>
        <View style={[styles.turnPiece, game.turn() === 'w' ? styles.whiteTurnPiece : styles.blackTurnPiece]} />
        <Text style={styles.turnText}>{sideToMove.toUpperCase()} TO MOVE</Text>
      </View>
      <View style={styles.boardWrap}>
        <NativeChessBoard boardTheme={boardTheme} getPiece={(square) => game.get(square as Square) ?? undefined} lastMove={lastMove} legalTargets={legalTargets} onSquarePress={handleSquare} orientation={config.sideToMove?.toLowerCase().startsWith('b') ? 'black' : 'white'} pieceTheme={pieceTheme} selectedSquare={selected} size={boardSize} />
      </View>
      <Text style={[styles.feedback, solved && styles.feedbackGood]}>{feedback}</Text>
    </View>
  );
}

function PieceMoveBlock({ block, onCompletionChange, onLiveStateChange }: Pick<Props, 'block' | 'onCompletionChange' | 'onLiveStateChange'>) {
  const config = block.pieceMoveConfig;
  const { width } = useWindowDimensions();
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [start, setStart] = useState(() => randomStartSquare(config?.piece || 'rook'));
  const [found, setFound] = useState<string[]>([]);
  const [round, setRound] = useState(1);
  const [complete, setComplete] = useState(false);
  const [feedback, setFeedback] = useState(config?.prompt || 'Select every legal square.');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expected = useMemo(() => legalPieceSquares(config?.piece || 'rook', start), [config?.piece, start]);
  const requiredRounds = Math.max(1, Math.min(20, config?.requiredRounds || 3));
  const piece = useMemo(() => ({ color: 'w' as const, type: pieceType(config?.piece || 'rook') }), [config?.piece]);

  useEffect(() => {
    void getStoredChessPreferences().then((preferences) => { setBoardTheme(preferences.boardTheme); setPieceTheme(preferences.pieceTheme); });
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => onCompletionChange(complete || !config), [complete, config, onCompletionChange]);

  const reset = useCallback(() => {
    if (!config) return;
    if (timer.current) clearTimeout(timer.current);
    setRound(1); setComplete(false); setFound([]); setStart(randomStartSquare(config.piece)); setFeedback(config.prompt || 'Select every legal square.');
  }, [config]);

  function choose(square: string) {
    if (!config || complete || square === start || found.includes(square)) return;
    if (!expected.includes(square)) { setFeedback(`${square} is not a legal ${config.piece} move from ${start}.`); onLiveStateChange?.({ attemptCount: 1, lastMove: square, solutionUsed: false, state: 'FAILED' }); return; }
    const nextFound = [...found, square];
    setFound(nextFound);
    if (nextFound.length < expected.length) { setFeedback('Correct square. Keep going.'); return; }
    if (round >= requiredRounds) { setComplete(true); setFeedback('Excellent. This piece-move exercise is complete.'); onLiveStateChange?.({ attemptCount: round, lastMove: square, solutionUsed: false, state: 'SOLVED' }); return; }
    onLiveStateChange?.({ attemptCount: round, lastMove: square, solutionUsed: false, state: 'IN_PROGRESS' });
    setFeedback(`Round ${round} complete. Preparing the next position.`);
    timer.current = setTimeout(() => { setRound((value) => value + 1); setFound([]); setStart((current) => randomStartSquare(config.piece, current)); setFeedback(config.prompt || 'Select every legal square.'); }, 650);
  }

  if (!config) return <StaticBlock block={block} onCompletionChange={onCompletionChange} />;
  return (
    <View style={styles.blockPanel}>
      <RoyalCorners />
      <View style={styles.blockHeadingRow}><View style={styles.blockHeadingCopy}><Text style={styles.blockEyebrow}>PIECE MOVE</Text><Text style={styles.blockTitle}>{block.title || `Learn the ${config.piece}`}</Text></View><Pressable onPress={reset} style={styles.resetButton}><SymbolView name={{ android: 'refresh', ios: 'arrow.clockwise', web: 'refresh' }} size={17} tintColor={colors.goldLight} /></Pressable></View>
      <Text style={styles.memoText}>{config.prompt || `Select every legal square for the ${config.piece}.`}</Text>
      <View style={styles.boardWrap}><NativeChessBoard boardTheme={boardTheme} getPiece={(square) => square === start ? piece : undefined} legalTargets={found} onSquarePress={choose} orientation="white" pieceTheme={pieceTheme} selectedSquare={start} size={Math.min(width - 46, 410)} /></View>
      <View style={styles.metrics}><Text style={styles.metric}>ROUND {round}/{requiredRounds}</Text><Text style={styles.metric}>FOUND {found.length}/{expected.length}</Text></View>
      <Text style={[styles.feedback, complete && styles.feedbackGood]}>{feedback}</Text>
    </View>
  );
}

export function StudentStudyBlockPlayer(props: Props) {
  if (props.block.type === 'VIDEO') return <VideoBlock {...props} />;
  if (props.block.type === 'MCQ') return <McqBlock {...props} />;
  if (props.block.type === 'INTERACTIVE') return <InteractiveBlock {...props} />;
  if (props.block.type === 'PIECE_MOVE') return <PieceMoveBlock {...props} />;
  return <StaticBlock {...props} />;
}

const styles = StyleSheet.create({
  blockPanel: { backgroundColor: 'rgba(7, 15, 22, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, overflow: 'hidden', padding: 17 },
  blockEyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  blockTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 22, fontWeight: '900', lineHeight: 27, marginTop: 5 },
  memoText: { color: colors.sandstone, fontSize: 12, lineHeight: 20, marginTop: 13 },
  centerText: { textAlign: 'center' },
  videoIcon: { alignItems: 'center', marginBottom: 4, marginTop: 9 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 17, paddingVertical: 12 },
  primaryButtonText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  disabledButton: { opacity: 0.45 },
  questionImage: { backgroundColor: '#12191e', borderRadius: 10, height: 190, marginTop: 13, width: '100%' },
  questionText: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '800', lineHeight: 23, marginTop: 15 },
  options: { gap: 9, marginTop: 13 },
  option: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  optionActive: { backgroundColor: 'rgba(184, 133, 34, 0.18)', borderColor: colors.gold },
  optionCorrect: { backgroundColor: 'rgba(26, 118, 80, 0.25)', borderColor: '#72d2a8' },
  optionWrong: { backgroundColor: 'rgba(139, 31, 40, 0.25)', borderColor: colors.danger },
  optionNumber: { alignItems: 'center', borderColor: colors.gold, borderRadius: 13, borderWidth: 1, height: 26, justifyContent: 'center', width: 26 },
  optionNumberText: { color: colors.goldLight, fontSize: 10, fontWeight: '900' },
  optionText: { color: colors.cream, flex: 1, fontSize: 12, lineHeight: 18 },
  feedback: { backgroundColor: 'rgba(185, 128, 26, 0.12)', borderColor: 'rgba(221, 181, 91, 0.45)', borderRadius: 9, borderWidth: 1, color: colors.sandstone, fontSize: 11, lineHeight: 17, marginTop: 14, padding: 11, textAlign: 'center' },
  feedbackGood: { backgroundColor: 'rgba(21, 111, 74, 0.2)', borderColor: '#68c79d', color: '#b9f4d8' },
  feedbackBad: { backgroundColor: 'rgba(136, 28, 38, 0.2)', borderColor: colors.danger, color: '#fecdd3' },
  blockHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  blockHeadingCopy: { flex: 1, minWidth: 0 },
  resetButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  turnIndicator: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.26)', borderColor: colors.goldDark, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 6 },
  turnPiece: { borderColor: colors.goldLight, borderRadius: 6, borderWidth: 1, height: 12, width: 12 },
  whiteTurnPiece: { backgroundColor: '#f5ead0' },
  blackTurnPiece: { backgroundColor: '#171717' },
  turnText: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  boardWrap: { alignItems: 'center', marginTop: 12 },
  metrics: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 11 },
  metric: { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, paddingHorizontal: 11, paddingVertical: 7 },
});
