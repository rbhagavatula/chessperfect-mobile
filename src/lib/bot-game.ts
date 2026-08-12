import { postAuthorizedJson } from '@/lib/api';
import { restoreSession } from '@/lib/session';

export type BotColor = 'black' | 'random' | 'white';
export type BotSpeed = 'Blitz' | 'Bullet' | 'Classical' | 'Rapid';

export type BotLevel = {
  elo: number;
  label: string;
  level: number;
};

export const botLevels: readonly BotLevel[] = [
  { elo: 800, label: 'Novice', level: 1 },
  { elo: 1000, label: 'Apprentice', level: 2 },
  { elo: 1200, label: 'Squire', level: 3 },
  { elo: 1400, label: 'Knight', level: 4 },
  { elo: 1600, label: 'Captain', level: 5 },
  { elo: 1800, label: 'Commander', level: 6 },
  { elo: 2000, label: 'Champion', level: 7 },
  { elo: 2200, label: 'Master', level: 8 },
  { elo: 2400, label: 'Grandmaster', level: 9 },
  { elo: 2650, label: 'Maharaja', level: 10 },
];

export const botTimeControls: Record<BotSpeed, readonly string[]> = {
  Bullet: ['1+0', '1+1', '2+1'],
  Blitz: ['3+0', '3+2', '5+0', '5+3'],
  Rapid: ['10+0', '10+5', '15+10'],
  Classical: ['30+0', '90+30'],
};

export function normalizeBotSpeed(value?: string): BotSpeed {
  if (value === 'Bullet' || value === 'Blitz' || value === 'Rapid' || value === 'Classical') {
    return value;
  }
  return 'Rapid';
}

export function parseTimeControl(value: string) {
  const [minutesText, incrementText] = value.split('+');
  const minutes = Math.max(1, Number.parseInt(minutesText || '10', 10) || 10);
  const incrementSeconds = Math.max(0, Number.parseInt(incrementText || '0', 10) || 0);
  return { incrementSeconds, initialMillis: minutes * 60_000 };
}

export function formatClock(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

async function requireSession() {
  const session = await restoreSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export async function requestBotMove(fen: string, level: number) {
  const session = await requireSession();
  const response = await postAuthorizedJson<{
    elo: number;
    level: number;
    move: string;
    offerDraw: boolean;
    skill: number;
  }>(
    '/api/v1/games/bot/move',
    { fen, level },
    session.accessToken,
  );
  return { ...response, source: 'server' as const };
}

export async function requestBotDrawOffer(fen: string, level: number) {
  const session = await requireSession();
  return postAuthorizedJson<{ accepted: boolean }>(
    '/api/v1/games/bot/draw-offer',
    { fen, level },
    session.accessToken,
  );
}

export type ArchiveBotGame = {
  archiveKey: string;
  blackUsername: string;
  finalFen: string;
  moveCount: number;
  movesUci: string;
  playedAt: string;
  resultCode: string;
  status: 'BLACK_WIN' | 'DRAW' | 'WHITE_WIN';
  termination: string;
  timeControl: string;
  whiteUsername: string;
  winnerColor: 'b' | 'w' | null;
};

export async function archiveBotGame(game: ArchiveBotGame) {
  const session = await requireSession();
  return postAuthorizedJson<{ ok: boolean }>(
    '/api/v1/my-database/games/bot',
    game,
    session.accessToken
  );
}
