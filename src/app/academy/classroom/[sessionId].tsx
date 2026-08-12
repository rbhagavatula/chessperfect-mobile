import { Chess, type Square } from 'chess.js';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
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
  fetchClassroomActivities,
  fetchClassroomBoard,
  fetchClassroomPresence,
  fetchClassroomStudyAssignment,
  fetchStudentHomework,
  getClassroomContext,
  isClassroomEndedError,
  joinClassroom,
  lastMoveFromText,
  parseBoardArrows,
  parseBoardSquareHighlights,
  parseMcqOptions,
  resolveAcademyUrl,
  sendClassroomHeartbeat,
  submitClassroomActivity,
  type ClassroomActivity,
  type ClassroomActivitySummary,
  type ClassroomBoard,
  type ClassroomContext,
  type ClassroomJoin,
  type ClassroomHomework,
  type ClassroomPresenceSummary,
  type ClassroomStudyAssignment,
} from '@/lib/classroom';

const initialFen = new Chess().fen();

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

function BroadcastBoard({
  board,
  boardSize,
  boardTheme,
  pieceTheme,
}: {
  board: ClassroomBoard | null;
  boardSize: number;
  boardTheme: BoardThemeName;
  pieceTheme: PieceThemeName;
}) {
  const game = useMemo(() => safeGame(board?.fen), [board?.fen]);
  const lastMove = useMemo(() => lastMoveFromText(board?.moveText), [board?.moveText]);
  const arrows = useMemo(() => parseBoardArrows(board?.arrowsJson), [board?.arrowsJson]);
  const squareHighlights = useMemo(() => parseBoardSquareHighlights(board?.squareHighlightsJson), [board?.squareHighlightsJson]);
  const orientation = board?.orientation?.toLowerCase() === 'black' ? 'black' : 'white';

  return (
    <View style={styles.boardWrap}>
      <NativeChessBoard
        arrows={arrows}
        boardTheme={boardTheme}
        getPiece={(square) => game.get(square as Square) ?? undefined}
        lastMove={lastMove}
        orientation={orientation}
        pieceTheme={pieceTheme}
        size={boardSize}
        squareHighlights={squareHighlights}
      />
    </View>
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
  saving,
}: {
  activity: ClassroomActivity;
  boardSize: number;
  boardTheme: BoardThemeName;
  now: number;
  onSubmit: (answer: string) => void;
  pieceTheme: PieceThemeName;
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
      {activity.type === 'INTERACTIVE' && activity.interactiveStartFen ? (
            <InteractiveActivity
              key={`interactive-${activity.id}`}
          activity={activity}
          boardSize={boardSize}
          boardTheme={boardTheme}
          disabled={saving}
          onSubmit={onSubmit}
          pieceTheme={pieceTheme}
        />
      ) : response ? null : (
        <View style={styles.optionsList}>
          <Text style={styles.question}>{activity.mcqQuestionText || 'Choose your answer'}</Text>
          {options.map((option) => (
            <Pressable
              key={option.id}
              disabled={saving}
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
          <Pressable
            disabled={!selectedOption || saving}
            onPress={() => selectedOption && onSubmit(selectedOption)}
            style={({ pressed }) => [styles.submitButton, (!selectedOption || saving) && styles.disabled, pressed && styles.pressed]}>
            {saving ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.submitText}>SUBMIT ANSWER</Text>}
          </Pressable>
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
  const [toolPanel, setToolPanel] = useState<'history' | 'homework' | 'leaderboard' | 'participants' | null>('leaderboard');
  const [now, setNow] = useState(0);
  const mounted = useRef(true);
  const boardSyncing = useRef(false);
  const activitySyncing = useRef(false);
  const joinedRef = useRef<ClassroomJoin | null>(null);

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
      const [nextBoard, nextActivities, nextAssignment, nextPresence, nextHomework, preferences] = await Promise.all([
        fetchClassroomBoard(activeContext, sessionId),
        fetchClassroomActivities(activeContext, sessionId),
        fetchClassroomStudyAssignment(activeContext, sessionId).catch(() => null),
        fetchClassroomPresence(activeContext, sessionId),
        fetchStudentHomework(activeContext).catch(() => []),
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
          joinedRef.current = nextJoin;
          setJoined(nextJoin);
        })
        .catch((caught) => {
          if (!mounted.current) return;
          if (isClassroomEndedError(caught)) setClassEnded(true);
          else setError(classroomErrorMessage(caught));
        });
    }, 12_000);
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

  async function openMeeting() {
    if (!context || !joined?.joinLink) return;
    await WebBrowser.openBrowserAsync(resolveAcademyUrl(context.origin, joined.joinLink), { createTask: false });
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
        <PlayScreenHeader showSettings={false} title="Live Class" />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadClassroom(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          <View style={styles.classPanel}>
            <RoyalCorners />
            <View style={styles.classRow}>
              <View style={styles.liveSeal}>
                <View style={styles.livePulse} />
              </View>
              <View style={styles.headingCopy}>
                <Text style={styles.eyebrow}>CLASS IS LIVE</Text>
                <Text numberOfLines={2} style={styles.classTitle}>{params.batchName || 'Academy Classroom'}</Text>
                <Text style={styles.modeCopy}>{joined?.broadcastMode?.replaceAll('_', ' ') || 'CLASSROOM'} MODE</Text>
              </View>
              <Pressable accessibilityLabel="Classroom options" onPress={() => setOptionsOpen(true)} style={styles.optionsButton}>
                <SymbolView name={{ android: 'more_vert', ios: 'ellipsis.circle.fill', web: 'more_vert' }} size={23} tintColor={colors.goldLight} />
              </Pressable>
            </View>
            {joined?.joinLink ? (
              <Pressable onPress={() => void openMeeting()} style={({ pressed }) => [styles.meetingButton, pressed && styles.pressed]}>
                <SymbolView name={{ android: 'videocam', ios: 'video.fill', web: 'videocam' }} size={21} tintColor={colors.cream} />
                <View style={styles.headingCopy}>
                  <Text style={styles.meetingTitle}>OPEN AUDIO & VIDEO</Text>
                  <Text style={styles.meetingCopy}>The classroom stays active while the meeting opens separately.</Text>
                </View>
              </Pressable>
            ) : (
              <Text style={styles.noMeeting}>Audio and video are not configured for this class.</Text>
            )}
          </View>

          {error ? <View style={styles.warning}><Text style={styles.warningText}>{error}</Text></View> : null}
          {modeNotice ? <Pressable onPress={() => setModeNotice(null)} style={styles.modeNotice}><Text style={styles.modeNoticeText}>{modeNotice}</Text><Text style={styles.modeNoticeDismiss}>DISMISS</Text></Pressable> : null}

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
              {activityError ? <View style={styles.warning}><Text style={styles.warningText}>{activityError}</Text></View> : null}
              <ActivityPanel
                key={`activity-${activeActivity.id}-${activityAttemptVersion}`}
                activity={activeActivity}
                boardSize={boardSize}
                boardTheme={boardTheme}
                now={now}
                onSubmit={(answer) => void submitAnswer(answer)}
                pieceTheme={pieceTheme}
                saving={activitySaving}
              />
            </>
          ) : (
            <View style={styles.boardPanel}>
              <View style={styles.panelHeadingRow}>
                <View style={styles.headingCopy}>
                  <Text style={styles.eyebrow}>COACH BOARD</Text>
                  <Text style={styles.panelTitle}>Follow the position</Text>
                </View>
                <View style={styles.syncedBadge}><Text style={styles.syncedText}>LIVE</Text></View>
              </View>
              <BroadcastBoard board={board} boardSize={boardSize} boardTheme={boardTheme} pieceTheme={pieceTheme} />
              <Text numberOfLines={3} style={styles.moveText}>{board?.moveText?.trim() || 'Waiting for the coach to share a position...'}</Text>
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

          <View style={styles.toolTabs}>
            {!multiStudyMode ? <ToolTab active={toolPanel === 'leaderboard'} label="Scores" onPress={() => setToolPanel(toolPanel === 'leaderboard' ? null : 'leaderboard')} /> : null}
            <ToolTab active={toolPanel === 'participants'} label="Class" onPress={() => setToolPanel(toolPanel === 'participants' ? null : 'participants')} />
            {!multiStudyMode ? <ToolTab active={toolPanel === 'history'} label="History" onPress={() => setToolPanel(toolPanel === 'history' ? null : 'history')} /> : null}
            <ToolTab active={toolPanel === 'homework'} label="Homework" onPress={() => setToolPanel(toolPanel === 'homework' ? null : 'homework')} />
          </View>

          {toolPanel === 'leaderboard' && !multiStudyMode ? (
            <View style={styles.leaderboardPanel}>
              <View style={styles.panelHeadingRow}><View style={styles.headingCopy}><Text style={styles.eyebrow}>CLASS CHALLENGE</Text><Text style={styles.panelTitle}>Leaderboard</Text></View><Text style={styles.participantCount}>{activities.totalParticipants ?? 0} students</Text></View>
              {activities.leaderboard.length ? activities.leaderboard.slice(0, 10).map((entry, index) => (
                <View key={entry.studentUserId} style={styles.leaderboardRow}><Text style={[styles.rank, index < 3 && styles.topRank]}>{index + 1}</Text><View style={styles.headingCopy}><Text numberOfLines={1} style={styles.studentName}>{entry.studentName}</Text><Text style={styles.studentScoreCopy}>{entry.correctAnswers} correct · {entry.answered} answered</Text></View><Text style={styles.score}>{entry.score}</Text></View>
              )) : <Text style={styles.emptyCopy}>Scores will appear after the first live activity.</Text>}
            </View>
          ) : null}

          {toolPanel === 'participants' ? (
            <View style={styles.leaderboardPanel}>
              <View style={styles.panelHeadingRow}><View style={styles.headingCopy}><Text style={styles.eyebrow}>LIVE PRESENCE</Text><Text style={styles.panelTitle}>Class Participants</Text></View><Text style={styles.participantCount}>{presence.activeCount} active</Text></View>
              {presence.participants.map((participant) => (
                <View key={`${participant.role}-${participant.userId}`} style={styles.leaderboardRow}><View style={[styles.presenceDot, participant.status === 'ACTIVE' ? styles.presenceActive : participant.status === 'AWAY' ? styles.presenceAway : styles.presenceDisconnected]} /><View style={styles.headingCopy}><Text style={styles.studentName}>{participant.displayName}</Text><Text style={styles.studentScoreCopy}>{participant.role} · {participant.status}</Text></View><Text style={styles.presenceTime}>{Math.floor(participant.activeSeconds / 60)}m</Text></View>
              ))}
            </View>
          ) : null}

          {toolPanel === 'history' && !multiStudyMode ? (
            <View style={styles.leaderboardPanel}>
              <Text style={styles.eyebrow}>BROADCAST LOG</Text><Text style={styles.panelTitle}>Activity History</Text>
              {activities.activities.length ? activities.activities.map((activity) => (
                <View key={activity.id} style={styles.historyRow}><View style={styles.headingCopy}><Text style={styles.studentName}>{activity.title}</Text><Text style={styles.studentScoreCopy}>{activity.type} · {activity.status}</Text></View><Text style={[styles.historyResult, activity.myResponse?.correct ? styles.historyCorrect : styles.historyPending]}>{activity.myResponse ? activity.myResponse.correct ? `+${activity.myResponse.score}` : '0' : '—'}</Text></View>
              )) : <Text style={styles.emptyCopy}>No activities have been broadcast yet.</Text>}
            </View>
          ) : null}

          {toolPanel === 'homework' ? (
            <View style={styles.leaderboardPanel}>
              <Text style={styles.eyebrow}>AFTER CLASS</Text><Text style={styles.panelTitle}>Homework</Text>
              {homework.length ? homework.map((item) => (
                <View key={item.id} style={styles.historyRow}><View style={styles.headingCopy}><Text style={styles.studentName}>{item.title}</Text><Text style={styles.studentScoreCopy}>Due {new Date(item.dueAt).toLocaleString()} · {item.completedItems}/{item.totalItems} complete</Text></View><Text style={styles.homeworkStatus}>{item.status}</Text></View>
              )) : <Text style={styles.emptyCopy}>No homework has been assigned from this class yet.</Text>}
            </View>
          ) : null}

          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}>
            <Text style={styles.leaveText}>LEAVE CLASSROOM</Text>
          </Pressable>
        </ScrollView>
        <Modal animationType="fade" onRequestClose={() => setOptionsOpen(false)} transparent visible={optionsOpen}>
          <Pressable onPress={() => setOptionsOpen(false)} style={styles.modalBackdrop}>
            <Pressable style={styles.optionsPanel}>
              <Text style={styles.eyebrow}>CLASSROOM</Text><Text style={styles.panelTitle}>Options</Text>
              <OptionItem label="Theme" onPress={() => { setOptionsOpen(false); setThemePickerOpen(true); }} />
              {joined?.joinLink ? <OptionItem label="Audio & Video" onPress={() => { setOptionsOpen(false); void openMeeting(); }} /> : null}
              <OptionItem label="Participants" onPress={() => { setOptionsOpen(false); setToolPanel('participants'); }} />
              {!multiStudyMode ? <OptionItem label="Activity History" onPress={() => { setOptionsOpen(false); setToolPanel('history'); }} /> : null}
              <OptionItem label="Homework" onPress={() => { setOptionsOpen(false); setToolPanel('homework'); }} />
            </Pressable>
          </Pressable>
        </Modal>
        <Modal animationType="fade" onRequestClose={() => router.replace('/academy/student-dashboard' as Href)} transparent visible={classEnded}>
          <View style={styles.modalBackdrop}><View style={styles.endedPanel}><SymbolView name={{ android: 'event_busy', ios: 'checkmark.seal.fill', web: 'event_busy' }} size={40} tintColor={colors.goldLight} /><Text style={styles.errorTitle}>Class session has ended</Text><Text style={styles.errorCopy}>The coach has stopped this live class.</Text><Pressable onPress={() => router.replace('/academy/student-dashboard' as Href)} style={styles.retryButton}><Text style={styles.retryText}>DONE</Text></Pressable></View></View>
        </Modal>
        <ChessThemePicker boardTheme={boardTheme} onChangeBoardTheme={changeBoardTheme} onChangePieceTheme={changePieceTheme} onClose={() => setThemePickerOpen(false)} pieceTheme={pieceTheme} visible={themePickerOpen} />
      </SafeAreaView>
    </LinearGradient>
  );
}

function ToolTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.toolTab, active && styles.toolTabActive]}><Text style={[styles.toolTabText, active && styles.toolTabTextActive]}>{label}</Text></Pressable>;
}

function OptionItem({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}><Text style={styles.optionItemText}>{label}</Text><SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={18} tintColor={colors.sandstone} /></Pressable>;
}

const styles = StyleSheet.create({
  activityCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginBottom: 14, marginTop: 7 },
  activityHint: { color: colors.sandstone, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  activityPanel: { backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 14 },
  assignmentCopy: { color: colors.muted, fontSize: 10, marginTop: 3 },
  assignmentPanel: { alignItems: 'center', backgroundColor: 'rgba(8, 21, 28, 0.96)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 14, padding: 15 },
  assignmentTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '900', marginTop: 3 },
  background: { flex: 1 },
  boardPanel: { alignItems: 'center', backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, paddingBottom: 15, paddingTop: 15 },
  boardWrap: { alignItems: 'center', marginHorizontal: -14, marginTop: 13 },
  classPanel: { backgroundColor: 'rgba(7, 16, 24, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 15, padding: 16 },
  classRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  classTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 3 },
  content: { paddingBottom: 35, paddingHorizontal: 14 },
  disabled: { opacity: 0.48 },
  emptyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingVertical: 16, textAlign: 'center' },
  errorCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 300, textAlign: 'center' },
  errorTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 14 },
  endedPanel: { alignItems: 'center', backgroundColor: colors.navy, borderColor: colors.border, borderRadius: 18, borderWidth: 1, maxWidth: 360, padding: 24, width: '88%' },
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
  liveSeal: { alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.45)', borderRadius: 25, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  loadingState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 25 },
  loadingText: { color: colors.sandstone, fontSize: 12, marginTop: 14 },
  meetingButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 15, paddingHorizontal: 14, paddingVertical: 12 },
  meetingCopy: { color: '#f4d7b4', fontSize: 9, lineHeight: 13, marginTop: 2 },
  meetingTitle: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  modeCopy: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  modeNotice: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.18)', borderColor: colors.gold, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 12, padding: 11 },
  modeNoticeDismiss: { color: colors.goldLight, fontSize: 8, fontWeight: '900' }, modeNoticeText: { color: colors.cream, flex: 1, fontSize: 10 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 20 },
  multiStudyCopy: { color: colors.sandstone, fontSize: 11, lineHeight: 18, marginTop: 9 },
  multiStudyPanel: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, marginTop: 14, padding: 18 },
  moveText: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 11, lineHeight: 17, marginTop: 12, paddingHorizontal: 14, textAlign: 'center' },
  noMeeting: { color: colors.muted, fontSize: 10, marginTop: 14, textAlign: 'center' },
  optionItem: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.1)', borderTopWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: 3 },
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
  studentName: { color: colors.cream, fontSize: 12, fontWeight: '800' },
  studentScoreCopy: { color: colors.muted, fontSize: 9, marginTop: 2 },
  submitButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 3, minHeight: 43 },
  submitText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  syncedBadge: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.4)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  syncedText: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  toolTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 2, flex: 1, minHeight: 38, justifyContent: 'center' }, toolTabActive: { borderBottomColor: colors.goldLight }, toolTabText: { color: colors.muted, fontSize: 9, fontWeight: '800' }, toolTabTextActive: { color: colors.goldLight }, toolTabs: { backgroundColor: 'rgba(7,16,24,0.96)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 14, overflow: 'hidden', paddingHorizontal: 3 },
  timer: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 18, fontWeight: '900' },
  topRank: { color: colors.goldLight },
  warning: { backgroundColor: 'rgba(91,18,27,0.82)', borderColor: colors.danger, borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 11 },
  warningText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
