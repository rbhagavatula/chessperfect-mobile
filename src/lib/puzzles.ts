import { getJson, postAuthorizedJson } from '@/lib/api';
import { restoreSession } from '@/lib/session';

export type PuzzleDifficulty = 'EASY' | 'NORMAL' | 'MEDIUM' | 'HARD' | 'HARDEST';
export type PuzzleDifficultyMode = 'ANY' | 'EASY' | 'NORMAL' | 'HARD' | 'HARDEST' | 'PROGRESSIVE';

export type PuzzleSummary = {
  attemptedPlayerCount?: number;
  attemptsCount: number;
  averageAttemptedPlayerRating?: number | null;
  beta: boolean;
  createdAt: string;
  difficulty: PuzzleDifficulty;
  dislikeCount?: number;
  fen: string;
  id: number;
  likeCount?: number;
  primaryCategory?: string;
  rating: number;
  secondaryTags?: string[];
  sideToMove: string;
  solvedCount: number;
  sourceLabel: string;
  themes: string[];
  title: string;
};

export type PuzzleDetail = PuzzleSummary & {
  engineDepth?: number | null;
  evalSwingCp?: number | null;
  firstAttemptSolvedCount: number;
  mateIn?: number | null;
  myReaction?: 'LIKE' | 'DISLIKE' | null;
  principalVariation: string;
  solutionSan: string;
  solutionTreeJson?: string;
  solutionUci: string;
  status: 'BETA_PUBLIC' | 'RETIRED';
};

export type PuzzlePageResponse = {
  content: PuzzleSummary[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type PlayerPuzzleRating = {
  attemptsCount: number;
  bestStreak: number;
  currentStreak: number;
  rating: number;
  solvedCount: number;
};

export type PuzzleAttemptResult = {
  bestStreak: number;
  currentStreak: number;
  firstAttempt: boolean;
  playerRatingAfter: number;
  playerRatingBefore: number;
  puzzleRatingAfter: number;
  puzzleRatingBefore: number;
  ratedAsCorrect: boolean;
  solutionSan: string;
  solutionUci: string;
  solved: boolean;
};

export type PuzzleReactionResult = {
  dislikeCount: number;
  likeCount: number;
  reaction: 'LIKE' | 'DISLIKE';
};

export async function fetchPuzzlePage(params: {
  category?: string;
  difficulty?: PuzzleDifficulty | 'ALL';
  page?: number;
  size?: number;
}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 0));
  query.set('size', String(params.size ?? 20));
  if (params.difficulty && params.difficulty !== 'ALL') query.set('difficulty', params.difficulty);
  if (params.category && params.category !== 'RANDOM') query.set('category', params.category);
  return getJson<PuzzlePageResponse>(`/api/v1/puzzles?${query.toString()}`);
}

export function fetchPuzzleDetail(puzzleId: number) {
  return getJson<PuzzleDetail>(`/api/v1/puzzles/${puzzleId}`);
}

export async function fetchNextPuzzle(params: {
  category?: string;
  difficulty?: PuzzleDifficultyMode;
  excludePuzzleIds?: number[];
}) {
  const query = new URLSearchParams();
  query.set('category', params.category || 'RANDOM');
  query.set('difficulty', params.difficulty || 'ANY');
  (params.excludePuzzleIds ?? []).forEach((puzzleId) => {
    if (Number.isFinite(puzzleId) && puzzleId > 0) {
      query.append('excludePuzzleId', String(puzzleId));
    }
  });
  const session = await restoreSession();
  return getJson<PuzzleDetail>(
    `/api/v1/puzzles/next?${query.toString()}`,
    session?.accessToken,
  );
}

export async function fetchMyPuzzleRating() {
  const session = await restoreSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return getJson<PlayerPuzzleRating>('/api/v1/puzzles/me/rating', session.accessToken);
}

export async function submitPuzzleAttempt(
  puzzleId: number,
  input: { firstAttempt: boolean; solved?: boolean; solveTimeMs?: number; submittedMoveUci: string },
) {
  const session = await restoreSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return postAuthorizedJson<PuzzleAttemptResult>(
    `/api/v1/puzzles/${puzzleId}/attempts`,
    input,
    session.accessToken,
  );
}

export async function submitPuzzleReaction(puzzleId: number, reaction: 'LIKE' | 'DISLIKE') {
  const session = await restoreSession();
  if (!session) throw new Error('AUTH_REQUIRED');
  return postAuthorizedJson<PuzzleReactionResult>(
    `/api/v1/puzzles/${puzzleId}/reaction`,
    { reaction },
    session.accessToken,
  );
}
