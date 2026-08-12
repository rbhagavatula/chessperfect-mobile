import { Chess, type Square } from 'chess.js';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { CivBackdrop } from '@/components/civ-ornament';
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
import { formatClock } from '@/lib/bot-game';
import { loadChessPreferences, saveChessPreferences } from '@/lib/chess-preferences';
import {
  acceptMultiplayerDraw,
  declineMultiplayerDraw,
  fetchMultiplayerSnapshot,
  joinMultiplayerGame,
  offerMultiplayerDraw,
  playMultiplayerMove,
  resignMultiplayerGame,
  type MultiplayerRole,
  type MultiplayerSide,
  type MultiplayerSnapshot,
} from '@/lib/multiplayer-game';
import { restoreSession } from '@/lib/session';

type PromotionPiece = 'b' | 'n' | 'q' | 'r';

const allFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const allRanks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const startFen = new Chess().fen();

function opposite(side: MultiplayerSide): MultiplayerSide {
  return side === 'w' ? 'b' : 'w';
}

function normalizeTurn(turn: MultiplayerSnapshot['turn']): MultiplayerSide {
  return turn === 'b' || turn === 'BLACK' ? 'b' : 'w';
}

function sideName(side: MultiplayerSide) {
  return side === 'w' ? 'White' : 'Black';
}

function roleSide(role: MultiplayerRole): MultiplayerSide | null {
  return role === 'WHITE' ? 'w' : role === 'BLACK' ? 'b' : null;
}

function playerName(snapshot: MultiplayerSnapshot, side: MultiplayerSide) {
  const displayName = side === 'w' ? snapshot.whiteDisplayName : snapshot.blackDisplayName;
  const username = side === 'w' ? snapshot.white : snapshot.black;
  return displayName?.trim() || username?.trim() || sideName(side);
}

function liveClocksFromSnapshot(
  snapshot: MultiplayerSnapshot,
  previous: Record<MultiplayerSide, number>,
) {
  const clocks = {
    w: Math.max(0, snapshot.whiteMillis ?? previous.w),
    b: Math.max(0, snapshot.blackMillis ?? previous.b),
  };
  if (snapshot.status !== 'RUNNING' || !snapshot.lastMoveAt) return clocks;
  const activeSide = normalizeTurn(snapshot.turn);
  const serverNow = snapshot.serverNow ?? Date.now();
  clocks[activeSide] = Math.max(0, clocks[activeSide] - Math.max(0, serverNow - snapshot.lastMoveAt));
  return clocks;
}

function notationFromMoves(moves: readonly string[]) {
  const game = new Chess();
  const san: string[] = [];
  for (const uci of moves) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) continue;
    const move = game.move({
      from: uci.slice(0, 2),
      promotion: (uci[4] || 'q') as PromotionPiece,
      to: uci.slice(2, 4),
    });
    if (!move) break;
    san.push(move.san);
  }
  return san.reduce<string[]>((pairs, move, index) => {
    if (index % 2 === 0) pairs.push(`${Math.floor(index / 2) + 1}. ${move}`);
    else pairs[pairs.length - 1] += `  ${move}`;
    return pairs;
  }, []);
}

export default function MultiplayerGameScreen() {
  const params = useLocalSearchParams<{ gameId?: string }>();
  const gameId = typeof params.gameId === 'string' ? params.gameId : '';
  const { width } = useWindowDimensions();
  const boardInnerSize = Math.floor((Math.min(width - 24, 520) - 8) / 8) * 8;
  const boardSize = boardInnerSize + 8;
  const squareSize = boardInnerSize / 8;

  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>({ fen: startFen, status: 'WAITING' });
  const [role, setRole] = useState<MultiplayerRole>('SPECTATOR');
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [movePending, setMovePending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(DEFAULT_BOARD_THEME);
  const [pieceTheme, setPieceTheme] = useState<PieceThemeName>(DEFAULT_PIECE_THEME);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [clocks, setClocks] = useState<Record<MultiplayerSide, number>>({ b: 0, w: 0 });

  const accessTokenRef = useRef<string | undefined>(undefined);
  const snapshotRef = useRef(snapshot);
  const clocksRef = useRef(clocks);
  const lastClockTickRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const failureCountRef = useRef(0);
  const mountedRef = useRef(true);

  const fen = snapshot.fen || snapshot.currentFen || startFen;
  const game = useMemo(() => new Chess(fen), [fen]);
  const currentTurn = normalizeTurn(snapshot.turn ?? game.turn());
  const mySide = roleSide(role);
  const boardBottomSide = mySide ?? 'w';
  const boardTopSide = opposite(boardBottomSide);
  const displayedFiles = boardBottomSide === 'w' ? allFiles : [...allFiles].reverse();
  const displayedRanks = boardBottomSide === 'w' ? [...allRanks].reverse() : allRanks;
  const activeBoardTheme = BOARD_THEMES[boardTheme];
  const activePieceThemeLabel = PIECE_THEME_OPTIONS.find((theme) => theme.id === pieceTheme)?.label ?? 'Cburnett';
  const lastMoveUci = snapshot.moves?.at(-1) ?? null;
  const lastMove = lastMoveUci && /^[a-h][1-8][a-h][1-8]/.test(lastMoveUci)
    ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) }
    : null;
  const movePairs = useMemo(() => notationFromMoves(snapshot.moves ?? []), [snapshot.moves]);
  const isRunning = snapshot.status === 'RUNNING';
  const drawOfferForMe = Boolean(mySide && snapshot.drawOfferBy === opposite(mySide));
  const drawOfferFromMe = Boolean(mySide && snapshot.drawOfferBy === mySide);

  const applySnapshot = useCallback((nextSnapshot: MultiplayerSnapshot) => {
    const previousSnapshot = snapshotRef.current;
    const previousFen = previousSnapshot.fen || previousSnapshot.currentFen || startFen;
    const nextFen = nextSnapshot.fen || nextSnapshot.currentFen || startFen;
    const positionChanged = previousFen !== nextFen
      || (previousSnapshot.moves?.length ?? 0) !== (nextSnapshot.moves?.length ?? 0);
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    const nextClocks = liveClocksFromSnapshot(nextSnapshot, clocksRef.current);
    clocksRef.current = nextClocks;
    setClocks(nextClocks);
    lastClockTickRef.current = Date.now();
    if (positionChanged || nextSnapshot.status === 'ENDED') {
      setSelected(null);
      setLegalTargets([]);
      setMovePending(false);
    }
    failureCountRef.current = 0;
    setConnectionError(null);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!gameId || !accessTokenRef.current) return;
    const requestSequence = ++requestSequenceRef.current;
    try {
      const nextSnapshot = await fetchMultiplayerSnapshot(gameId, accessTokenRef.current);
      if (!mountedRef.current || requestSequence < appliedSequenceRef.current) return;
      appliedSequenceRef.current = requestSequence;
      applySnapshot(nextSnapshot);
    } catch (caught) {
      failureCountRef.current += 1;
      if (failureCountRef.current >= 3) {
        setConnectionError('Connection interrupted. Reconnecting to the royal arena…');
      }
      if (__DEV__) console.error('[Multiplayer snapshot failed]', caught);
    }
  }, [applySnapshot, gameId]);

  useEffect(() => {
    mountedRef.current = true;
    lastClockTickRef.current = Date.now();
    void (async () => {
      if (!gameId) {
        setConnectionError('This multiplayer game could not be identified.');
        setLoading(false);
        return;
      }
      const session = await restoreSession();
      if (!mountedRef.current) return;
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      accessTokenRef.current = session.accessToken;
      const preferences = await loadChessPreferences(session.accessToken);
      if (!mountedRef.current) return;
      setBoardTheme(preferences.boardTheme);
      setPieceTheme(preferences.pieceTheme);
      try {
        const joined = await joinMultiplayerGame(gameId, session.accessToken);
        if (!mountedRef.current) return;
        setRole(joined.role ?? 'SPECTATOR');
        const nextSnapshot = await fetchMultiplayerSnapshot(gameId, session.accessToken);
        if (!mountedRef.current) return;
        applySnapshot(nextSnapshot);
      } catch (caught) {
        setConnectionError(caught instanceof Error ? caught.message : 'The game could not be opened.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [applySnapshot, gameId]);

  useEffect(() => {
    if (loading || !gameId) return;
    const poller = setInterval(() => {
      if (AppState.currentState === 'active') void refreshSnapshot();
    }, isRunning ? 1000 : 1800);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSnapshot();
    });
    return () => {
      clearInterval(poller);
      appStateSubscription.remove();
    };
  }, [gameId, isRunning, loading, refreshSnapshot]);

  useEffect(() => {
    const clockTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - lastClockTickRef.current);
      lastClockTickRef.current = now;
      if (AppState.currentState !== 'active' || snapshotRef.current.status !== 'RUNNING') return;
      const activeSide = normalizeTurn(snapshotRef.current.turn);
      const nextClocks = {
        ...clocksRef.current,
        [activeSide]: Math.max(0, clocksRef.current[activeSide] - elapsed),
      };
      clocksRef.current = nextClocks;
      setClocks(nextClocks);
    }, 100);
    return () => clearInterval(clockTimer);
  }, []);

  function changeBoardTheme(nextBoardTheme: BoardThemeName) {
    setBoardTheme(nextBoardTheme);
    void saveChessPreferences({ boardTheme: nextBoardTheme, pieceTheme }, accessTokenRef.current);
  }

  function changePieceTheme(nextPieceTheme: PieceThemeName) {
    setPieceTheme(nextPieceTheme);
    void saveChessPreferences({ boardTheme, pieceTheme: nextPieceTheme }, accessTokenRef.current);
  }

  function selectSquare(square: Square) {
    if (!isRunning || !mySide || movePending || actionPending || currentTurn !== mySide) return;
    const clickedPiece = game.get(square);
    if (selected && legalTargets.includes(square)) {
      const mover = game.get(selected);
      if (mover?.type === 'p' && (square.endsWith('1') || square.endsWith('8'))) {
        setPendingPromotion({ from: selected, to: square });
        setSelected(null);
        setLegalTargets([]);
        return;
      }
      void submitMove(selected, square);
      return;
    }
    if (clickedPiece?.color === mySide) {
      setSelected(square);
      setLegalTargets(game.moves({ square, verbose: true }).map((move) => move.to));
      return;
    }
    setSelected(null);
    setLegalTargets([]);
  }

  async function submitMove(from: Square, to: Square, promotion?: PromotionPiece) {
    if (!accessTokenRef.current || movePending) return;
    setMovePending(true);
    setConnectionError(null);
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    try {
      await playMultiplayerMove(gameId, `${from}${to}${promotion ?? ''}`, accessTokenRef.current);
      await refreshSnapshot();
    } catch (caught) {
      setConnectionError(caught instanceof Error ? caught.message : 'Your move was not accepted.');
      setMovePending(false);
      await refreshSnapshot();
    }
  }

  async function applyAction(action: () => Promise<MultiplayerSnapshot>) {
    if (actionPending) return;
    setActionPending(true);
    try {
      const nextSnapshot = await action();
      appliedSequenceRef.current = ++requestSequenceRef.current;
      applySnapshot(nextSnapshot);
    } catch (caught) {
      Alert.alert('Action unavailable', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setActionPending(false);
    }
  }

  function drawAction() {
    if (!accessTokenRef.current || !mySide) return;
    if (drawOfferForMe) {
      Alert.alert('Opponent offers a draw', 'Accept the draw or continue the battle?', [
        {
          onPress: () => void applyAction(() => declineMultiplayerDraw(gameId, accessTokenRef.current)),
          style: 'cancel',
          text: 'Decline',
        },
        {
          onPress: () => void applyAction(() => acceptMultiplayerDraw(gameId, accessTokenRef.current)),
          text: 'Accept Draw',
        },
      ]);
      return;
    }
    Alert.alert('Offer a draw?', 'Your opponent may accept or decline this offer.', [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: () => void applyAction(() => offerMultiplayerDraw(gameId, accessTokenRef.current)),
        text: 'Offer Draw',
      },
    ]);
  }

  function resign() {
    if (!accessTokenRef.current) return;
    Alert.alert('Resign this battle?', 'Your opponent will be declared the winner.', [
      { style: 'cancel', text: 'Continue Playing' },
      {
        onPress: () => void applyAction(() => resignMultiplayerGame(gameId, accessTokenRef.current)),
        style: 'destructive',
        text: 'Resign',
      },
    ]);
  }

  if (loading) {
    return (
      <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
        <CivBackdrop />
        <SafeAreaView edges={['top', 'bottom']} style={styles.loading}>
          <ActivityIndicator color={colors.goldLight} size="large" />
          <Text style={styles.loadingText}>Joining the battle…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#06111c', '#160f0b', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Royal Arena" />
        <ScrollView contentContainerStyle={styles.content} removeClippedSubviews={false} showsVerticalScrollIndicator={false}>
          <PlayerBar
            active={isRunning && currentTurn === boardTopSide}
            clock={clocks[boardTopSide]}
            name={playerName(snapshot, boardTopSide)}
            pieceTheme={pieceTheme}
            provisional={boardTopSide === 'w' ? snapshot.whiteProvisional : snapshot.blackProvisional}
            rating={boardTopSide === 'w' ? snapshot.whiteRating : snapshot.blackRating}
            side={boardTopSide}
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

          <View style={[styles.boardFrame, { backgroundColor: activeBoardTheme.frameDark, borderColor: activeBoardTheme.frameLight, height: boardSize, width: boardSize }]}>
            {displayedRanks.map((rank, rowIndex) => (
              <View key={rank} style={[styles.boardRow, { height: squareSize }]}>
                {displayedFiles.map((file, columnIndex) => {
                  const square = `${file}${rank}` as Square;
                  const piece = game.get(square);
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
                        { backgroundColor: isLight ? activeBoardTheme.light : activeBoardTheme.dark, height: squareSize, width: squareSize },
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
                      {columnIndex === 0 ? <Text style={[styles.rankLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{rank}</Text> : null}
                      {rowIndex === 7 ? <Text style={[styles.fileLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{file}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <PlayerBar
            active={isRunning && currentTurn === boardBottomSide}
            clock={clocks[boardBottomSide]}
            name={playerName(snapshot, boardBottomSide)}
            pieceTheme={pieceTheme}
            provisional={boardBottomSide === 'w' ? snapshot.whiteProvisional : snapshot.blackProvisional}
            rating={boardBottomSide === 'w' ? snapshot.whiteRating : snapshot.blackRating}
            side={boardBottomSide}
          />

          <View style={styles.statusPanel}>
            {snapshot.status === 'ENDED' ? (
              <>
                <Text style={styles.resultTitle}>{resultTitle(snapshot, mySide)}</Text>
                <Text style={styles.resultMeta}>{snapshot.resultCode ?? ''} · {(snapshot.termination ?? snapshot.result ?? 'GAME OVER').replaceAll('_', ' ')}</Text>
              </>
            ) : connectionError ? (
              <>
                <Text style={styles.errorText}>{connectionError}</Text>
                <Pressable onPress={() => void refreshSnapshot()} style={styles.retryButton}>
                  <Text style={styles.retryLabel}>Reconnect Now</Text>
                </Pressable>
              </>
            ) : drawOfferForMe ? (
              <Text style={styles.drawOfferText}>Your opponent offers a draw.</Text>
            ) : drawOfferFromMe ? (
              <Text style={styles.turnText}>Draw offer sent. Waiting for your opponent.</Text>
            ) : movePending ? (
              <View style={styles.pendingRow}>
                <ActivityIndicator color={colors.goldLight} size="small" />
                <Text style={styles.turnText}>Confirming your move…</Text>
              </View>
            ) : (
              <Text style={styles.turnText}>
                {role === 'SPECTATOR' ? `${sideName(currentTurn)} to move` : currentTurn === mySide ? 'Your move' : 'Opponent is thinking…'}
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
              onPress={() => router.replace('/play')}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <SymbolView name={{ android: 'home', ios: 'house.fill', web: 'home' }} size={18} tintColor={colors.goldLight} />
              <Text style={styles.secondaryLabel}>Play Menu</Text>
            </Pressable>
            {isRunning && role !== 'SPECTATOR' ? (
              <Pressable
                accessibilityRole="button"
                disabled={actionPending || drawOfferFromMe || (!drawOfferForMe && snapshot.canOfferDraw === false)}
                onPress={drawAction}
                style={({ pressed }) => [styles.drawButton, (actionPending || drawOfferFromMe || (!drawOfferForMe && snapshot.canOfferDraw === false)) && styles.disabledButton, pressed && styles.pressed]}>
                <Text style={styles.drawLabel}>{drawOfferForMe ? 'Respond to Draw' : drawOfferFromMe ? 'Offered' : 'Offer Draw'}</Text>
              </Pressable>
            ) : null}
            {isRunning && role !== 'SPECTATOR' ? (
              <Pressable accessibilityRole="button" disabled={actionPending} onPress={resign} style={({ pressed }) => [styles.resignButton, actionPending && styles.disabledButton, pressed && styles.pressed]}>
                <Text style={styles.resignLabel}>Resign</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal animationType="fade" transparent visible={Boolean(pendingPromotion)} onRequestClose={() => setPendingPromotion(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.promotionPanel}>
            <Text style={styles.promotionTitle}>Choose Your Champion</Text>
            <Text style={styles.promotionSubtitle}>Select the piece for promotion.</Text>
            <View style={styles.promotionRow}>
              {(['q', 'r', 'b', 'n'] as PromotionPiece[]).map((promotion) => (
                <Pressable
                  accessibilityLabel={`Promote to ${promotion}`}
                  accessibilityRole="button"
                  key={promotion}
                  onPress={() => pendingPromotion && void submitMove(pendingPromotion.from, pendingPromotion.to, promotion)}
                  style={({ pressed }) => [styles.promotionChoice, pressed && styles.pressed]}>
                  <Image
                    contentFit="contain"
                    source={PIECE_ASSETS[pieceTheme][pieceKey(mySide ?? 'w', promotion)]}
                    style={styles.promotionPiece}
                  />
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

function resultTitle(snapshot: MultiplayerSnapshot, mySide: MultiplayerSide | null) {
  const winner = snapshot.winnerColor
    ?? (snapshot.resultCode === '1-0' ? 'w' : snapshot.resultCode === '0-1' ? 'b' : null);
  if (!winner) return snapshot.resultCode === '1/2-1/2' ? 'The battle ends in a draw' : 'The battle has ended';
  if (!mySide) return winner === 'w' ? 'White is victorious' : 'Black is victorious';
  return winner === mySide ? 'Victory' : 'Defeat';
}

function PlayerBar({
  active,
  clock,
  name,
  pieceTheme,
  provisional,
  rating,
  side,
}: {
  active: boolean;
  clock: number;
  name: string;
  pieceTheme: PieceThemeName;
  provisional?: boolean | null;
  rating?: number | null;
  side: MultiplayerSide;
}) {
  return (
    <View style={[styles.playerBar, active && styles.playerBarActive]}>
      <View style={[styles.sideMedallion, side === 'w' ? styles.whiteMedallion : styles.blackMedallion]}>
        <Image contentFit="contain" source={PIECE_ASSETS[pieceTheme][side === 'w' ? 'wK' : 'bK']} style={styles.sideKingImage} />
      </View>
      <View style={styles.playerIdentity}>
        <Text numberOfLines={1} style={styles.playerName}>{name}</Text>
        <Text style={styles.playerDetail}>{rating ?? 'Unrated'}{provisional ? '?' : ''} · {sideName(side)}</Text>
      </View>
      <Text style={[styles.clock, active && styles.clockActive]}>{formatClock(clock)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: colors.sandstone, fontFamily: 'serif', fontSize: 16, marginTop: 14 },
  content: { alignItems: 'center', paddingBottom: 24, paddingHorizontal: 12, paddingTop: 12 },
  playerBar: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: '#6e4d25', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginVertical: 7, maxWidth: 520, minHeight: 58, paddingHorizontal: 10, width: '100%' },
  playerBarActive: { borderColor: colors.goldLight, shadowColor: colors.gold, shadowOpacity: 0.36, shadowRadius: 6 },
  sideMedallion: { alignItems: 'center', borderRadius: 21, borderWidth: 1.5, height: 42, justifyContent: 'center', width: 42 },
  whiteMedallion: { backgroundColor: '#f0dfb8', borderColor: colors.gold },
  blackMedallion: { backgroundColor: '#1b1712', borderColor: colors.gold },
  sideKingImage: { height: 36, width: 36 },
  playerIdentity: { flex: 1, marginLeft: 9 },
  playerName: { color: colors.cream, fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  playerDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  clock: { color: colors.sandstone, fontFamily: 'monospace', fontSize: 22, fontWeight: '900', marginLeft: 8, textAlign: 'right', width: 82 },
  clockActive: { color: colors.goldLight },
  themeButton: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginBottom: 7, maxWidth: 520, minHeight: 42, paddingHorizontal: 11, width: '100%' },
  themeButtonIcon: { color: colors.goldLight, fontSize: 22, marginRight: 8 },
  themeButtonText: { color: colors.sandstone, flex: 1, fontSize: 12, fontWeight: '800' },
  themeButtonAction: { color: colors.goldLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  boardFrame: { borderRadius: 5, borderWidth: 4, elevation: 10, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.7, shadowRadius: 10 },
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
  statusPanel: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.92)', borderColor: colors.border, borderRadius: 11, borderWidth: 1, marginTop: 7, maxWidth: 520, minHeight: 49, paddingHorizontal: 12, paddingVertical: 9, width: '100%' },
  pendingRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  turnText: { color: colors.sandstone, fontFamily: 'serif', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  resultTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900' },
  resultMeta: { color: colors.sandstone, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  drawOfferText: { color: colors.goldLight, fontFamily: 'serif', fontSize: 14, fontWeight: '900' },
  errorText: { color: '#fecdd3', fontSize: 11, textAlign: 'center' },
  retryButton: { borderBottomColor: colors.goldLight, borderBottomWidth: 1, marginTop: 6, paddingBottom: 2 },
  retryLabel: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  moveStrip: { maxWidth: 520, paddingHorizontal: 6, paddingTop: 7, width: '100%' },
  movesText: { color: colors.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 11, maxWidth: 520, width: '100%' },
  secondaryButton: { alignItems: 'center', backgroundColor: 'rgba(20, 24, 25, 0.95)', borderColor: colors.gold, borderRadius: 11, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 45 },
  secondaryLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 12, fontWeight: '900' },
  drawButton: { alignItems: 'center', backgroundColor: '#172b35', borderColor: colors.gold, borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 45 },
  drawLabel: { color: colors.goldLight, fontFamily: 'serif', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  resignButton: { alignItems: 'center', backgroundColor: '#67151a', borderColor: '#b96b58', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 45 },
  resignLabel: { color: colors.cream, fontFamily: 'serif', fontSize: 13, fontWeight: '900' },
  disabledButton: { opacity: 0.42 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.82)', flex: 1, justifyContent: 'center', padding: 24 },
  promotionPanel: { alignItems: 'center', backgroundColor: '#111a21', borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1.5, maxWidth: 420, padding: 22, width: '100%' },
  promotionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 23, fontWeight: '900' },
  promotionSubtitle: { color: colors.sandstone, fontSize: 12, marginTop: 5 },
  promotionRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  promotionChoice: { alignItems: 'center', backgroundColor: '#f0dfb8', borderColor: colors.gold, borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 68 },
  promotionPiece: { height: 58, width: 58 },
  cancelPromotion: { borderBottomColor: colors.goldLight, borderBottomWidth: 1, marginTop: 20, paddingBottom: 2 },
  cancelPromotionText: { color: colors.goldLight, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
