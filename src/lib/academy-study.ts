import type { ImageSource } from 'expo-image';

import { ApiError, getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { academyOrigin, getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';
import { getAcademyAccessSession } from '@/lib/academy-session';

export type StudyProgressStatus = 'OPEN' | 'READY_FOR_ASSESSMENT' | 'COMPLETED';
export type StudyBlockType = 'INTERACTIVE' | 'MCQ' | 'PIECE_MOVE' | 'MEMO' | 'VIDEO';

export type StudentInteractiveConfig = {
  coachSolution: string;
  difficulty: string;
  puzzleTitle: string;
  sideToMove: string;
  startFen: string;
};

export type StudentMcqOption = { id: string; text: string };

export type StudentMcqConfig = {
  correctOptionId: string;
  options: StudentMcqOption[];
  questionFormat: 'IMAGE' | 'TEXT';
  questionImageKey: string;
  questionText: string;
};

export type StudentPieceMoveConfig = {
  mode: 'SELECT_LEGAL_SQUARES';
  piece: 'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook';
  prompt: string;
  randomizeStartSquare: boolean;
  requiredRounds: number;
};

export type StudentStudyBlock = {
  content: string;
  id: number;
  interactiveConfig: StudentInteractiveConfig | null;
  mcqConfig: StudentMcqConfig | null;
  pieceMoveConfig: StudentPieceMoveConfig | null;
  title: string;
  type: StudyBlockType;
};

export type StudentStudyLesson = {
  blocks: StudentStudyBlock[];
  description: string;
  id: number;
  title: string;
};

export type StudentStudySummary = {
  description: string;
  id: number;
  photoKey: string;
  progressStatus: StudyProgressStatus;
  sourceId: number | null;
  sourceTitle: string | null;
  sourceType: string;
  studyVersionId?: number | null;
  studyVersionLabel?: string | null;
  title: string;
};

export type StudentLearnOverview = {
  batchId: number | null;
  batchName: string | null;
  courseId: number | null;
  courseTitle: string | null;
  studies: StudentStudySummary[];
};

export type StudentStudyDetail = {
  allBlocksCompleted: boolean;
  completedBlockIds: number[];
  lessons: StudentStudyLesson[];
  resumeBlockId: number | null;
  resumeLessonId: number | null;
  study: StudentStudySummary;
};

export type AcademyStudyContext = {
  academy: SelectedAcademy;
  accessToken: string;
  origin: string;
};

function withStudyVersion(path: string, studyVersionId?: number | null) {
  return typeof studyVersionId === 'number' && Number.isFinite(studyVersionId) && studyVersionId > 0
    ? `${path}?studyVersionId=${studyVersionId}`
    : path;
}

export async function getAcademyStudyContext(): Promise<AcademyStudyContext> {
  const academy = await getSelectedAcademy();
  if (!academy) throw new ApiError('Please choose an academy first.', 409);
  const origin = academyOrigin(academy.host);
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return { academy, accessToken: session.accessToken, origin };
}

export function academyAssetSource(context: AcademyStudyContext, assetKey?: string | null): ImageSource | null {
  const key = assetKey?.trim();
  if (!key) return null;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return {
    headers: { Authorization: `Bearer ${context.accessToken}` },
    uri: `${context.origin}/assets/${encodedKey}`,
  };
}

export function fetchStudentStudyOverview(context: AcademyStudyContext) {
  return getJsonFromOrigin<StudentLearnOverview>('/api/v1/student/learn', context.origin, context.accessToken);
}

export function fetchStudentStudyDetail(
  context: AcademyStudyContext,
  studyId: number,
  studyVersionId?: number | null,
) {
  return getJsonFromOrigin<StudentStudyDetail>(
    withStudyVersion(`/api/v1/student/learn/studies/${studyId}`, studyVersionId),
    context.origin,
    context.accessToken,
  );
}

export function updateStudentStudyProgress(
  context: AcademyStudyContext,
  studyId: number,
  lessonId: number,
  blockId: number,
  markCompleted: boolean,
  studyVersionId?: number | null,
) {
  return postAuthorizedJsonFromOrigin<void>(
    withStudyVersion(`/api/v1/student/learn/studies/${studyId}/progress`, studyVersionId),
    context.origin,
    { blockId, lessonId, markCompleted },
    context.accessToken,
  );
}

export function markStudentStudyCompleted(
  context: AcademyStudyContext,
  studyId: number,
  lessonId: number,
  blockId: number,
  studyVersionId?: number | null,
) {
  return postAuthorizedJsonFromOrigin<void>(
    withStudyVersion(`/api/v1/student/learn/studies/${studyId}/complete`, studyVersionId),
    context.origin,
    { blockId, lessonId, markCompleted: true },
    context.accessToken,
  );
}
