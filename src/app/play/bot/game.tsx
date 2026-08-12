import { Chess, type Move, type Square } from 'chess.js';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { ChessThemePicker } from '@/components/chess-theme-picker';
import { PlayScreenHeader } from '@/components/play-screen-header';
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  DEFAULT_PIECE_THEME,
  PIECE_ASSETS,
  PIECE_THEME_OPTIONS,
  pieceKey,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { colors } from '@/constants/colors';
import {
  clearActiveBotGame,
  elapsedClocks,
  loadActiveBotGame,
  rebuildBotGame,
  saveActiveBotGame,
  type ActiveBotGame,
} from '@/lib/active-bot-game';
import {
  archiveBotGame,
  botLevels,
  formatClock,
  parseTimeControl,
  requestBotDrawOffer,
  requestBotMove,
} from '@/lib/bot-game';
import { loadChessPreferences, saveChessPreferences } from '@/lib/chess-preferences';
import { restoreSession } from '@/lib/session';

type Side = 'b' | 'w';
type GameStatus = 'ENDED' | 'RUNNING';
type GameResult = {
  resultCode: string;
  status: 'BLACK_WIN' | 'DRAW' | 'WHITE_WIN';
  termination: string;
  title: string;
  winnerColor: Side | null;
};

const allFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const allRanks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const startFen = new Chess().fen();
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function safeTimeControl(value?: string) {
  return /^\d{1,2}\+\d{1,2}$/.test(value || '') ? value! : '10+0';
}

function opposite(side: Side): Side {
  return side === 'w' ? 'b' : 'w';
}

function sideName(side: Side) {
  return side === 'w' ? 'White' : 'Black';
}

export default function BotGameScreen() {
  const params = useLocalSearchParams<{
    color?: string;
    level?: string;
    resume?: string;
    timeControl?: string;
  }>();
  const userSide: Side = params.color === 'black' ? 'b' : 'w';
  const botSide = opposite(userSide);
  const level = Math.min(10, Math.max(1, Number.parseInt(params.level || '5', 10) || 5));
  const levelConfig = botLevels[level - 1];
  const timeControl = safeTimeControl(params.timeControl);
  const { incrementSeconds, initialMillis } = useMemo(() => parseTimeControl(timeControl), [timeControl]);
  const { width } = useWindowDimensions();
  const boardInnerSize = Math.floor((Math.min(width - 24, 520) - 8) / 8) * 8;
  const boardSize = boardInnerSize + 8;
  const squareSize = boardInnerSize / 8;

  const gameRef = useRef(new Chess());
  const statusRef = useRef<GameStatus>('RUNNING');
  const hydratedRef = useRef(false);
  const botRequestRef = useRef(false);
  const botRequestVersionRef = useRef(0);
  const botDrawOfferSeenRef = useRef(false);
  const botOfferedDrawRef = useRef(false);
  const archiveStartedRef = useRef(false);
  const lastTickRef = useRef(0);
  const movesUciRef = useRef<string[]>([]);
  const movesSanRef = useRef<string[]>([]);
  const archiveKeyRef = useRef('');
  const createdAtRef = useRef(0);
  const lastMoveRef = useRef<{ from: Square; to: Square } | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const usernameRef = useRef('Player');
  const accessTokenRef = useRef<string | undefined>(undefined);
  const clocksRef = useRef<Record<Side, number>>({ b: initialMillis, w: initialMillis });
  const appStateRef = useRef(AppState.currentState);

  const [hydrated, setHydrated] = useState(false);
  const [fen, setFen] = useState(startFen);
  const [status, setStatus] = useState<GameStatus>('RUNNING');
  const [result, setResult] = useState<GameResult | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [movesSan, setMovesSan] = useState<string[]>([]);
  const [botThinking, setBotThinking] = useState(false);
  const [botOfferedDraw, setBotOfferedDraw] = useState(false);
  const [drawRequestPending, setDrawRequestPending] = useState(false);
  const [drawNotice, setDrawNotice] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [username, setUsername] = useState('Player');
  const [clocks, setClocks] = useState<Record<Side, number>>({ b: initialMillis, w: initialMillis });
  const renderedGame = useMemo(() => new Chess(fen), [fen]);
  const currentTurn = renderedGame.turn();
  const activeBoardTheme = BOARD_THEMES[boardTheme];
  const activePieceThemeLabel =
    PIECE_THEME_OPTIONS.find((theme) => theme.id === pieceTheme)?.label ?? 'Cburnett';

  const queueSnapshot = useCallback((snapshot: ActiveBotGame) => {
    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(() => saveActiveBotGame(snapshot));
  }, []);

  const clearSnapshot = useCallback(() => {
    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(clearActiveBotGame);
  }, []);

  const invalidateBotRequest = useCallback(() => {
    botRequestVersionRef.current++;
    botRequestRef.current = false;
  }, []);

  const persistSnapshot = useCallback((clockSnapshot = clocksRef.current) => {
    if (!hydratedRef.current || statusRef.current !== 'RUNNING') return;
    queueSnapshot({
      archiveKey: archiveKeyRef.current,
      botDrawOfferSeen: botDrawOfferSeenRef.current,
      botOfferedDraw: botOfferedDrawRef.current,
      clocks: clockSnapshot,
      createdAt: createdAtRef.current,
      fen: gameRef.current.fen(),
      lastMove: lastMoveRef.current,
      level,
      movesSan: movesSanRef.current,
      movesUci: movesUciRef.current,
      ownerUsername: usernameRef.current,
      timeControl,
      updatedAt: Date.now(),
      userSide,
      version: 1,
    });
  }, [level, queueSnapshot, timeControl, userSide]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const session = await restoreSession();
      if (!mounted) return;
      if (session?.username) {
        usernameRef.current = session.username;
        setUsername(session.username);
      }
      accessTokenRef.current = session?.accessToken;
      const preferences = await loadChessPreferences(session?.accessToken);
      if (!mounted) return;
      setBoardTheme(preferences.boardTheme);
      setPieceTheme(preferences.pieceTheme);

      const now = Date.now();
      const savedGame = params.resume === '1' && session
        ? await loadActiveBotGame(session.username)
        : null;
      if (!mounted) return;

      if (savedGame) {
        if (
          savedGame.level !== level
          || savedGame.timeControl !== timeControl
          || savedGame.userSide !== userSide
        ) {
          router.replace({
            pathname: '/play/bot/game',
            params: {
              color: savedGame.userSide === 'w' ? 'white' : 'black',
              level: String(savedGame.level),
              resume: '1',
              timeControl: savedGame.timeControl,
            },
          });
          return;
        }

        const restoredGame = rebuildBotGame(savedGame.movesUci);
        const restoredClocks = elapsedClocks(
          savedGame.clocks,
          restoredGame.turn(),
          now - savedGame.updatedAt,
        );
        gameRef.current = restoredGame;
        clocksRef.current = restoredClocks;
        movesUciRef.current = [...savedGame.movesUci];
        movesSanRef.current = [...savedGame.movesSan];
        archiveKeyRef.current = savedGame.archiveKey;
        createdAtRef.current = savedGame.createdAt;
        lastMoveRef.current = savedGame.lastMove;
        botDrawOfferSeenRef.current = savedGame.botDrawOfferSeen;
        botOfferedDrawRef.current = savedGame.botOfferedDraw;
        setFen(restoredGame.fen());
        setClocks(restoredClocks);
        setMovesSan(savedGame.movesSan);
        setLastMove(savedGame.lastMove);
        setBotOfferedDraw(savedGame.botOfferedDraw);
      } else {
        archiveKeyRef.current = `mobile-bot-${now}-${Math.random().toString(36).slice(2, 10)}`;
        createdAtRef.current = now;
      }

      lastTickRef.current = now;
      hydratedRef.current = true;
      setHydrated(true);
      persistSnapshot(clocksRef.current);
    })();
    return () => {
      mounted = false;
      invalidateBotRequest();
    };
  }, [invalidateBotRequest, level, params.resume, persistSnapshot, timeControl, userSide]);

  function changeBoardTheme(nextBoardTheme: BoardThemeName) {
    setBoardTheme(nextBoardTheme);
    void saveChessPreferences(
      { boardTheme: nextBoardTheme, pieceTheme },
      accessTokenRef.current,
    );
  }

  function changePieceTheme(nextPieceTheme: PieceThemeName) {
    setPieceTheme(nextPieceTheme);
    void saveChessPreferences(
      { boardTheme, pieceTheme: nextPieceTheme },
      accessTokenRef.current,
    );
  }

  const finishGame = useCallback((nextResult: GameResult, finalFen = gameRef.current.fen()) => {
    if (statusRef.current !== 'RUNNING') return;
    statusRef.current = 'ENDED';
    invalidateBotRequest();
    setStatus('ENDED');
    setResult(nextResult);
    setSelected(null);
    setLegalTargets([]);
    botOfferedDrawRef.current = false;
    setBotOfferedDraw(false);
    setDrawNotice(null);
    clearSnapshot();

    if (archiveStartedRef.current || nextResult.resultCode === '*') return;
    archiveStartedRef.current = true;
    const botName = `Stockfish Level ${level}`;
    const username = usernameRef.current;
    void archiveBotGame({
      archiveKey: archiveKeyRef.current,
      blackUsername: userSide === 'b' ? username : botName,
      finalFen,
      moveCount: movesUciRef.current.length,
      movesUci: movesUciRef.current.join(' '),
      playedAt: new Date().toISOString(),
      resultCode: nextResult.resultCode,
      status: nextResult.status,
      termination: nextResult.termination,
      timeControl,
      whiteUsername: userSide === 'w' ? username : botName,
      winnerColor: nextResult.winnerColor,
    })
      .then(() => setArchiveNotice('Saved to My Games'))
      .catch(() => setArchiveNotice('Game finished; saving will retry in a future update.'));
  }, [clearSnapshot, invalidateBotRequest, level, timeControl, userSide]);

  const finishFromPosition = useCallback((game: Chess) => {
    if (game.isCheckmate()) {
      const winner = opposite(game.turn());
      finishGame({
        resultCode: winner === 'w' ? '1-0' : '0-1',
        status: winner === 'w' ? 'WHITE_WIN' : 'BLACK_WIN',
        termination: 'CHECKMATE',
        title: winner === userSide ? 'Victory by checkmate' : 'Stockfish wins by checkmate',
        winnerColor: winner,
      }, game.fen());
      return true;
    }
    if (game.isGameOver()) {
      const termination = game.isStalemate()
        ? 'STALEMATE'
        : game.isThreefoldRepetition()
          ? 'THREEFOLD_REPETITION'
          : game.isInsufficientMaterial()
            ? 'INSUFFICIENT_MATERIAL'
            : 'DRAW';
      finishGame({
        resultCode: '1/2-1/2',
        status: 'DRAW',
        termination,
        title: 'The battle ends in a draw',
        winnerColor: null,
      }, game.fen());
      return true;
    }
    return false;
  }, [finishGame, userSide]);

  const applyMove = useCallback((move: Move) => {
    const game = gameRef.current;
    const now = Date.now();
    const elapsed = Math.max(0, now - lastTickRef.current);
    lastTickRef.current = now;
    const uci = `${move.from}${move.to}${move.promotion || ''}`;
    movesUciRef.current = [...movesUciRef.current, uci];
    movesSanRef.current = [...movesSanRef.current, move.san];
    setMovesSan(movesSanRef.current);
    setFen(game.fen());
    lastMoveRef.current = { from: move.from, to: move.to };
    setLastMove(lastMoveRef.current);
    setSelected(null);
    setLegalTargets([]);
    // Charge any interval scheduling delay before awarding the move increment.
    const remaining = Math.max(0, clocksRef.current[move.color] - elapsed);
    const nextClocks = {
      ...clocksRef.current,
      [move.color]: remaining > 0 ? remaining + incrementSeconds * 1000 : 0,
    };
    clocksRef.current = nextClocks;
    setClocks(nextClocks);
    const ended = finishFromPosition(game);
    if (!ended) persistSnapshot(nextClocks);
    return ended;
  }, [finishFromPosition, incrementSeconds, persistSnapshot]);

  const playBotMove = useCallback(async (requestedFen: string) => {
    if (botRequestRef.current || statusRef.current !== 'RUNNING') return;
    const requestVersion = ++botRequestVersionRef.current;
    botRequestRef.current = true;
    setBotThinking(true);
    setEngineError(null);
    try {
      const response = await requestBotMove(requestedFen, level);
      if (
        requestVersion !== botRequestVersionRef.current
        || statusRef.current !== 'RUNNING'
        || gameRef.current.fen() !== requestedFen
      ) return;
      const moveText = response.move;
      const move = gameRef.current.move({
        from: moveText.slice(0, 2),
        promotion: (moveText[4] || 'q') as 'b' | 'n' | 'q' | 'r',
        to: moveText.slice(2, 4),
      });
      if (!move) throw new Error('BOT_MOVE_INVALID');
      const ended = applyMove(move);
      if (!ended && response.offerDraw && !botDrawOfferSeenRef.current) {
        botDrawOfferSeenRef.current = true;
        botOfferedDrawRef.current = true;
        setBotOfferedDraw(true);
        setDrawNotice(null);
        persistSnapshot();
      }
    } catch (error) {
      if (__DEV__) console.error('[Server Stockfish request failed]', error);
      if (requestVersion === botRequestVersionRef.current && statusRef.current === 'RUNNING') {
        setEngineError('The royal engine could not answer. Check the connection and try again.');
      }
    } finally {
      if (requestVersion === botRequestVersionRef.current) {
        botRequestRef.current = false;
        setBotThinking(false);
      }
    }
  }, [applyMove, level, persistSnapshot]);

  useEffect(() => {
    if (
      hydrated
      && statusRef.current === 'RUNNING'
      && gameRef.current.turn() === botSide
      && clocksRef.current[botSide] > 0
      && AppState.currentState === 'active'
    ) {
      void playBotMove(gameRef.current.fen());
    }
  }, [botSide, fen, hydrated, playBotMove]);

  const syncClockToNow = useCallback((now: number) => {
    if (!hydratedRef.current || statusRef.current !== 'RUNNING') return clocksRef.current;
    const elapsed = Math.max(0, now - lastTickRef.current);
    lastTickRef.current = now;
    const nextClocks = elapsedClocks(clocksRef.current, gameRef.current.turn(), elapsed);
    clocksRef.current = nextClocks;
    setClocks(nextClocks);
    return nextClocks;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== 'active') {
        const nextClocks = syncClockToNow(Date.now());
        invalidateBotRequest();
        setBotThinking(false);
        persistSnapshot(nextClocks);
        return;
      }

      if (previousState !== 'active') {
        const nextClocks = syncClockToNow(Date.now());
        persistSnapshot(nextClocks);
        const activeSide = gameRef.current.turn();
        if (nextClocks[activeSide] > 0 && activeSide === botSide) {
          void playBotMove(gameRef.current.fen());
        }
      }
    });
    return () => subscription.remove();
  }, [botSide, hydrated, invalidateBotRequest, persistSnapshot, playBotMove, syncClockToNow]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!hydratedRef.current || AppState.currentState !== 'active') return;
      syncClockToNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, [syncClockToNow]);

  useEffect(() => {
    if (status !== 'RUNNING') return;
    const timedOutSide = clocks.w <= 0 ? 'w' : clocks.b <= 0 ? 'b' : null;
    if (!timedOutSide) return;
    const winner = opposite(timedOutSide);
    finishGame({
      resultCode: winner === 'w' ? '1-0' : '0-1',
      status: winner === 'w' ? 'WHITE_WIN' : 'BLACK_WIN',
      termination: 'TIME_FORFEIT',
      title: winner === userSide ? 'Victory on time' : 'Stockfish wins on time',
      winnerColor: winner,
    });
  }, [clocks.b, clocks.w, finishGame, status, userSide]);

  function selectSquare(square: Square) {
    if (
      statusRef.current !== 'RUNNING'
      || botThinking
      || drawRequestPending
      || gameRef.current.turn() !== userSide
    ) return;
    const game = gameRef.current;
    const piece = game.get(square);

    if (selected && legalTargets.includes(square)) {
      const move = game.move({ from: selected, promotion: 'q', to: square });
      if (!move) return;
      botOfferedDrawRef.current = false;
      setBotOfferedDraw(false);
      setDrawNotice(null);
      const ended = applyMove(move);
      if (!ended) void playBotMove(game.fen());
      return;
    }

    if (piece?.color === userSide) {
      const targets = game.moves({ square, verbose: true }).map((move) => move.to);
      setSelected(square);
      setLegalTargets(targets);
      return;
    }

    setSelected(null);
    setLegalTargets([]);
  }

  function resign() {
    Alert.alert('Resign this battle?', 'Stockfish will be declared the winner.', [
      { style: 'cancel', text: 'Continue Playing' },
      {
        onPress: () => finishGame({
          resultCode: botSide === 'w' ? '1-0' : '0-1',
          status: botSide === 'w' ? 'WHITE_WIN' : 'BLACK_WIN',
          termination: 'RESIGNATION',
          title: 'You resigned the battle',
          winnerColor: botSide,
        }),
        style: 'destructive',
        text: 'Resign',
      },
    ]);
  }

  function acceptDraw() {
    finishGame({
      resultCode: '1/2-1/2',
      status: 'DRAW',
      termination: 'AGREED_DRAW',
      title: 'Draw agreed with Stockfish',
      winnerColor: null,
    });
  }

  async function offerDrawToBot() {
    if (
      statusRef.current !== 'RUNNING'
      || botThinking
      || drawRequestPending
      || gameRef.current.turn() !== userSide
    ) return;

    const requestedFen = gameRef.current.fen();
    setDrawRequestPending(true);
    setDrawNotice(null);
    try {
      const response = await requestBotDrawOffer(requestedFen, level);
      if (statusRef.current !== 'RUNNING' || gameRef.current.fen() !== requestedFen) return;
      if (response.accepted) {
        acceptDraw();
      } else {
        setDrawNotice('Stockfish declines the draw offer.');
      }
    } catch (error) {
      if (__DEV__) console.error('[Server Stockfish draw offer failed]', error);
      Alert.alert('Draw offer failed', 'ChessPerfect could not send the draw offer. Please try again.');
    } finally {
      setDrawRequestPending(false);
    }
  }

  function drawAction() {
    if (botOfferedDraw) {
      acceptDraw();
      return;
    }
    Alert.alert('Offer a draw?', 'Stockfish will evaluate the current position before answering.', [
      { style: 'cancel', text: 'Cancel' },
      { onPress: () => void offerDrawToBot(), text: 'Offer Draw' },
    ]);
  }

  function openNewBattle() {
    const navigate = () => {
      statusRef.current = 'ENDED';
      invalidateBotRequest();
      clearSnapshot();
      router.replace({ pathname: '/play/bot/setup', params: { speed: 'Rapid' } });
    };
    if (statusRef.current === 'ENDED') {
      navigate();
      return;
    }
    Alert.alert('Restart this battle?', 'The current position will be abandoned.', [
      { style: 'cancel', text: 'Continue Playing' },
      { onPress: navigate, style: 'destructive', text: 'Restart' },
    ]);
  }

  const displayedFiles = userSide === 'w' ? allFiles : [...allFiles].reverse();
  const displayedRanks = userSide === 'w' ? [...allRanks].reverse() : allRanks;
  const movePairs = movesSan.reduce<string[]>((pairs, move, index) => {
    if (index % 2 === 0) pairs.push(`${Math.floor(index / 2) + 1}. ${move}`);
    else pairs[pairs.length - 1] += `  ${move}`;
    return pairs;
  }, []);
  const drawButtonDisabled =
    drawRequestPending || botThinking || currentTurn !== userSide || Boolean(drawNotice);

  if (!hydrated) {
    return (
      <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
        <CivBackdrop />
        <SafeAreaView edges={['top', 'bottom']} style={styles.loadingScreen}>
          <ActivityIndicator color={colors.goldLight} size="large" />
          <Text style={styles.loadingText}>Preparing the battlefield…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Battle Board" />
        <ScrollView
          contentContainerStyle={styles.content}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
        >
          <PlayerBar
            active={currentTurn === botSide && status === 'RUNNING'}
            clock={clocks[botSide]}
            detail={`Server · ${levelConfig.label} · Level ${level}`}
            name="Stockfish"
            pieceTheme={pieceTheme}
            side={botSide}
            thinking={botThinking}
          />

          <Pressable
            accessibilityLabel="Choose board and piece themes"
            accessibilityRole="button"
            onPress={() => setThemePickerOpen(true)}
            style={({ pressed }) => [styles.themeButton, pressed && styles.pressed]}>
            <Text style={styles.themeButtonIcon}>♜</Text>
            <Text numberOfLines={1} style={styles.themeButtonText}>
              {activeBoardTheme.label} Board · {activePieceThemeLabel}
            </Text>
            <Text style={styles.themeButtonAction}>CHANGE</Text>
          </Pressable>

          <View
            style={[
              styles.boardFrame,
              {
                backgroundColor: activeBoardTheme.frameDark,
                borderColor: activeBoardTheme.frameLight,
                height: boardSize,
                width: boardSize,
              },
            ]}>
            {displayedRanks.map((rank, rowIndex) => (
              <View key={rank} style={[styles.boardRow, { height: squareSize }]}>
                {displayedFiles.map((file, columnIndex) => {
                  const square = `${file}${rank}` as Square;
                  const piece = renderedGame.get(square);
                  const isLight = (allFiles.indexOf(file) + rank) % 2 === 1;
                  const isSelected = selected === square;
                  const isTarget = legalTargets.includes(square);
                  const isLastMove = lastMove?.from === square || lastMove?.to === square;
                  return (
                    <Pressable
                      accessibilityLabel={`${square}${piece ? ` ${sideName(piece.color)} ${piece.type}` : ''}`}
                      accessibilityRole="button"
                      key={square}
                      onPress={() => selectSquare(square)}
                      style={[
                        styles.square,
                        { height: squareSize, width: squareSize },
                        { backgroundColor: isLight ? activeBoardTheme.light : activeBoardTheme.dark },
                        isLastMove && { backgroundColor: activeBoardTheme.highlight },
                        isSelected && styles.selectedSquare,
                      ]}>
                      {piece ? (
                        <Image
                          accessibilityIgnoresInvertColors
                          contentFit="contain"
                          source={PIECE_ASSETS[pieceTheme][pieceKey(piece.color, piece.type)]}
                          style={styles.pieceImage}
                        />
                      ) : null}
                      {isTarget ? <View style={[styles.legalTarget, piece && styles.captureTarget]} /> : null}
                      {columnIndex === 0 ? (
                        <Text style={[styles.rankLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{rank}</Text>
                      ) : null}
                      {rowIndex === 7 ? (
                        <Text style={[styles.fileLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{file}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <PlayerBar
            active={currentTurn === userSide && status === 'RUNNING'}
            clock={clocks[userSide]}
            detail={`You command ${sideName(userSide)}`}
            name={username}
            pieceTheme={pieceTheme}
            side={userSide}
          />

          <View style={styles.statusPanel}>
            {result ? (
              <>
                <Text style={styles.resultTitle}>{result.title}</Text>
                <Text style={styles.resultMeta}>{result.resultCode} · {result.termination.replaceAll('_', ' ')}</Text>
                {archiveNotice ? <Text style={styles.archiveNotice}>{archiveNotice}</Text> : null}
              </>
            ) : engineError ? (
              <>
                <Text style={styles.errorText}>{engineError}</Text>
                <Pressable onPress={() => void playBotMove(gameRef.current.fen())} style={styles.retryButton}>
                  <Text style={styles.retryLabel}>Retry Bot Move</Text>
                </Pressable>
              </>
            ) : botOfferedDraw ? (
              <Text style={styles.drawOfferText}>
                Stockfish offers a draw. Accept it or make a move to decline.
              </Text>
            ) : drawNotice ? (
              <Text style={styles.drawNotice}>{drawNotice}</Text>
            ) : (
              <Text style={styles.turnText}>
                {botThinking ? 'Stockfish is considering the battlefield…' : `${sideName(currentTurn)} to move`}
              </Text>
            )}
          </View>

          {movePairs.length > 0 ? (
            <View style={styles.moveStrip}>
              <Text numberOfLines={2} style={styles.movesText}>{movePairs.slice(-4).join('   ')}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={openNewBattle}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <SymbolView name={{ android: 'refresh', ios: 'arrow.clockwise', web: 'refresh' }} size={19} tintColor={colors.goldLight} />
              <Text style={styles.secondaryLabel}>{status === 'ENDED' ? 'New Battle' : 'Restart'}</Text>
            </Pressable>
            {status === 'RUNNING' ? (
              <Pressable
                accessibilityLabel={botOfferedDraw ? 'Accept Stockfish draw offer' : 'Offer Stockfish a draw'}
                accessibilityRole="button"
                disabled={drawButtonDisabled}
                onPress={drawAction}
                style={({ pressed }) => [
                  styles.drawButton,
                  drawButtonDisabled && styles.disabledButton,
                  pressed && styles.pressed,
                ]}>
                {drawRequestPending ? <ActivityIndicator color={colors.goldLight} size="small" /> : null}
                <Text style={styles.drawLabel}>
                  {drawRequestPending
                    ? 'Offering…'
                    : botOfferedDraw
                      ? 'Accept Draw'
                      : drawNotice
                        ? 'Draw Declined'
                        : 'Offer Draw'}
                </Text>
              </Pressable>
            ) : null}
            {status === 'RUNNING' ? (
              <Pressable
                accessibilityRole="button"
                onPress={resign}
                style={({ pressed }) => [styles.resignButton, pressed && styles.pressed]}>
                <Text style={styles.resignLabel}>Resign</Text>
              </Pressable>
            ) : null}
          </View>
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

function PlayerBar({
  active,
  clock,
  detail,
  name,
  pieceTheme,
  side,
  thinking = false,
}: {
  active: boolean;
  clock: number;
  detail: string;
  name: string;
  pieceTheme: PieceThemeName;
  side: Side;
  thinking?: boolean;
}) {
  return (
    <View style={[styles.playerBar, active && styles.playerBarActive]}>
      <View style={[styles.sideMedallion, side === 'w' ? styles.whiteMedallion : styles.blackMedallion]}>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="contain"
          source={PIECE_ASSETS[pieceTheme][side === 'w' ? 'wK' : 'bK']}
          style={styles.sideKingImage}
        />
      </View>
      <View style={styles.playerIdentity}>
        <Text numberOfLines={1} style={styles.playerName}>{name}</Text>
        <Text numberOfLines={1} style={styles.playerDetail}>{detail}</Text>
      </View>
      {thinking ? <ActivityIndicator color={colors.goldLight} size="small" /> : null}
      <IndependentClock active={active} milliseconds={clock} />
    </View>
  );
}

function IndependentClock({ active, milliseconds }: { active: boolean; milliseconds: number }) {
  const displayedMillis = useSharedValue(milliseconds);
  const displayedText = useSharedValue(formatClock(milliseconds));
  const running = useSharedValue(active);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!active || !wasActiveRef.current) {
      displayedMillis.set(milliseconds);
      displayedText.set(formatClock(milliseconds));
    }
    running.set(active);
    wasActiveRef.current = active;
  }, [active, displayedMillis, displayedText, milliseconds, running]);

  useFrameCallback((frame) => {
    const frameMillis = frame.timeSincePreviousFrame;
    if (!running.get() || frameMillis === null) return;
    const nextMillis = Math.max(0, displayedMillis.get() - frameMillis);
    displayedMillis.set(nextMillis);

    // Update the native text only when the displayed second changes. Sending an
    // identical TextInput value every frame can overwhelm Fabric during a long turn.
    const totalSeconds = Math.max(0, Math.floor(nextMillis / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const nextText = `${minutes}:${String(seconds).padStart(2, '0')}`;
    if (nextText !== displayedText.get()) displayedText.set(nextText);
  });

  const animatedProps = useAnimatedProps(() => ({ text: displayedText.get() }));

  return (
    <AnimatedTextInput
      accessibilityLabel="Chess clock"
      animatedProps={animatedProps as never}
      caretHidden
      defaultValue={formatClock(milliseconds)}
      editable={false}
      pointerEvents="none"
      style={[styles.clock, active && styles.clockActive]}
      underlineColorAndroid="transparent"
    />
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  loadingScreen: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sandstone, fontFamily: 'serif', fontSize: 16, fontWeight: '800', marginTop: 14 },
  content: { alignItems: 'center', paddingBottom: 24, paddingHorizontal: 12, paddingTop: 12 },
  playerBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 21, 0.94)',
    borderColor: '#6e4d25',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginVertical: 7,
    maxWidth: 520,
    minHeight: 58,
    paddingHorizontal: 10,
    width: '100%',
  },
  playerBarActive: { borderColor: colors.goldLight, shadowColor: colors.gold, shadowOpacity: 0.36, shadowRadius: 6 },
  sideMedallion: { alignItems: 'center', borderRadius: 21, borderWidth: 1.5, height: 42, justifyContent: 'center', width: 42 },
  whiteMedallion: { backgroundColor: '#f0dfb8', borderColor: colors.gold },
  blackMedallion: { backgroundColor: '#1b1712', borderColor: colors.gold },
  sideKingImage: { height: 36, width: 36 },
  playerIdentity: { flex: 1, marginLeft: 9 },
  playerName: { color: colors.cream, fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  playerDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  clock: {
    backgroundColor: 'transparent',
    color: colors.sandstone,
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '900',
    marginLeft: 8,
    padding: 0,
    textAlign: 'right',
    width: 82,
  },
  clockActive: { color: colors.goldLight },
  themeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 21, 0.94)',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 7,
    maxWidth: 520,
    minHeight: 42,
    paddingHorizontal: 11,
    width: '100%',
  },
  themeButtonIcon: { color: colors.goldLight, fontSize: 22, marginRight: 8 },
  themeButtonText: { color: colors.sandstone, flex: 1, fontSize: 12, fontWeight: '800' },
  themeButtonAction: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  boardFrame: {
    borderRadius: 5,
    borderWidth: 4,
    elevation: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  boardRow: { flexDirection: 'row' },
  square: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  selectedSquare: { backgroundColor: '#d8a928' },
  pieceImage: { height: '88%', width: '88%' },
  legalTarget: { backgroundColor: 'rgba(12, 63, 42, 0.58)', borderRadius: 10, height: 15, position: 'absolute', width: 15 },
  captureTarget: { backgroundColor: 'transparent', borderColor: 'rgba(94, 21, 17, 0.75)', borderRadius: 28, borderWidth: 4, height: '84%', width: '84%' },
  rankLabel: { fontSize: 8, fontWeight: '900', left: 2, position: 'absolute', top: 1 },
  fileLabel: { bottom: 1, fontSize: 8, fontWeight: '900', position: 'absolute', right: 2 },
  darkCoordinate: { color: 'rgba(24, 16, 10, 0.78)' },
  lightCoordinate: { color: 'rgba(255, 250, 229, 0.9)' },
  statusPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 21, 0.92)',
    borderColor: colors.border,
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 7,
    maxWidth: 520,
    minHeight: 49,
    paddingHorizontal: 12,
    paddingVertical: 9,
    width: '100%',
  },
  turnText: { color: colors.sandstone, fontFamily: 'serif', fontSize: 14, fontWeight: '800' },
  resultTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900' },
  resultMeta: { color: colors.sandstone, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  archiveNotice: { color: colors.success, fontSize: 10, marginTop: 3 },
  drawOfferText: { color: colors.goldLight, fontFamily: 'serif', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  drawNotice: { color: colors.sandstone, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  errorText: { color: '#fecdd3', fontSize: 11, textAlign: 'center' },
  retryButton: { borderBottomColor: colors.goldLight, borderBottomWidth: 1, marginTop: 6, paddingBottom: 2 },
  retryLabel: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  moveStrip: { maxWidth: 520, paddingHorizontal: 6, paddingTop: 7, width: '100%' },
  movesText: { color: colors.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 11, maxWidth: 520, width: '100%' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 25, 0.95)',
    borderColor: colors.gold,
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 45,
  },
  secondaryLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 14, fontWeight: '900' },
  drawButton: {
    alignItems: 'center',
    backgroundColor: '#172b35',
    borderColor: colors.gold,
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 45,
  },
  drawLabel: { color: colors.goldLight, fontFamily: 'serif', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  disabledButton: { opacity: 0.45 },
  resignButton: {
    alignItems: 'center',
    backgroundColor: '#67151a',
    borderColor: '#b96b58',
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 45,
  },
  resignLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
