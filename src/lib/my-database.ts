import { deleteAuthorizedJson, getJson, postAuthorizedJson } from '@/lib/api';
import { restoreSession } from '@/lib/session';

export type MyDatabaseCollection = {
  gameCount: number;
  id: number;
  kind: 'CUSTOM' | 'SYSTEM';
  name: string;
};

export type MyDatabaseGame = {
  analysis?: MyDatabaseGameAnalysis | null;
  blackRating?: number | null;
  blackRatingDelta?: number | null;
  blackUsername?: string | null;
  ecoCode?: string | null;
  id: number;
  initialFen?: string | null;
  moveCount: number;
  movesUci?: string | null;
  openingName?: string | null;
  playedAt?: string | null;
  rated?: boolean | null;
  resultCode?: string | null;
  setupMoveText?: string | null;
  startingPositionName?: string | null;
  termination?: string | null;
  timeControl?: string | null;
  tournamentName?: string | null;
  whiteRating?: number | null;
  whiteRatingDelta?: number | null;
  whiteUsername?: string | null;
};

export type MyDatabasePhaseAnalysis = {
  boundaryReason?: string | null;
  confidence?: number | null;
  difficulty?: string | null;
  endPly?: number | null;
  materialSignature?: string | null;
  phase: 'ENDGAME' | 'MIDDLEGAME' | 'OPENING';
  primaryClassification?: string | null;
  startPly?: number | null;
  state: 'NOT_REACHED' | 'PRESENT';
  tags: string[];
};

export type MyDatabaseGameAnalysis = {
  analyzedAt?: string | null;
  analyzerVersion: string;
  phases: MyDatabasePhaseAnalysis[];
  status: 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'QUEUED';
};

export type MyDatabaseAnalyticsCount = { code: string; count: number; percentage: number };

export type MyDatabasePhaseAnalytics = {
  averageEndPly?: number | null;
  averageStartPly?: number | null;
  notReachedGames: number;
  phase: 'ENDGAME' | 'MIDDLEGAME' | 'OPENING';
  reachedGames: number;
  topClassifications: MyDatabaseAnalyticsCount[];
  topTags: MyDatabaseAnalyticsCount[];
};

export type MyDatabaseCollectionAnalytics = {
  analyzedGames: number;
  analyzingGames: number;
  collectionId: number;
  collectionName: string;
  draws: number;
  failedGames: number;
  losses: number;
  phases: MyDatabasePhaseAnalytics[];
  queuedGames: number;
  totalGames: number;
  wins: number;
};

export type MyDatabaseWdl = {
  draws: number;
  losses: number;
  total: number;
  wins: number;
};

export type MyDatabaseOpeningNode = {
  asBlack: MyDatabaseWdl;
  asWhite: MyDatabaseWdl;
  displayName: string;
  ecoCodes?: string | null;
  gameCount: number;
  id: number;
  name: string;
  nodeType: string;
  overall: MyDatabaseWdl;
  parentId?: number | null;
};

export type MyDatabaseOpeningExplorer = {
  asBlack: MyDatabaseWdl;
  asWhite: MyDatabaseWdl;
  collectionId: number;
  collectionName: string;
  nodes: MyDatabaseOpeningNode[];
  totalGames: number;
};

export type MyDatabaseGamePage = {
  items: MyDatabaseGame[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type MyDatabaseReviewSideSummary = {
  accuracy?: number | null;
  brilliant: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
};

export type MyDatabaseReviewLine = {
  rank: number;
  moveUci?: string | null;
  moveSan?: string | null;
  evaluationCp?: number | null;
  mate?: number | null;
  principalVariationUci?: string | null;
  principalVariationSan?: string | null;
  evaluationSymbol: string;
  evaluationText: string;
};

export type MyDatabaseMoveReview = {
  bestMoveSan?: string | null;
  bestMoveUci?: string | null;
  centipawnLoss?: number | null;
  classification: 'BLUNDER' | 'BEST' | 'BRILLIANT' | 'EXCELLENT' | 'GOOD' | 'INACCURACY' | 'MISTAKE';
  commentary: string;
  confidence?: number | null;
  engineDepth?: number | null;
  evaluationAfterCp?: number | null;
  evaluationBeforeCp?: number | null;
  fenAfter: string;
  fenBefore: string;
  mateAfter?: number | null;
  mateBefore?: number | null;
  moveNumber: number;
  playedMoveSan?: string | null;
  playedMoveUci: string;
  ply: number;
  principalVariationSan?: string | null;
  principalVariationUci?: string | null;
  candidateLines?: MyDatabaseReviewLine[] | null;
  side: 'b' | 'w';
  symbol?: string | null;
};

export type MyDatabaseGameReview = {
  analyzedAt?: string | null;
  analyzerVersion: string;
  black: MyDatabaseReviewSideSummary;
  engineDepth?: number | null;
  engineName?: string | null;
  engineVersion?: string | null;
  errorCode?: string | null;
  gameId: number;
  moves: MyDatabaseMoveReview[];
  queuedAt?: string | null;
  startedAt?: string | null;
  status: 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'NOT_REQUESTED' | 'QUEUED';
  summaryCommentary?: string | null;
  white: MyDatabaseReviewSideSummary;
};

async function token() {
  const session = await restoreSession();
  if (!session) throw new Error('Please sign in to open My Database.');
  return session.accessToken;
}

export async function fetchMyDatabaseCollections() {
  return getJson<MyDatabaseCollection[]>('/api/v1/my-database/collections', await token());
}

export async function fetchMyDatabaseGames(collectionId: number, page = 0, size = 20) {
  return getJson<MyDatabaseGamePage>(
    `/api/v1/my-database/collections/${collectionId}/games?page=${page}&size=${size}`,
    await token(),
  );
}

export async function fetchMyDatabaseAnalytics(collectionId: number) {
  return getJson<MyDatabaseCollectionAnalytics>(
    `/api/v1/my-database/collections/${collectionId}/analytics`,
    await token(),
  );
}

export async function fetchMyDatabaseOpenings(collectionId: number) {
  return getJson<MyDatabaseOpeningExplorer>(
    `/api/v1/my-database/collections/${collectionId}/openings`,
    await token(),
  );
}

export async function fetchMyDatabaseOpeningGames(
  collectionId: number,
  nodeId: number,
  page = 0,
  size = 20,
) {
  return getJson<MyDatabaseGamePage>(
    `/api/v1/my-database/collections/${collectionId}/openings/${nodeId}/games?page=${page}&size=${size}`,
    await token(),
  );
}

export async function createMyDatabaseCollection(name: string) {
  return postAuthorizedJson<MyDatabaseCollection>(
    '/api/v1/my-database/collections',
    { name },
    await token(),
  );
}

export async function deleteMyDatabaseCollection(collectionId: number) {
  return deleteAuthorizedJson<{ ok: boolean }>(
    `/api/v1/my-database/collections/${collectionId}`,
    await token(),
  );
}

export async function fetchMyDatabaseGameReview(gameId: number) {
  return getJson<MyDatabaseGameReview>(
    `/api/v1/my-database/games/${gameId}/review`,
    await token(),
  );
}

export async function queueMyDatabaseGameReview(gameId: number) {
  return postAuthorizedJson<MyDatabaseGameReview>(
    `/api/v1/my-database/games/${gameId}/review`,
    {},
    await token(),
  );
}
