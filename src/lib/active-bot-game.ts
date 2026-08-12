import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chess, type Square } from 'chess.js';

const ACTIVE_BOT_GAME_KEY = 'chessperfect.activeBotGame.v1';

export type BotGameSide = 'b' | 'w';

export type ActiveBotGame = {
  archiveKey: string;
  botDrawOfferSeen: boolean;
  botOfferedDraw: boolean;
  clocks: Record<BotGameSide, number>;
  createdAt: number;
  fen: string;
  lastMove: { from: Square; to: Square } | null;
  level: number;
  movesSan: string[];
  movesUci: string[];
  ownerUsername: string;
  timeControl: string;
  updatedAt: number;
  userSide: BotGameSide;
  version: 1;
};

function isSide(value: unknown): value is BotGameSide {
  return value === 'b' || value === 'w';
}

function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
}

function isActiveBotGame(value: unknown): value is ActiveBotGame {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<ActiveBotGame>;
  return game.version === 1
    && typeof game.archiveKey === 'string'
    && typeof game.botDrawOfferSeen === 'boolean'
    && typeof game.botOfferedDraw === 'boolean'
    && typeof game.createdAt === 'number'
    && typeof game.fen === 'string'
    && typeof game.level === 'number'
    && Array.isArray(game.movesSan)
    && game.movesSan.every((move) => typeof move === 'string')
    && Array.isArray(game.movesUci)
    && game.movesUci.every((move) => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
    && game.movesSan.length === game.movesUci.length
    && typeof game.ownerUsername === 'string'
    && typeof game.timeControl === 'string'
    && typeof game.updatedAt === 'number'
    && Number.isFinite(game.updatedAt)
    && Number.isFinite(game.createdAt)
    && isSide(game.userSide)
    && Boolean(game.clocks)
    && typeof game.clocks?.b === 'number'
    && typeof game.clocks?.w === 'number'
    && Number.isFinite(game.clocks.b)
    && Number.isFinite(game.clocks.w)
    && (game.lastMove === null
      || Boolean(game.lastMove)
        && isSquare(game.lastMove?.from)
        && isSquare(game.lastMove?.to));
}

export function rebuildBotGame(movesUci: readonly string[]) {
  const game = new Chess();
  for (const uci of movesUci) {
    const move = game.move({
      from: uci.slice(0, 2),
      promotion: (uci[4] || 'q') as 'b' | 'n' | 'q' | 'r',
      to: uci.slice(2, 4),
    });
    if (!move) throw new Error('ACTIVE_BOT_GAME_INVALID_MOVE');
  }
  return game;
}

export function elapsedClocks(
  clocks: Record<BotGameSide, number>,
  activeSide: BotGameSide,
  elapsedMillis: number,
) {
  return {
    ...clocks,
    [activeSide]: Math.max(0, clocks[activeSide] - Math.max(0, elapsedMillis)),
  };
}

export async function loadActiveBotGame(ownerUsername?: string) {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_BOT_GAME_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isActiveBotGame(parsed)) {
      await clearActiveBotGame();
      return null;
    }
    if (ownerUsername && parsed.ownerUsername.toLowerCase() !== ownerUsername.toLowerCase()) {
      return null;
    }

    const rebuilt = rebuildBotGame(parsed.movesUci);
    if (rebuilt.fen() !== parsed.fen || rebuilt.isGameOver()) {
      await clearActiveBotGame();
      return null;
    }
    return parsed;
  } catch {
    await clearActiveBotGame();
    return null;
  }
}

export async function saveActiveBotGame(game: ActiveBotGame) {
  await AsyncStorage.setItem(ACTIVE_BOT_GAME_KEY, JSON.stringify(game));
}

export async function clearActiveBotGame() {
  await AsyncStorage.removeItem(ACTIVE_BOT_GAME_KEY);
}
