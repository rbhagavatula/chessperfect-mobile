import { getJson, postAuthorizedJson } from '@/lib/api';
import { restoreSession } from '@/lib/session';

export type MultiplayerRole = 'BLACK' | 'SPECTATOR' | 'WHITE';
export type MultiplayerSide = 'b' | 'w';

export type MultiplayerSnapshot = {
  black?: string | null;
  blackDisplayName?: string | null;
  blackMillis?: number | null;
  blackProvisional?: boolean | null;
  blackRating?: number | null;
  blackRatingDelta?: number | null;
  bothJoined?: boolean | null;
  canOfferDraw?: boolean | null;
  currentFen?: string | null;
  drawOfferBy?: MultiplayerSide | null;
  fen?: string | null;
  id?: string | null;
  lastMoveAt?: number | null;
  moves?: string[] | null;
  result?: string | null;
  resultCode?: string | null;
  serverNow?: number | null;
  status?: string | null;
  termination?: string | null;
  timeControl?: string | null;
  turn?: 'BLACK' | 'WHITE' | MultiplayerSide | null;
  white?: string | null;
  whiteDisplayName?: string | null;
  whiteMillis?: number | null;
  whiteProvisional?: boolean | null;
  whiteRating?: number | null;
  whiteRatingDelta?: number | null;
  winnerColor?: MultiplayerSide | null;
};

export type ActiveSeek = {
  active: boolean;
  gameId?: string;
  matched?: boolean;
  preferredColor?: string;
  seekId?: string;
  status?: string;
  timeControl?: string;
};

export type OngoingMultiplayerGame = {
  black: string;
  blackRating?: number | null;
  id: string;
  status?: string;
  timeControl: string;
  white: string;
  whiteRating?: number | null;
};

async function requireAccessToken(accessToken?: string) {
  if (accessToken) return accessToken;
  const session = await restoreSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return session.accessToken;
}

export async function createMultiplayerSeek(
  timeControl: string,
  rated: boolean,
  preferredColor: 'black' | 'white' | null,
  accessToken?: string,
) {
  const token = await requireAccessToken(accessToken);
  return postAuthorizedJson<{
    expiresAt?: string;
    preferredColor?: string;
    seekId: string;
    status?: string;
    timeControl?: string;
  }>(
    '/api/v1/lobby/seek',
    { preferredColor, rated, timeControl },
    token,
  );
}

export async function cancelMultiplayerSeek(accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return postAuthorizedJson<{ canceled: boolean; reason?: string }>(
    '/api/v1/lobby/cancel',
    {},
    token,
  );
}

export async function fetchActiveSeek(accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return getJson<ActiveSeek>('/api/v1/lobby/active', token);
}

export async function fetchCurrentMultiplayerGame(accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return getJson<OngoingMultiplayerGame | null>('/api/v1/games/ongoing/me', token);
}

export async function joinMultiplayerGame(gameId: string, accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return postAuthorizedJson<{ actor?: string; role?: MultiplayerRole }>(
    `/api/v1/games/${gameId}/join`,
    {},
    token,
  );
}

export async function fetchMultiplayerSnapshot(gameId: string, accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return getJson<MultiplayerSnapshot>(
    `/api/v1/games/${gameId}/snapshot`,
    token,
  );
}

export async function playMultiplayerMove(gameId: string, uci: string, accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return postAuthorizedJson<{ fen: string; message?: string; status?: string }>(
    `/api/v1/games/${gameId}/move`,
    { uci },
    token,
  );
}

async function multiplayerAction(gameId: string, action: string, accessToken?: string) {
  const token = await requireAccessToken(accessToken);
  return postAuthorizedJson<MultiplayerSnapshot>(
    `/api/v1/games/${gameId}/${action}`,
    {},
    token,
  );
}

export function resignMultiplayerGame(gameId: string, accessToken?: string) {
  return multiplayerAction(gameId, 'resign', accessToken);
}

export function offerMultiplayerDraw(gameId: string, accessToken?: string) {
  return multiplayerAction(gameId, 'draw/offer', accessToken);
}

export function acceptMultiplayerDraw(gameId: string, accessToken?: string) {
  return multiplayerAction(gameId, 'draw/accept', accessToken);
}

export function declineMultiplayerDraw(gameId: string, accessToken?: string) {
  return multiplayerAction(gameId, 'draw/decline', accessToken);
}
