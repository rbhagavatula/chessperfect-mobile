import { postAuthorizedJson, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { restoreSession } from '@/lib/session';

export type PositionAnalysisLine = {
  bestMove?: string | null;
  centipawns?: number | null;
  depth?: number | null;
  mate?: number | null;
  principalVariation?: string | null;
};

export type PositionAnalysis = PositionAnalysisLine & {
  lines?: PositionAnalysisLine[] | null;
};

export async function analyzePosition(
  fen: string,
  depth = 14,
  accessToken?: string,
  maxLines = 5,
  origin?: string,
) {
  const token = accessToken ?? (await restoreSession())?.accessToken;
  if (!token) throw new Error('AUTH_REQUIRED');
  const body = { depth, fen, maxLines: Math.max(1, Math.min(5, maxLines)) };
  return origin
    ? postAuthorizedJsonFromOrigin<PositionAnalysis>('/api/v1/games/analysis', origin, body, token, 20_000)
    : postAuthorizedJson<PositionAnalysis>('/api/v1/games/analysis', body, token, 20_000);
}
