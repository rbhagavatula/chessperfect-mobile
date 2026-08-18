import { Chess, type Square } from 'chess.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
import { ClassroomMeetingModal, isEmbeddedJitsiUrl } from '@/components/classroom-meeting-drawer';
import { ChessThemePicker } from '@/components/chess-theme-picker';
import { NativeChessBoard } from '@/components/native-chess-board';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  DEFAULT_BOARD_THEME,
  DEFAULT_PIECE_THEME,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { getStoredChessPreferences, saveChessPreferences } from '@/lib/chess-preferences';
import {
  classroomErrorMessage,
  closeClassroomActivity,
  endClassroom,
  fetchClassroomActivities,
  fetchClassroomBoard,
  fetchClassroomPresence,
  fetchClassroomStudies,
  fetchClassroomStudy,
  fetchClassroomStudyAssignment,
  fetchStudentHomework,
  getClassroomContext,
  isClassroomEndedError,
  joinClassroom,
  parseBoardArrows,
  parseBoardSquareHighlights,
  parseMcqOptions,
  pushClassroomActivity,
  publishClassroomBoard,
  resolveAcademyUrl,
  sendClassroomHeartbeat,
  submitClassroomActivity,
  updateClassroomBroadcastMode,
  type ClassroomActivity,
  type ClassroomActivitySummary,
  type ClassroomBoard,
  type ClassroomContext,
  type ClassroomJoin,
  type ClassroomHomework,
  type ClassroomPresenceSummary,
  type ClassroomStudyAssignment,
  type ClassroomStudy,
  type ClassroomStudyBlock,
  type ClassroomStudyLesson,
} from '@/lib/classroom';
import { analyzePosition, type PositionAnalysis, type PositionAnalysisLine } from '@/lib/position-analysis';

const initialFen = new Chess().fen();
const BROADCAST_MODE_OPTIONS: { label: string; value: ClassroomJoin['broadcastMode'] }[] = [
  { label: 'Single Study Broadcast', value: 'SINGLE_STUDY' },
  { label: 'Multi Study Broadcast', value: 'MULTI_STUDY' },
  { label: 'Analysis', value: 'ANALYSIS' },
];

function meetingIdentity(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function safeGame(fen?: string | null) {
  try {
    return new Chess(fen || initialFen);
  } catch {
    return new Chess();
  }
}

function countdown(endsAt: string | null | undefined, now: number) {
  if (!endsAt) return null;
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type BroadcastTimelinePosition = { fen: string; san: string | null; uci: string | null };

const CLASSROOM_ENGINE_LINES = 3;
const CLASSROOM_ENGINE_DEPTH = 14;

type ClassroomToolPanel = 'history' | 'homework' | 'leaderboard' | 'participants' | 'studyBroadcast';

function getNextActivityBlock(blocks: ClassroomStudyBlock[], blockId?: number | null) {
  const selectedIndex = blocks.findIndex((block) => block.id === blockId);
  return selectedIndex >= 0 ? blocks[selectedIndex + 1] ?? null : blocks[0] ?? null;
}

function stripVariations(moveText: string) {
  let value = moveText;
  let previous = '';
  while (value !== previous) {
    previous = value;
    value = value.replace(/\([^()]*\)/g, ' ');
  }
  return value.replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseBroadcastTimeline(moveText: string | null | undefined, fallbackFen: string) {
  const cleaned = stripVariations(moveText?.trim() ?? '').replace(/\s+(?:1-0|0-1|1\/2-1\/2|\*)\s*$/, '');
  if (cleaned) {
    try {
      const game = new Chess();
      game.loadPgn(`[Result "*"]\n\n${cleaned} *`);
      const moves = game.history({ verbose: true });
      if (moves.length) {
        return [
          { fen: moves[0].before, san: null, uci: null },
          ...moves.map((move) => ({
            fen: move.after,
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ''}`,
          })),
        ] satisfies BroadcastTimelinePosition[];
      }
    } catch {
      // Custom-FEN broadcasts may not be reconstructable from movetext alone.
    }
  }
  return [{ fen: safeGame(fallbackFen).fen(), san: null, uci: null }] satisfies BroadcastTimelinePosition[];
}

function broadcastMoveText(timeline: BroadcastTimelinePosition[]) {
  const rootFields = timeline[0]?.fen.split(/\s+/) ?? [];
  const startsWithBlack = rootFields[1] === 'b';
  const baseMoveNumber = Number.parseInt(rootFields[5] ?? '1', 10) || 1;
  return timeline.slice(1).map((position, index) => {
    const absoluteOffset = index + (startsWithBlack ? 1 : 0);
    const moveNumber = baseMoveNumber + Math.floor(absoluteOffset / 2);
    const prefix = absoluteOffset % 2 === 0 ? `${moveNumber}.` : index === 0 ? `${moveNumber}...` : '';
    return [prefix, position.san].filter(Boolean).join('');
  }).join(' ');
}

function classroomPrincipalVariation(fen: string, principalVariation?: string | null) {
  if (!principalVariation) return '';
  const game = safeGame(fen);
  const moves: string[] = [];
  for (const uci of principalVariation.trim().split(/\s+/).slice(0, 8)) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
    try {
      const move = game.move({
        from: uci.slice(0, 2) as Square,
        promotion: (uci[4] || 'q') as 'b' | 'n' | 'q' | 'r',
        to: uci.slice(2, 4) as Square,
      });
      if (!move) break;
      moves.push(move.san);
    } catch {
      break;
    }
  }
  return moves.join(' ');
}

function classroomEvaluationScore(line?: PositionAnalysisLine | null) {
  if (!line) return '0.00';
  if (line.mate !== null && line.mate !== undefined) return line.mate === 0 ? '#' : `#${line.mate}`;
  const pawns = (line.centipawns ?? 0) / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function classroomEvaluationSymbol(line?: PositionAnalysisLine | null) {
  if (!line) return '=';
  if (line.mate !== null && line.mate !== undefined) return line.mate >= 0 ? '+−' : '−+';
  const pawns = (line.centipawns ?? 0) / 100;
  if (pawns >= 1.5) return '+−';
  if (pawns >= 0.5) return '+/=';
  if (pawns <= -1.5) return '−+';
  if (pawns <= -0.5) return '=/+';
  return '=';
}

function evaluationWhitePercent(line?: PositionAnalysisLine | null) {
  if (line?.mate !== null && line?.mate !== undefined) return line.mate >= 0 ? 96 : 4;
  const centipawns = Math.max(-1200, Math.min(1200, line?.centipawns ?? 0));
  return 100 / (1 + Math.exp(-centipawns / 220));
}

function BroadcastBoardWorkspace({
  activities,
  board,
  boardSize,
  boardTheme,
  context,
  isCoach,
  onBoardChange,
  pieceTheme,
  sessionId,
}: {
  activities: ClassroomActivitySummary;
  board: ClassroomBoard | null;
  boardSize: number;
  boardTheme: BoardThemeName;
  context: ClassroomContext;
  isCoach: boolean;
  onBoardChange: (board: ClassroomBoard) => void;
  pieceTheme: PieceThemeName;
  sessionId: number;
}) {
  const [timeline, setTimeline] = useState<BroadcastTimelinePosition[]>(() => parseBroadcastTimeline(board?.moveText, board?.fen || initialFen));
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [engineEnabled, setEngineEnabled] = useState(isCoach);
  const [analysis, setAnalysis] = useState<PositionAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'activity' | 'engine' | 'notation'>('notation');
  const analysisSequence = useRef(0);
  const arrows = useMemo(() => parseBoardArrows(board?.arrowsJson), [board?.arrowsJson]);
  const squareHighlights = useMemo(() => parseBoardSquareHighlights(board?.squareHighlightsJson), [board?.squareHighlightsJson]);
  const orientation = board?.orientation?.toLowerCase() === 'black' ? 'black' : 'white';
  const position = timeline[cursor] ?? timeline[0] ?? { fen: board?.fen || initialFen, san: null, uci: null };
  const game = useMemo(() => safeGame(position.fen), [position.fen]);
  const legalTargets = useMemo(
    () => selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : [],
    [game, selected],
  );
  const engineLines = useMemo(() => {
    if (!analysis) return [];
    return analysis.lines?.length ? analysis.lines.slice(0, CLASSROOM_ENGINE_LINES) : [analysis];
  }, [analysis]);
  const mainEvaluation = engineLines[0] ?? analysis;
  const completedParticipants = (activities.activeParticipants ?? []).filter((participant) => participant.completed);
  const pendingParticipants = (activities.activeParticipants ?? []).filter((participant) => !participant.completed);

  useEffect(() => {
    const timer = setTimeout(() => {
      const nextTimeline = parseBroadcastTimeline(board?.moveText, board?.fen || initialFen);
      const nextCursor = Math.max(0, Math.min(nextTimeline.length - 1, board?.selectedPly ?? nextTimeline.length - 1));
      setTimeline(nextTimeline);
      setCursor(nextCursor);
      setSelected(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [board?.fen, board?.moveText, board?.selectedPly, board?.updatedAt]);

  useEffect(() => {
    if (!isCoach || !engineEnabled) return;
    const sequence = ++analysisSequence.current;
    const timeout = setTimeout(() => {
      setAnalyzing(true);
      setAnalysisError(null);
      void (async () => {
        for (const depth of [8, 12, CLASSROOM_ENGINE_DEPTH]) {
          const result = await analyzePosition(position.fen, depth, context.accessToken, CLASSROOM_ENGINE_LINES, context.origin);
          if (sequence !== analysisSequence.current) return;
          setAnalysis(result);
        }
      })().catch((caught: unknown) => {
        if (sequence === analysisSequence.current) {
          setAnalysisError(caught instanceof Error ? caught.message : 'Engine analysis is unavailable.');
        }
      }).finally(() => {
        if (sequence === analysisSequence.current) setAnalyzing(false);
      });
    }, 250);
    return () => {
      clearTimeout(timeout);
      if (sequence === analysisSequence.current) analysisSequence.current += 1;
    };
  }, [context.accessToken, context.origin, engineEnabled, isCoach, position.fen]);

  async function publish(nextTimeline: BroadcastTimelinePosition[], nextCursor: number) {
    if (!isCoach || publishing) return;
    const nextPosition = nextTimeline[nextCursor];
    if (!nextPosition) return;
    setPublishing(true);
    setBoardError(null);
    try {
      const saved = await publishClassroomBoard(context, sessionId, {
        arrowsJson: board?.arrowsJson ?? '[]',
        fen: nextPosition.fen,
        moveText: broadcastMoveText(nextTimeline),
        orientation,
        selectedPly: nextCursor,
        squareHighlightsJson: board?.squareHighlightsJson ?? '[]',
      });
      onBoardChange(saved);
    } catch (caught) {
      setBoardError(classroomErrorMessage(caught));
    } finally {
      setPublishing(false);
    }
  }

  function selectSquare(squareValue: string) {
    if (!isCoach || publishing) return;
    const square = squareValue as Square;
    if (selected && legalTargets.includes(square)) {
      const nextGame = safeGame(position.fen);
      try {
        const move = nextGame.move({ from: selected, promotion: 'q', to: square });
        if (!move) return;
        const nextTimeline = [
          ...timeline.slice(0, cursor + 1),
          { fen: nextGame.fen(), san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ''}` },
        ];
        const nextCursor = nextTimeline.length - 1;
        setTimeline(nextTimeline);
        setCursor(nextCursor);
        setSelected(null);
        void publish(nextTimeline, nextCursor);
      } catch {
        setSelected(null);
      }
      return;
    }
    const piece = game.get(square);
    setSelected(piece?.color === game.turn() ? square : null);
  }

  function navigate(nextCursor: number) {
    const bounded = Math.max(0, Math.min(timeline.length - 1, nextCursor));
    setCursor(bounded);
    setSelected(null);
    if (isCoach) void publish(timeline, bounded);
  }

  const rows = useMemo(() => {
    const rowMap = new Map<number, { black?: { index: number; position: BroadcastTimelinePosition }; white?: { index: number; position: BroadcastTimelinePosition } }>();
    const rootFields = timeline[0]?.fen.split(/\s+/) ?? [];
    const startsWithBlack = rootFields[1] === 'b';
    const baseMove = Number.parseInt(rootFields[5] ?? '1', 10) || 1;
    timeline.slice(1).forEach((item, moveIndex) => {
      const absoluteOffset = moveIndex + (startsWithBlack ? 1 : 0);
      const moveNumber = baseMove + Math.floor(absoluteOffset / 2);
      const row = rowMap.get(moveNumber) ?? {};
      row[absoluteOffset % 2 === 0 ? 'white' : 'black'] = { index: moveIndex + 1, position: item };
      rowMap.set(moveNumber, row);
    });
    return [...rowMap.entries()];
  }, [timeline]);

  return (
    <View style={styles.broadcastWorkspace}>
      <View style={styles.boardWrap}>
        <NativeChessBoard
          arrows={arrows}
          boardTheme={boardTheme}
          getPiece={(square) => game.get(square as Square) ?? undefined}
          lastMove={position.uci ? { from: position.uci.slice(0, 2), to: position.uci.slice(2, 4) } : null}
          legalTargets={isCoach ? legalTargets : []}
          onSquarePress={isCoach ? selectSquare : undefined}
          orientation={orientation}
          pieceTheme={pieceTheme}
          selectedSquare={isCoach ? selected : null}
          size={boardSize}
          squareHighlights={squareHighlights}
        />
      </View>

      {isCoach ? (
        <View style={styles.workspaceTabs}>
          <WorkspaceTabButton active={workspaceTab === 'notation'} label="Notation" onPress={() => setWorkspaceTab('notation')} />
          <WorkspaceTabButton active={workspaceTab === 'engine'} label="Engine" onPress={() => setWorkspaceTab('engine')} />
          <WorkspaceTabButton active={workspaceTab === 'activity'} label="Activity" onPress={() => setWorkspaceTab('activity')} />
        </View>
      ) : null}

      {isCoach && workspaceTab === 'engine' && engineEnabled ? (
        <View style={styles.evaluationBar}>
          <View style={[styles.evaluationWhite, { width: `${evaluationWhitePercent(mainEvaluation)}%` }]} />
          <Text style={styles.evaluationLabel}>{classroomEvaluationScore(mainEvaluation)}</Text>
        </View>
      ) : null}

      {!isCoach || workspaceTab === 'notation' ? <View style={styles.notationPanel}>
        <View style={styles.notationHeader}><Text style={styles.sectionLabel}>NOTATION</Text><Text style={styles.notationPly}>Ply {cursor}</Text></View>
        {rows.length ? rows.map(([moveNumber, row]) => (
          <View key={moveNumber} style={styles.notationRow}>
            <Text style={styles.moveNumber}>{moveNumber}.</Text>
            <NotationCell entry={row.white} onPress={navigate} selected={row.white?.index === cursor} />
            <NotationCell entry={row.black} onPress={navigate} selected={row.black?.index === cursor} />
          </View>
        )) : <Text style={styles.emptyNotation}>{board?.moveText?.trim() || 'Make a move to begin the notation.'}</Text>}
        <View style={styles.classroomNavigation}>
          <ClassroomNavButton disabled={cursor === 0 || publishing} icon={{ android: 'first_page', ios: 'backward.end.fill', web: 'first_page' }} label="First" onPress={() => navigate(0)} />
          <ClassroomNavButton disabled={cursor === 0 || publishing} icon={{ android: 'chevron_left', ios: 'chevron.left', web: 'chevron_left' }} label="Previous" onPress={() => navigate(cursor - 1)} />
          <View style={styles.turnPill}><Text style={styles.turnLabel}>{game.turn() === 'w' ? 'White' : 'Black'} to move</Text></View>
          <ClassroomNavButton disabled={cursor >= timeline.length - 1 || publishing} icon={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} label="Next" onPress={() => navigate(cursor + 1)} />
          <ClassroomNavButton disabled={cursor >= timeline.length - 1 || publishing} icon={{ android: 'last_page', ios: 'forward.end.fill', web: 'last_page' }} label="Last" onPress={() => navigate(timeline.length - 1)} />
        </View>
      </View> : null}

      {isCoach && workspaceTab === 'engine' ? (
        <View style={styles.classroomEngine}>
          <View style={styles.engineHeader}>
            <Text style={styles.engineTitle}>Engine</Text>
            {analyzing ? <ActivityIndicator color={colors.goldLight} size="small" /> : null}
            <Text style={styles.engineMeta}>Depth {CLASSROOM_ENGINE_DEPTH} · {CLASSROOM_ENGINE_LINES} lines</Text>
            <Switch
              accessibilityLabel="Toggle classroom engine"
              ios_backgroundColor="#2a211b"
              onValueChange={setEngineEnabled}
              thumbColor={engineEnabled ? colors.goldLight : colors.muted}
              trackColor={{ false: '#342820', true: '#765616' }}
              value={engineEnabled}
            />
          </View>
          {engineEnabled ? engineLines.map((line, index) => (
            <View key={`${line.bestMove ?? 'line'}-${index}`} style={styles.classroomEngineLine}>
              <Text style={styles.engineAssessment}>{classroomEvaluationSymbol(line)}</Text>
              <Text style={styles.engineScore}>{classroomEvaluationScore(line)}</Text>
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.enginePv}>{classroomPrincipalVariation(position.fen, line.principalVariation) || 'Calculating…'}</Text>
            </View>
          )) : null}
          {engineEnabled && !engineLines.length ? <Text style={styles.engineWaiting}>{analyzing ? 'Calculating…' : 'Waiting for engine analysis…'}</Text> : null}
          {analysisError ? <Text style={styles.engineError}>{analysisError}</Text> : null}
        </View>
      ) : null}
      {isCoach && workspaceTab === 'activity' ? (
        <View style={styles.classroomActivityStatus}>
          {activities.activeActivity ? (
            <>
              <View style={styles.activityStatusHeader}>
                <View style={styles.headingCopy}><Text style={styles.sectionLabel}>LIVE ACTIVITY</Text><Text numberOfLines={1} style={styles.activityStatusTitle}>{activities.activeActivity.title}</Text></View>
                <Text style={styles.activityStatusCount}>{completedParticipants.length}/{activities.totalParticipants ?? completedParticipants.length + pendingParticipants.length}</Text>
              </View>
              <View style={styles.activityStudentSection}>
                <Text style={styles.activityCompletedLabel}>COMPLETED ({completedParticipants.length})</Text>
                {completedParticipants.length ? completedParticipants.map((participant) => (
                  <View key={`completed-${participant.studentUserId}`} style={styles.activityStudentRow}>
                    <SymbolView name={{ android: 'check_circle', ios: 'checkmark.circle.fill', web: 'check_circle' }} size={17} tintColor={colors.success} />
                    <Text numberOfLines={1} style={styles.activityStudentName}>{participant.studentName}</Text>
                    <Text style={styles.activityStudentResult}>{participant.correct ? 'Correct' : 'Done'}</Text>
                  </View>
                )) : <Text style={styles.activityEmptyText}>No students have completed this activity yet.</Text>}
              </View>
              <View style={styles.activityStudentSection}>
                <Text style={styles.activityPendingLabel}>PENDING ({pendingParticipants.length})</Text>
                {pendingParticipants.length ? pendingParticipants.map((participant) => (
                  <View key={`pending-${participant.studentUserId}`} style={styles.activityStudentRow}>
                    <SymbolView name={{ android: 'schedule', ios: 'clock.fill', web: 'schedule' }} size={17} tintColor={colors.goldLight} />
                    <Text numberOfLines={1} style={styles.activityStudentName}>{participant.studentName}</Text>
                    <Text style={styles.activityStudentPending}>Solving</Text>
                  </View>
                )) : <Text style={styles.activityEmptyText}>No students are pending.</Text>}
              </View>
            </>
          ) : <Text style={styles.activityEmptyText}>Push an activity to see completed and pending students.</Text>}
        </View>
      ) : null}
      {boardError ? <Text style={styles.engineError}>{boardError}</Text> : null}
    </View>
  );
}

function WorkspaceTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.workspaceTab, active && styles.workspaceTabActive, pressed && styles.pressed]}>
      <Text style={[styles.workspaceTabText, active && styles.workspaceTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function NotationCell({
  entry,
  onPress,
  selected,
}: {
  entry?: { index: number; position: BroadcastTimelinePosition };
  onPress: (index: number) => void;
  selected: boolean;
}) {
  return (
    <Pressable disabled={!entry} onPress={() => entry && onPress(entry.index)} style={[styles.notationCell, selected && styles.notationCellSelected]}>
      <Text numberOfLines={1} style={[styles.notationCellText, selected && styles.notationCellTextSelected]}>{entry?.position.san ?? ''}</Text>
    </Pressable>
  );
}

function ClassroomNavButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: ComponentProps<typeof SymbolView>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.classroomNavButton, disabled && styles.disabled, pressed && styles.pressed]}>
      <SymbolView name={icon} size={20} tintColor={colors.goldLight} />
    </Pressable>
  );
}

function InteractiveActivity({
  activity,
  boardSize,
  boardTheme,
  disabled,
  onSubmit,
  pieceTheme,
}: {
  activity: ClassroomActivity;
  boardSize: number;
  boardTheme: BoardThemeName;
  disabled: boolean;
  onSubmit: (answer: string) => void;
  pieceTheme: PieceThemeName;
}) {
  const [fen, setFen] = useState(activity.interactiveStartFen || initialFen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [submitted, setSubmitted] = useState(Boolean(activity.myResponse));
  const [replying, setReplying] = useState(false);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [answerMoves, setAnswerMoves] = useState<string[]>([]);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solutionMoves = useMemo(
    () => activity.interactiveCoachSolution?.toLowerCase().match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g) ?? [],
    [activity.interactiveCoachSolution],
  );
  const orientation = useMemo(
    () => safeGame(activity.interactiveStartFen || initialFen).turn() === 'b' ? 'black' : 'white',
    [activity.interactiveStartFen],
  );
  const game = useMemo(() => safeGame(fen), [fen]);
  const legalTargets = useMemo(
    () => selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : [],
    [game, selected],
  );

  useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  function chooseSquare(square: string) {
    if (disabled || submitted || replying) return;
    const target = square as Square;
    if (selected && legalTargets.includes(target)) {
      const next = safeGame(fen);
      let move = null;
      try {
        move = next.move({ from: selected, promotion: 'q', to: target });
      } catch {
        move = null;
      }
      if (move) {
        const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
        const attemptedLine = [...answerMoves, uci];
        setFen(next.fen());
        setSelected(null);

        if (solutionMoves.length === 0 || uci !== solutionMoves[solutionIndex]) {
          setAnswerMoves(attemptedLine);
          setSubmitted(true);
          onSubmit(attemptedLine.join(' '));
          return;
        }

        if (solutionIndex >= solutionMoves.length - 1) {
          setAnswerMoves(attemptedLine);
          setSubmitted(true);
          onSubmit(attemptedLine.join(' '));
          return;
        }

        const replyUci = solutionMoves[solutionIndex + 1];
        setReplying(true);
        replyTimer.current = setTimeout(() => {
          const replyGame = safeGame(next.fen());
          let reply = null;
          try {
            reply = replyGame.move({
              from: replyUci.slice(0, 2) as Square,
              promotion: (replyUci[4] || 'q') as 'b' | 'n' | 'q' | 'r',
              to: replyUci.slice(2, 4) as Square,
            });
          } catch {
            reply = null;
          }
          if (!reply) {
            setSubmitted(true);
            onSubmit(attemptedLine.join(' '));
            setReplying(false);
            return;
          }
          setFen(replyGame.fen());
          setAnswerMoves([...attemptedLine, replyUci]);
          setSolutionIndex((current) => current + 2);
          setReplying(false);
        }, 350);
      }
      return;
    }
    const piece = game.get(target);
    if (piece?.color === game.turn()) {
      setSelected(target);
      return;
    }
    setSelected(null);
  }

  return (
    <View>
      <View style={styles.boardWrap}>
        <NativeChessBoard
          boardTheme={boardTheme}
          getPiece={(square) => game.get(square as Square) ?? undefined}
          legalTargets={legalTargets}
          onSquarePress={chooseSquare}
          orientation={orientation}
          pieceTheme={pieceTheme}
          selectedSquare={selected}
          size={boardSize}
        />
      </View>
      <Text style={styles.activityHint}>
        {activity.myResponse || submitted
          ? 'Your answer has been submitted.'
          : replying
            ? 'Coach move…'
            : `${game.turn() === 'w' ? 'White' : 'Black'} to move.`}
      </Text>
    </View>
  );
}

function ActivityPanel({
  activity,
  boardSize,
  boardTheme,
  now,
  onSubmit,
  pieceTheme,
  readOnly = false,
  saving,
}: {
  activity: ClassroomActivity;
  boardSize: number;
  boardTheme: BoardThemeName;
  now: number;
  onSubmit: (answer: string) => void;
  pieceTheme: PieceThemeName;
  readOnly?: boolean;
  saving: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const options = useMemo(() => parseMcqOptions(activity.mcqOptionsJson), [activity.mcqOptionsJson]);
  const remaining = countdown(activity.endsAt, now);
  const response = activity.myResponse;

  return (
    <View style={styles.activityPanel}>
      <RoyalCorners />
      <View style={styles.panelHeadingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>LIVE ACTIVITY</Text>
          <Text style={styles.panelTitle}>{activity.title || 'Class Activity'}</Text>
        </View>
        {remaining ? <Text style={styles.timer}>{remaining}</Text> : null}
      </View>
      {activity.content ? <Text style={styles.activityCopy}>{activity.content}</Text> : null}
      {activity.type === 'INTERACTIVE' ? (
        <InteractiveActivity
          key={`interactive-${activity.id}`}
          activity={activity}
          boardSize={boardSize}
          boardTheme={boardTheme}
          disabled={saving || readOnly}
          onSubmit={onSubmit}
          pieceTheme={pieceTheme}
        />
      ) : response ? null : (
        <View style={styles.optionsList}>
          <Text style={styles.question}>{activity.mcqQuestionText || 'Choose your answer'}</Text>
          {options.map((option) => (
            <Pressable
              key={option.id}
              disabled={saving || readOnly}
              onPress={() => setSelectedOption(option.id)}
              style={({ pressed }) => [
                styles.optionButton,
                selectedOption === option.id && styles.optionSelected,
                pressed && styles.pressed,
              ]}>
              <View style={[styles.optionMark, selectedOption === option.id && styles.optionMarkSelected]} />
              <Text style={styles.optionText}>{option.text}</Text>
            </Pressable>
          ))}
          {!readOnly ? <Pressable
            disabled={!selectedOption || saving}
            onPress={() => selectedOption && onSubmit(selectedOption)}
            style={({ pressed }) => [styles.submitButton, (!selectedOption || saving) && styles.disabled, pressed && styles.pressed]}>
            {saving ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.submitText}>SUBMIT ANSWER</Text>}
          </Pressable> : <Text style={styles.activityHint}>Student preview · Answers are submitted from student devices.</Text>}
        </View>
      )}
      {response ? (
        <View style={[styles.result, response.correct ? styles.resultCorrect : styles.resultWrong]}>
          <SymbolView
            name={{ android: response.correct ? 'check_circle' : 'cancel', ios: response.correct ? 'checkmark.circle.fill' : 'xmark.circle.fill', web: response.correct ? 'check_circle' : 'cancel' }}
            size={22}
            tintColor={response.correct ? colors.success : colors.danger}
          />
          <View style={styles.headingCopy}>
            <Text style={styles.resultTitle}>{response.correct ? 'Correct answer' : 'Answer submitted'}</Text>
            <Text style={styles.resultCopy}>{response.score} of {activity.maxScore} points · Waiting for your coach</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function LiveClassroomScreen() {
  const params = useLocalSearchParams<{ batchName?: string; sessionId?: string }>();
  const sessionId = Number(params.sessionId);
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 28, 520);
  const [context, setContext] = useState<ClassroomContext | null>(null);
  const [joined, setJoined] = useState<ClassroomJoin | null>(null);
  const [board, setBoard] = useState<ClassroomBoard | null>(null);
  const [activities, setActivities] = useState<ClassroomActivitySummary>({ activities: [], activeActivity: null, leaderboard: [] });
  const [assignment, setAssignment] = useState<ClassroomStudyAssignment | null>(null);
  const [presence, setPresence] = useState<ClassroomPresenceSummary>({ activeCount: 0, awayCount: 0, disconnectedCount: 0, inactiveStudentCount: 0, participants: [] });
  const [homework, setHomework] = useState<ClassroomHomework[]>([]);
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityAttemptVersion, setActivityAttemptVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [classEnded, setClassEnded] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [meetingActivated, setMeetingActivated] = useState(false);
  const [meetingVisible, setMeetingVisible] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endingClass, setEndingClass] = useState(false);
  const [toolPanel, setToolPanel] = useState<ClassroomToolPanel | null>(null);
  const [broadcastStudies, setBroadcastStudies] = useState<ClassroomStudy[]>([]);
  const [broadcastStudyId, setBroadcastStudyId] = useState<number | null>(null);
  const [broadcastLessons, setBroadcastLessons] = useState<ClassroomStudyLesson[]>([]);
  const [broadcastLessonId, setBroadcastLessonId] = useState<number | 'ALL' | null>(null);
  const [broadcastBlockId, setBroadcastBlockId] = useState<number | null>(null);
  const [broadcastStudyLoading, setBroadcastStudyLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);
  const [autoAdvanceActivities, setAutoAdvanceActivities] = useState(false);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);
  const boardSyncing = useRef(false);
  const activitySyncing = useRef(false);
  const joinedRef = useRef<ClassroomJoin | null>(null);
  const autoAdvancedActivityId = useRef<number | null>(null);

  const broadcastBlocks = useMemo(
    () => broadcastLessonId === 'ALL'
      ? broadcastLessons.flatMap((lesson) => lesson.blocks)
      : broadcastLessons.find((lesson) => lesson.id === broadcastLessonId)?.blocks ?? [],
    [broadcastLessonId, broadcastLessons],
  );
  const nextBroadcastBlock = getNextActivityBlock(broadcastBlocks, broadcastBlockId);

  const syncBoard = useCallback(async (activeContext: ClassroomContext) => {
    if (boardSyncing.current) return;
    boardSyncing.current = true;
    try {
      const nextBoard = await fetchClassroomBoard(activeContext, sessionId);
      if (mounted.current) setBoard(nextBoard);
    } finally {
      boardSyncing.current = false;
    }
  }, [sessionId]);

  const syncActivities = useCallback(async (activeContext: ClassroomContext) => {
    if (activitySyncing.current) return;
    activitySyncing.current = true;
    try {
      const summary = await fetchClassroomActivities(activeContext, sessionId);
      if (mounted.current) setActivities(summary);
    } finally {
      activitySyncing.current = false;
    }
  }, [sessionId]);

  const loadClassroom = useCallback(async (refresh = false) => {
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      setError('This classroom link is invalid.');
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const activeContext = await getClassroomContext();
      const nextJoin = await joinClassroom(activeContext, sessionId);
      const [nextBoard, nextActivities, nextAssignment, nextPresence, nextHomework, nextStudies, preferences] = await Promise.all([
        fetchClassroomBoard(activeContext, sessionId),
        fetchClassroomActivities(activeContext, sessionId),
        fetchClassroomStudyAssignment(activeContext, sessionId).catch(() => null),
        fetchClassroomPresence(activeContext, sessionId),
        fetchStudentHomework(activeContext).catch(() => []),
        activeContext.academy.role === 'COACH'
          ? fetchClassroomStudies(activeContext).catch(() => [])
          : Promise.resolve([] as ClassroomStudy[]),
        getStoredChessPreferences(),
      ]);
      if (!mounted.current) return;
      setContext(activeContext);
      setJoined(nextJoin);
      joinedRef.current = nextJoin;
      setBoard(nextBoard);
      setActivities(nextActivities);
      setAssignment(nextAssignment);
      setPresence(nextPresence);
      setHomework(nextHomework.filter((item) => item.classSessionId === sessionId));
      setBroadcastStudies(nextStudies.filter((study) => study.state === 'PUBLISHED'));
      setBoardTheme(preferences.boardTheme);
      setPieceTheme(preferences.pieceTheme);
      await sendClassroomHeartbeat(activeContext, sessionId, true, true).catch(() => undefined);
    } catch (caught) {
      if (mounted.current) {
        if (isClassroomEndedError(caught)) setClassEnded(true);
        else setError(classroomErrorMessage(caught));
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    mounted.current = true;
    const initialLoad = setTimeout(() => void loadClassroom(), 0);
    return () => {
      mounted.current = false;
      clearTimeout(initialLoad);
    };
  }, [loadClassroom]);

  useEffect(() => {
    if (!context || !joined) return;
    const boardTimer = setInterval(() => void syncBoard(context).catch(() => undefined), 2_000);
    const activityTimer = setInterval(() => void syncActivities(context).catch(() => undefined), 2_500);
    const presenceTimer = setInterval(() => void fetchClassroomPresence(context, sessionId).then((next) => mounted.current && setPresence(next)).catch(() => undefined), 5_000);
    const assignmentTimer = setInterval(() => void fetchClassroomStudyAssignment(context, sessionId).then((next) => mounted.current && setAssignment(next)).catch(() => undefined), 5_000);
    const homeworkTimer = setInterval(() => void fetchStudentHomework(context)
      .then((items) => mounted.current && setHomework(items.filter((item) => item.classSessionId === sessionId)))
      .catch(() => undefined), 10_000);
    const joinTimer = setInterval(() => {
      void joinClassroom(context, sessionId)
        .then((nextJoin) => {
          if (!mounted.current) return;
          const previous = joinedRef.current;
          if (previous && previous.broadcastMode !== nextJoin.broadcastMode) {
            setModeNotice(`Coach switched to ${nextJoin.broadcastMode.replaceAll('_', ' ')} mode.`);
          }
          const stableJoin = previous?.joinLink && nextJoin.joinLink
            && meetingIdentity(previous.joinLink) === meetingIdentity(nextJoin.joinLink)
            ? { ...nextJoin, joinLink: previous.joinLink }
            : nextJoin;
          joinedRef.current = stableJoin;
          setJoined(stableJoin);
        })
        .catch((caught) => {
          if (!mounted.current) return;
          if (isClassroomEndedError(caught)) setClassEnded(true);
          else setError(classroomErrorMessage(caught));
        });
    }, 4_000);
    return () => {
      clearInterval(boardTimer);
      clearInterval(activityTimer);
      clearInterval(assignmentTimer);
      clearInterval(homeworkTimer);
      clearInterval(joinTimer);
      clearInterval(presenceTimer);
    };
  }, [context, joined, sessionId, syncActivities, syncBoard]);

  useEffect(() => {
    if (!context || !joined) return;
    const heartbeat = (visible: boolean, focused: boolean) => {
      void sendClassroomHeartbeat(context, sessionId, visible, focused).catch(() => undefined);
    };
    const timer = setInterval(() => heartbeat(true, AppState.currentState === 'active'), 15_000);
    const subscription = AppState.addEventListener('change', (state) => heartbeat(state === 'active', state === 'active'));
    return () => {
      clearInterval(timer);
      subscription.remove();
      heartbeat(false, false);
    };
  }, [context, joined, sessionId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const meetingCandidate = context && joined?.joinLink
    ? resolveAcademyUrl(context.origin, joined.joinLink)
    : null;
  const meetingUrl = meetingCandidate && isEmbeddedJitsiUrl(meetingCandidate) ? meetingCandidate : null;
  const isCoach = context?.academy.role === 'COACH';
  const dashboardHref = (isCoach ? '/academy/coach-dashboard' : '/academy/student-dashboard') as Href;

  const pushBroadcastBlock = useCallback(async (
    sourceBlockId: number,
    successMessage = 'Activity broadcasted.',
  ) => {
    if (!context || !isCoach || activitySaving) return false;
    setActivitySaving(true);
    setBroadcastMessage(null);
    try {
      const summary = await pushClassroomActivity(context, sessionId, sourceBlockId);
      if (!mounted.current) return false;
      setActivities(summary);
      setBroadcastBlockId(sourceBlockId);
      setBroadcastMessage(successMessage);
      setOptionsOpen(false);
      setToolPanel(null);
      return true;
    } catch (caught) {
      if (mounted.current) setBroadcastMessage(classroomErrorMessage(caught));
      return false;
    } finally {
      if (mounted.current) setActivitySaving(false);
    }
  }, [activitySaving, context, isCoach, sessionId]);

  async function selectBroadcastStudy(studyId: number) {
    if (!context || broadcastStudyLoading) return;
    setBroadcastStudyId(studyId);
    setBroadcastLessons([]);
    setBroadcastLessonId(null);
    setBroadcastBlockId(null);
    setBroadcastStudyLoading(true);
    setBroadcastMessage(null);
    try {
      const detail = await fetchClassroomStudy(context, studyId);
      const lessons = (detail.lessons ?? []).map((lesson) => ({
        ...lesson,
        blocks: (lesson.blocks ?? []).filter((block) => block.type === 'INTERACTIVE' || block.type === 'MCQ'),
      }));
      if (!mounted.current) return;
      const allBlocks = lessons.flatMap((lesson) => lesson.blocks);
      setBroadcastLessons(lessons);
      setBroadcastLessonId(lessons.length ? 'ALL' : null);
      setBroadcastBlockId(allBlocks[0]?.id ?? null);
      if (!allBlocks.length) setBroadcastMessage('This study has no MCQ or Interactive blocks to broadcast.');
    } catch (caught) {
      if (mounted.current) setBroadcastMessage(classroomErrorMessage(caught));
    } finally {
      if (mounted.current) setBroadcastStudyLoading(false);
    }
  }

  function selectBroadcastLesson(lessonId: number | 'ALL') {
    const blocks = lessonId === 'ALL'
      ? broadcastLessons.flatMap((lesson) => lesson.blocks)
      : broadcastLessons.find((lesson) => lesson.id === lessonId)?.blocks ?? [];
    setBroadcastLessonId(lessonId);
    setBroadcastBlockId(blocks[0]?.id ?? null);
  }

  async function pushNextBroadcastActivity() {
    if (!nextBroadcastBlock) {
      setBroadcastMessage('End of selected lesson reached.');
      return;
    }
    await pushBroadcastBlock(nextBroadcastBlock.id, 'Next activity broadcasted.');
  }

  async function closeActiveBroadcastActivity() {
    const active = activities.activeActivity;
    if (!context || !isCoach || !active || activitySaving) return;
    setActivitySaving(true);
    setBroadcastMessage(null);
    try {
      const summary = await closeClassroomActivity(context, active.id);
      if (!mounted.current) return;
      setActivities(summary);
      setBroadcastMessage('Activity closed.');
    } catch (caught) {
      if (mounted.current) setBroadcastMessage(classroomErrorMessage(caught));
    } finally {
      if (mounted.current) setActivitySaving(false);
    }
  }

  useEffect(() => {
    const active = activities.activeActivity;
    const allStudentsAnswered = Boolean(
      active?.status === 'ACTIVE'
      && (activities.totalParticipants ?? 0) > 0
      && (activities.pendingCount ?? 0) === 0,
    );
    if (!isCoach || !autoAdvanceActivities || !active || !allStudentsAnswered || activitySaving
      || autoAdvancedActivityId.current === active.id) return;

    const nextBlock = getNextActivityBlock(broadcastBlocks, active.sourceBlockId);
    autoAdvancedActivityId.current = active.id;
    const timer = setTimeout(() => {
      void (async () => {
        if (!context) return;
        setActivitySaving(true);
        setBroadcastMessage(null);
        try {
          const closedSummary = await closeClassroomActivity(context, active.id);
          if (!mounted.current) return;
          setActivities(closedSummary);
          if (nextBlock) {
            setActivitySaving(false);
            await pushBroadcastBlock(nextBlock.id, 'All students answered. Next activity broadcasted.');
          } else {
            setBroadcastBlockId(active.sourceBlockId ?? broadcastBlockId);
            setBroadcastMessage('All students answered. End of selected lesson reached.');
          }
        } catch (caught) {
          if (mounted.current) setBroadcastMessage(classroomErrorMessage(caught));
        } finally {
          if (mounted.current) setActivitySaving(false);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [activities, activitySaving, autoAdvanceActivities, broadcastBlockId, broadcastBlocks, context, isCoach, pushBroadcastBlock]);

  async function openMeeting() {
    if (!context || !joined?.joinLink) return;
    const resolvedUrl = resolveAcademyUrl(context.origin, joined.joinLink);
    if (isEmbeddedJitsiUrl(resolvedUrl)) {
      setMeetingActivated(true);
      setMeetingVisible(true);
      return;
    }
    await Linking.openURL(resolvedUrl);
  }

  async function confirmEndClass(sendSummaryEmail: boolean) {
    if (!context || !isCoach || endingClass) return;
    setEndingClass(true);
    setError(null);
    try {
      await endClassroom(context, sessionId, sendSummaryEmail);
      setEndConfirmOpen(false);
      setMeetingVisible(false);
      setClassEnded(true);
    } catch (caught) {
      setEndConfirmOpen(false);
      setError(classroomErrorMessage(caught));
    } finally {
      if (mounted.current) setEndingClass(false);
    }
  }

  async function changeBroadcastMode(nextMode: ClassroomJoin['broadcastMode']) {
    if (!context || !joined || !isCoach || modeSaving || joined.broadcastMode === nextMode) {
      setModePickerOpen(false);
      return;
    }
    setModeSaving(true);
    setError(null);
    try {
      await updateClassroomBroadcastMode(context, sessionId, nextMode);
      const nextJoin = { ...joined, broadcastMode: nextMode };
      joinedRef.current = nextJoin;
      setJoined(nextJoin);
      setModeNotice(`Broadcast mode changed to ${nextMode.replaceAll('_', ' ')}.`);
      setModePickerOpen(false);
    } catch (caught) {
      setError(classroomErrorMessage(caught));
    } finally {
      setModeSaving(false);
    }
  }

  async function submitAnswer(answer: string) {
    const active = activities.activeActivity;
    if (!context || !active || activitySaving) return;
    setActivitySaving(true);
    setActivityError(null);
    try {
      await submitClassroomActivity(context, active.id, answer);
      const summary = await fetchClassroomActivities(context, sessionId);
      if (mounted.current) setActivities(summary);
    } catch (caught) {
      setActivityError(classroomErrorMessage(caught));
      setActivityAttemptVersion((version) => version + 1);
      await syncActivities(context).catch(() => undefined);
    } finally {
      if (mounted.current) setActivitySaving(false);
    }
  }

  function changeBoardTheme(next: BoardThemeName) {
    setBoardTheme(next);
    void saveChessPreferences({ boardTheme: next, pieceTheme });
  }

  function changePieceTheme(next: PieceThemeName) {
    setPieceTheme(next);
    void saveChessPreferences({ boardTheme, pieceTheme: next });
  }

  function openAssignedStudy() {
    if (!assignment) return;
    router.push({
      pathname: '/academy/studies/[studyId]',
      params: {
        lessonId: assignment.lessonId ? String(assignment.lessonId) : '',
        liveSessionId: String(sessionId),
        studyId: String(assignment.studyId),
        studyVersionId: assignment.studyVersionId ? String(assignment.studyVersionId) : '',
      },
    } as Href);
  }

  if (loading) {
    return (
      <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
        <CivBackdrop />
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <PlayScreenHeader showSettings={false} title="Join Class" />
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.goldLight} size="large" />
            <Text style={styles.loadingText}>Entering the royal classroom...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error && !joined) {
    return (
      <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
        <CivBackdrop />
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
          <PlayScreenHeader showSettings={false} title="Join Class" />
          <View style={styles.loadingState}>
            <SymbolView name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }} size={42} tintColor={colors.danger} />
            <Text style={styles.errorTitle}>Unable to join class</Text>
            <Text style={styles.errorCopy}>{error}</Text>
            <Pressable onPress={() => void loadClassroom()} style={styles.retryButton}>
              <Text style={styles.retryText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const multiStudyMode = joined?.broadcastMode === 'MULTI_STUDY';
  const activeActivity = multiStudyMode ? null : activities.activeActivity;

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader
          rightAction={{
            accessibilityLabel: 'Open classroom menu',
            icon: { android: 'menu', ios: 'line.3.horizontal', web: 'menu' },
            onPress: () => setOptionsOpen(true),
          }}
          showSettings={false}
          title="Live Class"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadClassroom(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {error ? <View style={styles.warning}><Text style={styles.warningText}>{error}</Text></View> : null}
          {modeNotice ? <Pressable onPress={() => setModeNotice(null)} style={styles.modeNotice}><Text style={styles.modeNoticeText}>{modeNotice}</Text><Text style={styles.modeNoticeDismiss}>DISMISS</Text></Pressable> : null}

          {isCoach ? (
            <Pressable
              accessibilityLabel="Choose broadcast mode"
              disabled={modeSaving}
              onPress={() => setModePickerOpen(true)}
              style={({ pressed }) => [styles.modeSelector, modeSaving && styles.disabled, pressed && styles.pressed]}>
              <View style={styles.headingCopy}>
                <Text style={styles.modeSelectorLabel}>BROADCAST MODE</Text>
                <Text style={styles.modeSelectorValue}>{BROADCAST_MODE_OPTIONS.find((option) => option.value === joined?.broadcastMode)?.label ?? 'Single Study Broadcast'}</Text>
              </View>
              {modeSaving ? <ActivityIndicator color={colors.goldLight} size="small" /> : <SymbolView name={{ android: 'arrow_drop_down', ios: 'chevron.down', web: 'arrow_drop_down' }} size={24} tintColor={colors.goldLight} />}
            </Pressable>
          ) : null}

          {isCoach && joined?.broadcastMode === 'SINGLE_STUDY' ? (
            <CoachSingleStudyControls
              activeActivity={activities.activeActivity}
              autoAdvance={autoAdvanceActivities}
              blockId={broadcastBlockId}
              blocks={broadcastBlocks}
              lessonId={broadcastLessonId}
              lessons={broadcastLessons}
              loading={broadcastStudyLoading}
              now={now}
              onChangeAutoAdvance={setAutoAdvanceActivities}
              onCloseActivity={() => void closeActiveBroadcastActivity()}
              onSelectBlock={setBroadcastBlockId}
              onSelectLesson={selectBroadcastLesson}
              onSelectStudy={(studyId) => void selectBroadcastStudy(studyId)}
              saving={activitySaving}
              studies={broadcastStudies}
              studyId={broadcastStudyId}
            />
          ) : null}

          {multiStudyMode ? (
            <View style={styles.multiStudyPanel}>
              <RoyalCorners />
              <Text style={styles.eyebrow}>MULTI STUDY BROADCAST</Text>
              <Text style={styles.panelTitle}>{assignment?.studyTitle || 'Waiting for your study'}</Text>
              <Text style={styles.multiStudyCopy}>{assignment ? 'Open the assigned study in LiveClassMode. Your coach can follow your progress but cannot control your board.' : 'Your coach has not assigned an individual study yet.'}</Text>
              {assignment ? <Pressable onPress={openAssignedStudy} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}><Text style={styles.submitText}>OPEN ASSIGNED STUDY</Text></Pressable> : null}
            </View>
          ) : activeActivity ? (
            <>
              {!isCoach && activityError ? <View style={styles.warning}><Text style={styles.warningText}>{activityError}</Text></View> : null}
              <ActivityPanel
                key={`activity-${activeActivity.id}-${activityAttemptVersion}`}
                activity={activeActivity}
                boardSize={boardSize}
                boardTheme={boardTheme}
                now={now}
                onSubmit={(answer) => { if (!isCoach) void submitAnswer(answer); }}
                pieceTheme={pieceTheme}
                readOnly={isCoach}
                saving={activitySaving}
              />
            </>
          ) : (
            <View style={styles.boardPanel}>
              {context ? (
                <BroadcastBoardWorkspace
                  activities={activities}
                  board={board}
                  boardSize={boardSize}
                  boardTheme={boardTheme}
                  context={context}
                  isCoach={isCoach}
                  onBoardChange={setBoard}
                  pieceTheme={pieceTheme}
                  sessionId={sessionId}
                />
              ) : null}
            </View>
          )}

          {assignment && !multiStudyMode ? (
            <Pressable onPress={openAssignedStudy} style={({ pressed }) => [styles.assignmentPanel, pressed && styles.pressed]}>
              <SymbolView name={{ android: 'menu_book', ios: 'book.closed.fill', web: 'menu_book' }} size={28} tintColor={colors.goldLight} />
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>COACH ASSIGNMENT</Text>
                <Text style={styles.assignmentTitle}>{assignment.studyTitle}</Text>
                <Text style={styles.assignmentCopy}>{assignment.lessonTitle || 'Open the assigned live study'}</Text>
              </View>
              <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={22} tintColor={colors.sandstone} />
            </Pressable>
          ) : null}

        </ScrollView>
        <Modal animationType="fade" onRequestClose={() => toolPanel ? setToolPanel(null) : setOptionsOpen(false)} presentationStyle="overFullScreen" transparent visible={optionsOpen}>
          <Pressable onPress={() => { setOptionsOpen(false); setToolPanel(null); }} style={styles.sideMenuBackdrop}>
            <Pressable style={styles.sideMenuPanel}>
              <View style={styles.sideMenuHeader}>
                {toolPanel ? (
                  <Pressable accessibilityLabel="Back to classroom options" onPress={() => setToolPanel(null)} style={styles.sideMenuClose}>
                    <SymbolView name={{ android: 'arrow_back', ios: 'arrow.left', web: 'arrow_back' }} size={20} tintColor={colors.goldLight} />
                  </Pressable>
                ) : null}
                <View style={styles.headingCopy}><Text style={styles.eyebrow}>CLASSROOM</Text><Text style={styles.panelTitle}>{toolPanel === 'leaderboard' ? 'Leaderboard' : toolPanel === 'participants' ? 'Participants' : toolPanel === 'history' ? 'Activity History' : toolPanel === 'homework' ? 'Homework' : toolPanel === 'studyBroadcast' ? 'Study Broadcast' : 'Options'}</Text></View>
                <Pressable accessibilityLabel="Close options" onPress={() => { setOptionsOpen(false); setToolPanel(null); }} style={styles.sideMenuClose}>
                  <SymbolView name={{ android: 'close', ios: 'xmark', web: 'close' }} size={20} tintColor={colors.goldLight} />
                </Pressable>
              </View>
              {toolPanel === 'studyBroadcast' ? (
                <StudyBroadcastPanel
                  activeActivity={activities.activeActivity}
                  blockId={broadcastBlockId}
                  blocks={broadcastBlocks}
                  loading={broadcastStudyLoading}
                  message={broadcastMessage}
                  onPush={() => { if (broadcastBlockId) void pushBroadcastBlock(broadcastBlockId); }}
                  onPushNext={() => void pushNextBroadcastActivity()}
                  pendingCount={activities.pendingCount ?? 0}
                  saving={activitySaving}
                  totalParticipants={activities.totalParticipants ?? 0}
                />
              ) : toolPanel ? (
                <ClassroomSidePanelContent activities={activities} homework={homework} panel={toolPanel} presence={presence} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {joined?.joinLink ? <OptionItem icon={{ android: 'videocam', ios: 'video.fill', web: 'videocam' }} label="Meeting" onPress={() => { setOptionsOpen(false); void openMeeting(); }} /> : null}
                  <OptionItem icon={{ android: 'palette', ios: 'paintpalette.fill', web: 'palette' }} label="Theme" onPress={() => { setOptionsOpen(false); setThemePickerOpen(true); }} />
                  {isCoach && joined?.broadcastMode === 'SINGLE_STUDY' ? <OptionItem icon={{ android: 'menu_book', ios: 'books.vertical.fill', web: 'menu_book' }} label="Study Broadcast" onPress={() => setToolPanel('studyBroadcast')} /> : null}
                  {!multiStudyMode ? <OptionItem icon={{ android: 'emoji_events', ios: 'trophy.fill', web: 'emoji_events' }} label="Leaderboard" onPress={() => setToolPanel('leaderboard')} /> : null}
                  <OptionItem icon={{ android: 'groups', ios: 'person.3.fill', web: 'groups' }} label="Participants" onPress={() => setToolPanel('participants')} />
                  {!multiStudyMode ? <OptionItem icon={{ android: 'history', ios: 'clock.arrow.circlepath', web: 'history' }} label="Activity History" onPress={() => setToolPanel('history')} /> : null}
                  <OptionItem icon={{ android: 'assignment', ios: 'list.clipboard.fill', web: 'assignment' }} label="Homework" onPress={() => setToolPanel('homework')} />
                  <OptionItem
                    danger={isCoach}
                    icon={{ android: isCoach ? 'stop_circle' : 'logout', ios: isCoach ? 'stop.circle.fill' : 'rectangle.portrait.and.arrow.right', web: isCoach ? 'stop_circle' : 'logout' }}
                    label={isCoach ? 'End Class' : 'Leave Class'}
                    onPress={() => {
                      setOptionsOpen(false);
                      if (isCoach) setEndConfirmOpen(true);
                      else router.back();
                    }}
                  />
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>
        <Modal animationType="fade" onRequestClose={() => !modeSaving && setModePickerOpen(false)} transparent visible={modePickerOpen}>
          <Pressable onPress={() => !modeSaving && setModePickerOpen(false)} style={styles.modalBackdrop}>
            <Pressable style={styles.modePickerPanel}>
              <Text style={styles.eyebrow}>TEACHING BOARD</Text>
              <Text style={styles.panelTitle}>Broadcast Mode</Text>
              <Text style={styles.modePickerCopy}>Choose how students should experience this live class.</Text>
              {BROADCAST_MODE_OPTIONS.map((option) => {
                const selectedMode = joined?.broadcastMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    disabled={modeSaving}
                    onPress={() => void changeBroadcastMode(option.value)}
                    style={({ pressed }) => [styles.modePickerOption, selectedMode && styles.modePickerOptionSelected, pressed && styles.pressed]}>
                    <Text style={[styles.modePickerOptionText, selectedMode && styles.modePickerOptionTextSelected]}>{option.label}</Text>
                    {selectedMode ? <SymbolView name={{ android: 'check_circle', ios: 'checkmark.circle.fill', web: 'check_circle' }} size={20} tintColor={colors.goldLight} /> : null}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
        <Modal animationType="fade" onRequestClose={() => !endingClass && setEndConfirmOpen(false)} transparent visible={endConfirmOpen}>
          <View style={styles.modalBackdrop}>
            <View style={styles.confirmPanel}>
              <SymbolView name={{ android: 'warning', ios: 'exclamationmark.triangle.fill', web: 'warning' }} size={38} tintColor={colors.goldLight} />
              <Text style={styles.confirmTitle}>End this class?</Text>
              <Text style={styles.confirmCopy}>Choose whether to send the class summary email. Either option will end the live meeting for all participants.</Text>
              <View style={styles.endClassChoices}>
                <Pressable disabled={endingClass} onPress={() => void confirmEndClass(false)} style={({ pressed }) => [styles.endButton, endingClass && styles.disabled, pressed && styles.pressed]}><Text style={styles.endButtonText}>{endingClass ? 'ENDING…' : 'END CLASS'}</Text></Pressable>
                <Pressable disabled={endingClass} onPress={() => void confirmEndClass(true)} style={({ pressed }) => [styles.endEmailButton, endingClass && styles.disabled, pressed && styles.pressed]}>
                  <SymbolView name={{ android: 'mail', ios: 'envelope.fill', web: 'mail' }} size={17} tintColor={colors.cream} />
                  <Text style={styles.endButtonText}>{endingClass ? 'ENDING…' : 'END CLASS AND SEND EMAIL'}</Text>
                </Pressable>
                <Pressable disabled={endingClass} onPress={() => setEndConfirmOpen(false)} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}><Text style={styles.cancelText}>CANCEL</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal animationType="fade" onRequestClose={() => router.replace(dashboardHref)} transparent visible={classEnded}>
          <View style={styles.modalBackdrop}><View style={styles.endedPanel}><SymbolView name={{ android: 'event_busy', ios: 'checkmark.seal.fill', web: 'event_busy' }} size={40} tintColor={colors.goldLight} /><Text style={styles.errorTitle}>Class session has ended</Text><Text style={styles.errorCopy}>The live class and meeting have ended.</Text><Pressable onPress={() => router.replace(dashboardHref)} style={styles.retryButton}><Text style={styles.retryText}>DONE</Text></Pressable></View></View>
        </Modal>
        <ChessThemePicker boardTheme={boardTheme} onChangeBoardTheme={changeBoardTheme} onChangePieceTheme={changePieceTheme} onClose={() => setThemePickerOpen(false)} pieceTheme={pieceTheme} visible={themePickerOpen} />
        {meetingActivated && meetingUrl && !classEnded ? (
          <ClassroomMeetingModal
            onHide={() => setMeetingVisible(false)}
            title={params.batchName || 'Live Class'}
            url={meetingUrl}
            visible={meetingVisible}
          />
        ) : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

function CoachSingleStudyControls({
  activeActivity,
  autoAdvance,
  blockId,
  blocks,
  lessonId,
  lessons,
  loading,
  now,
  onChangeAutoAdvance,
  onCloseActivity,
  onSelectBlock,
  onSelectLesson,
  onSelectStudy,
  saving,
  studies,
  studyId,
}: {
  activeActivity?: ClassroomActivity | null;
  autoAdvance: boolean;
  blockId: number | null;
  blocks: ClassroomStudyBlock[];
  lessonId: number | 'ALL' | null;
  lessons: ClassroomStudyLesson[];
  loading: boolean;
  now: number;
  onChangeAutoAdvance: (value: boolean) => void;
  onCloseActivity: () => void;
  onSelectBlock: (blockId: number) => void;
  onSelectLesson: (lessonId: number | 'ALL') => void;
  onSelectStudy: (studyId: number) => void;
  saving: boolean;
  studies: ClassroomStudy[];
  studyId: number | null;
}) {
  const [picker, setPicker] = useState<'block' | 'lesson' | 'study' | null>(null);
  const selectedStudy = studies.find((study) => study.id === studyId);
  const selectedLesson = lessonId === 'ALL'
    ? { title: 'All Lessons' }
    : lessons.find((lesson) => lesson.id === lessonId);
  const selectedBlock = blocks.find((block) => block.id === blockId);
  const choices = picker === 'study'
    ? studies.map((study) => ({ id: study.id, label: study.title }))
    : picker === 'lesson' ? [
        ...(lessons.length ? [{ id: 'ALL' as const, label: 'All Lessons' }] : []),
        ...lessons.map((lesson) => ({ id: lesson.id, label: `${lesson.title} (${lesson.blocks.length})` })),
      ] : blocks.map((block) => ({ id: block.id, label: `${block.type} - ${block.title}` }));

  return (
    <View style={styles.singleStudyControls}>
      <View style={styles.singleStudySelectors}>
        <CompactBroadcastSelector label="STUDY" onPress={() => setPicker('study')} value={selectedStudy?.title || 'Select study'} />
        <CompactBroadcastSelector disabled={!lessons.length || loading} label="LESSON" onPress={() => setPicker('lesson')} value={selectedLesson?.title || 'Select lesson'} />
      </View>
      <View style={styles.singleStudyBlockSelector}><CompactBroadcastSelector disabled={!blocks.length || loading} label="BLOCK" onPress={() => setPicker('block')} value={selectedBlock ? `${selectedBlock.type} - ${selectedBlock.title}` : 'Select block'} /></View>
      {loading ? <View style={styles.studyLoading}><ActivityIndicator color={colors.goldLight} size="small" /><Text style={styles.studentScoreCopy}>Loading lessons...</Text></View> : null}
      <View style={styles.singleStudyStatusRow}>
        <View style={styles.singleStudyAutoCopy}><Text style={styles.autoAdvanceTitle}>Auto-advance</Text><Text style={styles.autoAdvanceCopy}>After all students answer</Text></View>
        <Switch onValueChange={onChangeAutoAdvance} thumbColor={autoAdvance ? colors.goldLight : '#9ca3af'} trackColor={{ false: '#273444', true: '#8c6417' }} value={autoAdvance} />
        <View style={styles.singleStudyTimer}><Text style={styles.singleStudyTimerLabel}>COUNTDOWN</Text><Text style={styles.singleStudyTimerValue}>{activeActivity ? countdown(activeActivity.endsAt, now) ?? '--:--' : '--:--'}</Text></View>
        <Pressable disabled={!activeActivity || saving} onPress={onCloseActivity} style={({ pressed }) => [styles.closeActivityButton, (!activeActivity || saving) && styles.disabled, pressed && styles.pressed]}>
          <SymbolView name={{ android: 'stop_circle', ios: 'stop.circle.fill', web: 'stop_circle' }} size={17} tintColor="#fecdd3" />
          <Text style={styles.closeActivityText}>CLOSE</Text>
        </Pressable>
      </View>
      <Modal animationType="fade" onRequestClose={() => setPicker(null)} transparent visible={picker !== null}>
        <Pressable onPress={() => setPicker(null)} style={styles.modalBackdrop}>
          <Pressable style={styles.studyPickerPanel}>
            <Text style={styles.eyebrow}>SINGLE STUDY BROADCAST</Text>
            <Text style={styles.selectorPickerTitle}>Choose {picker}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.studyPickerList}>
              {!choices.length ? <Text style={styles.emptyCopy}>No choices are available.</Text> : choices.map((choice) => (
                <Pressable
                  key={`${picker}-${choice.id}`}
                  onPress={() => {
                    if (picker === 'study') onSelectStudy(Number(choice.id));
                    else if (picker === 'lesson') onSelectLesson(choice.id === 'ALL' ? 'ALL' : Number(choice.id));
                    else onSelectBlock(Number(choice.id));
                    setPicker(null);
                  }}
                  style={({ pressed }) => [styles.selectorChoice, pressed && styles.pressed]}>
                  <Text style={styles.selectorChoiceText}>{choice.label}</Text>
                  <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={17} tintColor={colors.sandstone} />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setPicker(null)} style={styles.selectorCancel}><Text style={styles.cancelText}>CANCEL</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CompactBroadcastSelector({ disabled = false, label, onPress, value }: { disabled?: boolean; label: string; onPress: () => void; value: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.compactBroadcastSelector, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.headingCopy}><Text style={styles.broadcastSelectorLabel}>{label}</Text><Text numberOfLines={1} style={styles.compactBroadcastValue}>{value}</Text></View>
      <SymbolView name={{ android: 'arrow_drop_down', ios: 'chevron.down', web: 'arrow_drop_down' }} size={19} tintColor={colors.goldLight} />
    </Pressable>
  );
}

function StudyBroadcastPanel({
  activeActivity,
  blockId,
  blocks,
  loading,
  message,
  onPush,
  onPushNext,
  pendingCount,
  saving,
  totalParticipants,
}: {
  activeActivity?: ClassroomActivity | null;
  blockId: number | null;
  blocks: ClassroomStudyBlock[];
  loading: boolean;
  message: string | null;
  onPush: () => void;
  onPushNext: () => void;
  pendingCount: number;
  saving: boolean;
  totalParticipants: number;
}) {
  const nextBlock = getNextActivityBlock(blocks, blockId);

  return (
    <ScrollView contentContainerStyle={styles.studyBroadcastContent} showsVerticalScrollIndicator={false}>
      {message ? <View style={styles.broadcastMessage}><Text style={styles.broadcastMessageText}>{message}</Text></View> : null}
      {loading ? <View style={styles.studyLoading}><ActivityIndicator color={colors.goldLight} size="small" /><Text style={styles.studentScoreCopy}>Loading study lessons...</Text></View> : null}

      <View style={styles.broadcastActions}>
        <Pressable disabled={!blockId || saving || loading} onPress={onPush} style={({ pressed }) => [styles.broadcastPush, (!blockId || saving || loading) && styles.disabled, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator color={colors.cream} size="small" /> : <SymbolView name={{ android: 'send', ios: 'paperplane.fill', web: 'send' }} size={17} tintColor={colors.cream} />}
          <Text style={styles.broadcastPushText}>PUSH</Text>
        </Pressable>
        <Pressable disabled={!nextBlock || saving || loading} onPress={onPushNext} style={({ pressed }) => [styles.broadcastNext, (!nextBlock || saving || loading) && styles.disabled, pressed && styles.pressed]}>
          <SymbolView name={{ android: 'skip_next', ios: 'forward.end.fill', web: 'skip_next' }} size={18} tintColor={colors.goldLight} />
          <Text style={styles.broadcastNextText}>NEXT</Text>
        </Pressable>
      </View>

      {activeActivity ? (
        <View style={styles.liveActivityCard}>
          <View style={styles.liveActivityHeading}><View style={styles.liveActivityDot} /><Text style={styles.liveActivityLabel}>LIVE NOW</Text></View>
          <Text numberOfLines={2} style={styles.liveActivityTitle}>{activeActivity.title}</Text>
          <Text style={styles.liveActivityMeta}>{Math.max(0, totalParticipants - pendingCount)} answered · {pendingCount} pending</Text>
        </View>
      ) : <Text style={styles.emptyCopy}>Select a study activity and push it to the students.</Text>}
    </ScrollView>
  );
}

function ClassroomSidePanelContent({
  activities,
  homework,
  panel,
  presence,
}: {
  activities: ClassroomActivitySummary;
  homework: ClassroomHomework[];
  panel: Exclude<ClassroomToolPanel, 'studyBroadcast'>;
  presence: ClassroomPresenceSummary;
}) {
  return (
    <ScrollView contentContainerStyle={styles.sideToolContent} showsVerticalScrollIndicator={false}>
      {panel === 'leaderboard' ? (
        <>
          <Text style={styles.sideToolMeta}>{activities.totalParticipants ?? 0} students</Text>
          {activities.leaderboard.length ? activities.leaderboard.slice(0, 20).map((entry, index) => (
            <View key={entry.studentUserId} style={styles.leaderboardRow}><Text style={[styles.rank, index < 3 && styles.topRank]}>{index + 1}</Text><View style={styles.headingCopy}><Text numberOfLines={1} style={styles.studentName}>{entry.studentName}</Text><Text style={styles.studentScoreCopy}>{entry.correctAnswers} correct · {entry.answered} answered</Text></View><Text style={styles.score}>{entry.score}</Text></View>
          )) : <Text style={styles.emptyCopy}>Scores will appear after the first live activity.</Text>}
        </>
      ) : panel === 'participants' ? (
        <>
          <Text style={styles.sideToolMeta}>{presence.activeCount} active</Text>
          {presence.participants.length ? presence.participants.map((participant) => (
            <View key={`${participant.role}-${participant.userId}`} style={styles.leaderboardRow}><View style={[styles.presenceDot, participant.status === 'ACTIVE' ? styles.presenceActive : participant.status === 'AWAY' ? styles.presenceAway : styles.presenceDisconnected]} /><View style={styles.headingCopy}><Text style={styles.studentName}>{participant.displayName}</Text><Text style={styles.studentScoreCopy}>{participant.role} · {participant.status}</Text></View><Text style={styles.presenceTime}>{Math.floor(participant.activeSeconds / 60)}m</Text></View>
          )) : <Text style={styles.emptyCopy}>No participants are connected.</Text>}
        </>
      ) : panel === 'history' ? (
        activities.activities.length ? activities.activities.map((activity) => (
          <View key={activity.id} style={styles.historyRow}><View style={styles.headingCopy}><Text style={styles.studentName}>{activity.title}</Text><Text style={styles.studentScoreCopy}>{activity.type} · {activity.status}</Text></View><Text style={[styles.historyResult, activity.myResponse?.correct ? styles.historyCorrect : styles.historyPending]}>{activity.myResponse ? activity.myResponse.correct ? `+${activity.myResponse.score}` : '0' : '—'}</Text></View>
        )) : <Text style={styles.emptyCopy}>No activities have been broadcast yet.</Text>
      ) : homework.length ? homework.map((item) => (
        <View key={item.id} style={styles.historyRow}><View style={styles.headingCopy}><Text style={styles.studentName}>{item.title}</Text><Text style={styles.studentScoreCopy}>Due {new Date(item.dueAt).toLocaleString()} · {item.completedItems}/{item.totalItems} complete</Text></View><Text style={styles.homeworkStatus}>{item.status}</Text></View>
      )) : <Text style={styles.emptyCopy}>No homework has been assigned from this class yet.</Text>}
    </ScrollView>
  );
}

function OptionItem({ danger = false, icon, label, onPress }: { danger?: boolean; icon: ComponentProps<typeof SymbolView>['name']; label: string; onPress: () => void }) {
  const tint = danger ? '#fda4af' : colors.goldLight;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}><View style={[styles.optionIcon, danger && styles.optionIconDanger]}><SymbolView name={icon} size={20} tintColor={tint} /></View><Text style={[styles.optionItemText, danger && styles.optionItemDangerText]}>{label}</Text><SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={18} tintColor={danger ? '#fda4af' : colors.sandstone} /></Pressable>;
}

const styles = StyleSheet.create({
  activityCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginBottom: 14, marginTop: 7 },
  activityHint: { color: colors.sandstone, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  activityPanel: { backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 14 },
  activityCompletedLabel: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  activityEmptyText: { color: colors.muted, fontSize: 10, lineHeight: 16, paddingVertical: 12, textAlign: 'center' },
  activityPendingLabel: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  activityStatusCount: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900' },
  activityStatusHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, padding: 11 },
  activityStatusTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 13, fontWeight: '900', marginTop: 3 },
  activityStudentName: { color: colors.cream, flex: 1, fontSize: 11, fontWeight: '800' },
  activityStudentPending: { color: colors.goldLight, fontSize: 8, fontWeight: '800' },
  activityStudentResult: { color: '#a7f3d0', fontSize: 8, fontWeight: '800' },
  activityStudentRow: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.07)', borderTopWidth: 1, flexDirection: 'row', gap: 8, minHeight: 39, paddingHorizontal: 4 },
  activityStudentSection: { borderTopColor: 'rgba(211,165,55,0.18)', borderTopWidth: 1, padding: 10 },
  assignmentCopy: { color: colors.muted, fontSize: 10, marginTop: 3 },
  assignmentPanel: { alignItems: 'center', backgroundColor: 'rgba(8, 21, 28, 0.96)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 14, padding: 15 },
  assignmentTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '900', marginTop: 3 },
  background: { flex: 1 },
  boardPanel: { alignItems: 'center', backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, paddingBottom: 15, paddingTop: 15 },
  boardWrap: { alignItems: 'center', marginHorizontal: -14, marginTop: 13 },
  autoAdvanceCopy: { color: colors.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  autoAdvanceRow: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, marginTop: 12, padding: 11 },
  autoAdvanceTitle: { color: colors.cream, fontSize: 11, fontWeight: '800' },
  broadcastActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  broadcastMessage: { backgroundColor: 'rgba(201,143,28,0.13)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, marginBottom: 10, padding: 9 },
  broadcastMessageText: { color: colors.goldLight, fontSize: 9, lineHeight: 14 },
  broadcastNext: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44 },
  broadcastNextText: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  broadcastPush: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44 },
  broadcastPushText: { color: colors.cream, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  broadcastSelector: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginBottom: 9, minHeight: 57, paddingHorizontal: 11, paddingVertical: 8 },
  broadcastSelectorLabel: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  broadcastSelectorValue: { color: colors.cream, fontFamily: 'serif', fontSize: 12, fontWeight: '800', lineHeight: 16, marginTop: 3 },
  broadcastWorkspace: { alignItems: 'center', width: '100%' },
  classPanel: { backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 15, padding: 16 },
  classRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  classTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 3 },
  closeActivityButton: { alignItems: 'center', backgroundColor: 'rgba(190,18,60,0.13)', borderColor: 'rgba(251,113,133,0.4)', borderRadius: 8, borderWidth: 1, gap: 2, justifyContent: 'center', minHeight: 43, paddingHorizontal: 8 },
  closeActivityText: { color: '#fecdd3', fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  compactBroadcastSelector: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border, borderRadius: 9, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 9 },
  compactBroadcastValue: { color: colors.cream, fontFamily: 'serif', fontSize: 11, fontWeight: '800', marginTop: 2 },
  classroomEngine: { borderColor: colors.border, borderRadius: 11, borderWidth: 1, marginTop: 10, overflow: 'hidden', width: '94%' },
  classroomActivityStatus: { borderColor: colors.border, borderRadius: 11, borderWidth: 1, marginTop: 10, overflow: 'hidden', width: '94%' },
  classroomEngineLine: { alignItems: 'center', borderTopColor: 'rgba(211,165,55,0.2)', borderTopWidth: 1, flexDirection: 'row', gap: 6, height: 34, paddingHorizontal: 8 },
  classroomNavButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 7, borderWidth: 1, height: 34, justifyContent: 'center', width: 36 },
  classroomNavigation: { alignItems: 'center', borderTopColor: 'rgba(211,165,55,0.2)', borderTopWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 8 },
  cancelButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 45, width: '100%' },
  cancelText: { color: colors.sandstone, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  confirmCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 9, textAlign: 'center' },
  confirmPanel: { alignItems: 'center', backgroundColor: colors.navy, borderColor: colors.gold, borderRadius: 18, borderWidth: 1, maxWidth: 380, padding: 23, width: '90%' },
  confirmTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 13 },
  content: { paddingBottom: 90, paddingHorizontal: 14 },
  disabled: { opacity: 0.48 },
  emptyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingVertical: 16, textAlign: 'center' },
  emptyNotation: { color: colors.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, padding: 12 },
  endButton: { alignItems: 'center', backgroundColor: '#7f1d2d', borderColor: colors.danger, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 45, width: '100%' },
  endButtonText: { color: '#fff1f2', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  endClassChoices: { gap: 10, marginTop: 21, width: '100%' },
  endEmailButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 10, width: '100%' },
  errorCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 300, textAlign: 'center' },
  errorTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 14 },
  endedPanel: { alignItems: 'center', backgroundColor: colors.navy, borderColor: colors.border, borderRadius: 18, borderWidth: 1, maxWidth: 360, padding: 24, width: '88%' },
  engineAssessment: { color: colors.goldLight, fontFamily: 'serif', fontSize: 11, fontWeight: '900', width: 28 },
  engineError: { color: '#fecdd3', fontSize: 9, lineHeight: 13, padding: 8, textAlign: 'center' },
  engineHeader: { alignItems: 'center', backgroundColor: 'rgba(5,14,22,0.9)', flexDirection: 'row', gap: 7, minHeight: 43, paddingHorizontal: 10 },
  engineMeta: { color: colors.muted, flex: 1, fontSize: 8, textAlign: 'right' },
  enginePv: { color: colors.cream, flex: 1, fontFamily: 'monospace', fontSize: 9 },
  engineScore: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 10, fontWeight: '800', width: 42 },
  engineTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  engineWaiting: { color: colors.muted, fontSize: 9, height: 34, lineHeight: 34, paddingHorizontal: 9 },
  evaluationBar: { backgroundColor: '#111827', borderColor: colors.goldDark, borderRadius: 7, borderWidth: 1, height: 18, marginTop: 8, overflow: 'hidden', width: '94%' },
  evaluationLabel: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 9, fontWeight: '900', left: 0, lineHeight: 16, position: 'absolute', right: 0, textAlign: 'center', textShadowColor: '#000', textShadowOffset: { height: 1, width: 0 }, textShadowRadius: 2 },
  evaluationWhite: { backgroundColor: '#e7e5e4', bottom: 0, left: 0, position: 'absolute', top: 0 },
  eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  headingCopy: { flex: 1, minWidth: 0 },
  leaderboardPanel: { backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 15 },
  leaderboardRow: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, flexDirection: 'row', gap: 11, paddingVertical: 11 },
  historyCorrect: { color: colors.success }, historyPending: { color: colors.muted }, historyResult: { fontSize: 15, fontWeight: '900' },
  historyRow: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 12 },
  homeworkStatus: { color: colors.goldLight, fontSize: 8, fontWeight: '900', maxWidth: 75, textAlign: 'right' },
  leaveButton: { alignItems: 'center', borderColor: 'rgba(251, 113, 133, 0.56)', borderRadius: 10, borderWidth: 1, marginTop: 17, paddingVertical: 12 },
  leaveText: { color: '#fecdd3', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  livePulse: { backgroundColor: colors.success, borderRadius: 8, height: 15, width: 15 },
  liveActivityCard: { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.34)', borderRadius: 11, borderWidth: 1, marginTop: 13, padding: 11 },
  liveActivityDot: { backgroundColor: colors.success, borderRadius: 4, height: 8, width: 8 },
  liveActivityHeading: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  liveActivityLabel: { color: '#a7f3d0', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  liveActivityMeta: { color: '#a7f3d0', fontSize: 9, marginTop: 5 },
  liveActivityTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 14, fontWeight: '900', marginTop: 6 },
  liveSeal: { alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.45)', borderRadius: 25, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  loadingState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 25 },
  loadingText: { color: colors.sandstone, fontSize: 12, marginTop: 14 },
  meetingButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 15, paddingHorizontal: 14, paddingVertical: 12 },
  meetingCopy: { color: '#f4d7b4', fontSize: 9, lineHeight: 13, marginTop: 2 },
  meetingTitle: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  modeCopy: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  modePickerCopy: { color: colors.sandstone, fontSize: 10, lineHeight: 15, marginBottom: 13, marginTop: 6 },
  modePickerOption: { alignItems: 'center', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 8, minHeight: 50, paddingHorizontal: 13 },
  modePickerOptionSelected: { backgroundColor: 'rgba(201,143,28,0.14)', borderColor: colors.gold },
  modePickerOptionText: { color: colors.sandstone, flex: 1, fontFamily: 'serif', fontSize: 14, fontWeight: '800' },
  modePickerOptionTextSelected: { color: colors.goldLight },
  modePickerPanel: { backgroundColor: colors.navy, borderColor: colors.gold, borderRadius: 16, borderWidth: 1, maxWidth: 380, padding: 20, width: '90%' },
  modeSelector: { alignItems: 'center', backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 11, borderWidth: 1, flexDirection: 'row', marginTop: 12, minHeight: 55, paddingHorizontal: 14 },
  modeSelectorLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  modeSelectorValue: { color: colors.cream, fontFamily: 'serif', fontSize: 15, fontWeight: '900', marginTop: 3 },
  modeNotice: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.18)', borderColor: colors.gold, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 12, padding: 11 },
  modeNoticeDismiss: { color: colors.goldLight, fontSize: 8, fontWeight: '900' }, modeNoticeText: { color: colors.cream, flex: 1, fontSize: 10 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 20 },
  multiStudyCopy: { color: colors.sandstone, fontSize: 11, lineHeight: 18, marginTop: 9 },
  multiStudyPanel: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 18 },
  moveText: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 11, lineHeight: 17, marginTop: 12, paddingHorizontal: 14, textAlign: 'center' },
  moveNumber: { color: colors.muted, fontFamily: 'monospace', fontSize: 10, textAlign: 'center', width: 32 },
  noMeeting: { color: colors.muted, fontSize: 10, marginTop: 14, textAlign: 'center' },
  notationCell: { borderLeftColor: 'rgba(211,165,55,0.16)', borderLeftWidth: 1, flex: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: 8 },
  notationCellSelected: { backgroundColor: '#2d72d9' },
  notationCellText: { color: colors.cream, fontFamily: 'monospace', fontSize: 11, fontWeight: '700' },
  notationCellTextSelected: { color: '#fff' },
  notationHeader: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.12)', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 35, paddingHorizontal: 10 },
  notationPanel: { borderColor: colors.border, borderRadius: 11, borderWidth: 1, marginTop: 10, overflow: 'hidden', width: '94%' },
  notationPly: { color: colors.muted, fontFamily: 'monospace', fontSize: 9 },
  notationRow: { alignItems: 'stretch', borderBottomColor: 'rgba(211,165,55,0.14)', borderBottomWidth: 1, flexDirection: 'row', minHeight: 34 },
  optionIcon: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.12)', borderColor: 'rgba(201,143,28,0.3)', borderRadius: 9, borderWidth: 1, height: 38, justifyContent: 'center', marginRight: 11, width: 38 },
  optionIconDanger: { backgroundColor: 'rgba(190,18,60,0.12)', borderColor: 'rgba(251,113,133,0.35)' },
  optionItem: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.1)', borderTopWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: 3 },
  optionItemDangerText: { color: '#fecdd3' },
  optionItemText: { color: colors.cream, flex: 1, fontFamily: 'serif', fontSize: 15, fontWeight: '800' },
  optionsButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, optionsPanel: { backgroundColor: colors.navy, borderColor: colors.border, borderRadius: 16, borderWidth: 1, maxWidth: 390, padding: 17, width: '100%' },
  optionButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.13)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 11, paddingHorizontal: 12, paddingVertical: 12 },
  optionMark: { borderColor: colors.sandstone, borderRadius: 8, borderWidth: 1, height: 16, width: 16 },
  optionMarkSelected: { backgroundColor: colors.goldLight, borderColor: colors.goldLight },
  optionSelected: { backgroundColor: 'rgba(201,143,28,0.14)', borderColor: colors.gold },
  optionText: { color: colors.cream, flex: 1, fontSize: 12, lineHeight: 17 },
  optionsList: { gap: 9 },
  panelHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 1, width: '100%' },
  panelTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 19, fontWeight: '900', marginTop: 3 },
  participantCount: { color: colors.muted, fontSize: 9 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  presenceActive: { backgroundColor: colors.success }, presenceAway: { backgroundColor: colors.goldLight }, presenceDisconnected: { backgroundColor: colors.danger }, presenceDot: { borderRadius: 5, height: 10, width: 10 }, presenceTime: { color: colors.sandstone, fontSize: 10 },
  question: { color: colors.cream, fontFamily: 'serif', fontSize: 16, fontWeight: '800', lineHeight: 22, marginBottom: 2 },
  rank: { color: colors.sandstone, fontSize: 15, fontWeight: '900', textAlign: 'center', width: 25 },
  result: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 12, padding: 12 },
  resultCopy: { color: colors.sandstone, fontSize: 9, marginTop: 2 },
  resultCorrect: { backgroundColor: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.45)' },
  resultTitle: { color: colors.cream, fontSize: 12, fontWeight: '900' },
  resultWrong: { backgroundColor: 'rgba(251,113,133,0.09)', borderColor: 'rgba(251,113,133,0.45)' },
  retryButton: { backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 18, paddingHorizontal: 25, paddingVertical: 12 },
  retryText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  safeArea: { flex: 1 },
  score: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900' },
  sectionLabel: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  selectorCancel: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, marginTop: 14, minHeight: 42, justifyContent: 'center' },
  selectorChoice: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.09)', borderBottomWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: 4, paddingVertical: 7 },
  selectorChoiceText: { color: colors.cream, flex: 1, fontFamily: 'serif', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  selectorPickerTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 16, fontWeight: '900', marginBottom: 8, textTransform: 'capitalize' },
  sideMenuBackdrop: { alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)', flex: 1 },
  sideMenuClose: { alignItems: 'center', borderColor: colors.border, borderRadius: 9, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  sideMenuHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 18 },
  sideMenuPanel: { backgroundColor: colors.navy, borderLeftColor: colors.gold, borderLeftWidth: 1, elevation: 24, height: '100%', maxWidth: 320, paddingBottom: 28, paddingHorizontal: 18, paddingTop: 54, shadowColor: '#000', shadowOffset: { height: 0, width: -5 }, shadowOpacity: 0.5, shadowRadius: 16, width: '78%' },
  sideToolContent: { paddingBottom: 24 },
  sideToolMeta: { color: colors.muted, fontSize: 9, marginBottom: 6, textAlign: 'right' },
  singleStudyAutoCopy: { flex: 1, minWidth: 82 },
  singleStudyBlockSelector: { flexDirection: 'row', marginTop: 7 },
  singleStudyControls: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 11, borderWidth: 1, marginTop: 9, padding: 9 },
  singleStudySelectors: { flexDirection: 'row', gap: 7 },
  singleStudyStatusRow: { alignItems: 'center', borderTopColor: 'rgba(211,165,55,0.17)', borderTopWidth: 1, flexDirection: 'row', gap: 7, marginTop: 8, paddingTop: 8 },
  singleStudyTimer: { alignItems: 'center', minWidth: 49 },
  singleStudyTimerLabel: { color: colors.gold, fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  singleStudyTimerValue: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 13, fontWeight: '900', marginTop: 3 },
  studyPickerList: { maxHeight: 410, marginTop: 7 },
  studyPickerPanel: { backgroundColor: colors.navy, borderColor: colors.gold, borderRadius: 16, borderWidth: 1, maxHeight: '80%', maxWidth: 390, padding: 18, width: '92%' },
  studyBroadcastContent: { paddingBottom: 24 },
  studyLoading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 7 },
  studentName: { color: colors.cream, fontSize: 12, fontWeight: '800' },
  studentScoreCopy: { color: colors.muted, fontSize: 9, marginTop: 2 },
  submitButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 3, minHeight: 43 },
  submitText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  syncedBadge: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.4)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  syncedText: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  toolTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 2, flex: 1, minHeight: 38, justifyContent: 'center' }, toolTabActive: { borderBottomColor: colors.goldLight }, toolTabText: { color: colors.muted, fontSize: 9, fontWeight: '800' }, toolTabTextActive: { color: colors.goldLight }, toolTabs: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 14, overflow: 'hidden', paddingHorizontal: 3 },
  timer: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 18, fontWeight: '900' },
  topRank: { color: colors.goldLight },
  turnLabel: { color: colors.cream, fontSize: 8, fontWeight: '800' },
  turnPill: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  workspaceTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 2, flex: 1, justifyContent: 'center', minHeight: 39 },
  workspaceTabActive: { backgroundColor: 'rgba(201,143,28,0.1)', borderBottomColor: colors.goldLight },
  workspaceTabText: { color: colors.muted, fontFamily: 'serif', fontSize: 11, fontWeight: '800' },
  workspaceTabTextActive: { color: colors.goldLight },
  workspaceTabs: { borderColor: colors.border, borderRadius: 9, borderWidth: 1, flexDirection: 'row', marginTop: 9, overflow: 'hidden', width: '94%' },
  warning: { backgroundColor: 'rgba(91,18,27,0.82)', borderColor: colors.danger, borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 11 },
  warningText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
