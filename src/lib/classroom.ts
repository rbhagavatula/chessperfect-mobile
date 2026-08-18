import { Chess } from 'chess.js';

import { ApiError, getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { academyOrigin, getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';
import { getAcademyAccessSession } from '@/lib/academy-session';

export type ClassroomBroadcastMode = 'ANALYSIS' | 'MULTI_STUDY' | 'SINGLE_STUDY';

export type ClassroomContext = {
  academy: SelectedAcademy;
  accessToken: string;
  origin: string;
};

export type ClassroomJoin = {
  broadcastMode: ClassroomBroadcastMode;
  joinLink?: string | null;
  sessionId: number;
  status: 'CANCELLED' | 'COMPLETED' | 'LIVE' | 'SCHEDULED';
};

export type ClassroomEndResponse = {
  sessionId: number;
  status: 'COMPLETED';
};

export type ClassroomBoard = {
  arrowsJson?: string | null;
  fen: string;
  moveText?: string | null;
  orientation?: string | null;
  selectedPly?: number | null;
  sessionId: number;
  squareHighlightsJson?: string | null;
  updatedAt?: string | null;
};

export type ClassroomActivityResponse = {
  activityId: number;
  answerText: string;
  correct: boolean;
  id: number;
  score: number;
  studentName: string;
  studentUserId: number;
  submittedAt: string;
};

export type ClassroomActivity = {
  content?: string | null;
  durationSeconds: number;
  endsAt?: string | null;
  id: number;
  interactiveCoachSolution?: string | null;
  interactiveStartFen?: string | null;
  maxScore: number;
  mcqOptionsJson?: string | null;
  mcqQuestionText?: string | null;
  myResponse?: ClassroomActivityResponse | null;
  sessionId: number;
  sourceBlockId?: number | null;
  sourceLessonId?: number | null;
  sourceStudyId?: number | null;
  sourceLessonTitle?: string | null;
  sourcePuzzleNumber?: number | null;
  sourceStudyTitle?: string | null;
  startedAt?: string | null;
  status: 'ACTIVE' | 'CLOSED';
  title: string;
  type: 'INTERACTIVE' | 'MCQ';
};

export type ClassroomStudy = {
  id: number;
  state: 'DRAFT' | 'PUBLISHED';
  title: string;
};

export type ClassroomStudyBlock = {
  content?: string | null;
  id: number;
  lessonId: number;
  title: string;
  type: 'INTERACTIVE' | 'MCQ' | 'MEMO' | 'PIECE_MOVE' | 'VIDEO';
};

export type ClassroomStudyLesson = {
  blocks: ClassroomStudyBlock[];
  id: number;
  state: 'DRAFT' | 'PUBLISHED';
  studyId: number;
  title: string;
};

export type ClassroomStudyDetail = {
  lessons: ClassroomStudyLesson[];
  study?: ClassroomStudy | null;
};

export type ClassroomLeaderboardEntry = {
  answered: number;
  correctAnswers: number;
  history?: ClassroomActivityHistory[] | null;
  score: number;
  studentName: string;
  studentUserId: number;
};

export type ClassroomActivityHistory = {
  activityId: number;
  answerText?: string | null;
  correct: boolean;
  score: number;
  submittedAt: string;
  title?: string | null;
  type?: 'INTERACTIVE' | 'MCQ' | null;
};

export type ClassroomActivityParticipant = {
  completed: boolean;
  correct?: boolean | null;
  score?: number | null;
  studentName: string;
  studentUserId: number;
  submittedAt?: string | null;
};

export type ClassroomPresence = {
  activeSeconds: number;
  awaySeconds: number;
  displayName: string;
  inactiveSeconds: number;
  joinedAt: string;
  lastSeenAt: string;
  role: 'COACH' | 'GUEST' | 'STUDENT';
  status: 'ACTIVE' | 'AWAY' | 'DISCONNECTED';
  userId: number;
};

export type ClassroomPresenceSummary = {
  activeCount: number;
  awayCount: number;
  disconnectedCount: number;
  inactiveStudentCount: number;
  participants: ClassroomPresence[];
};

export type ClassroomHomework = {
  batchName: string;
  classSessionId?: number | null;
  completedItems: number;
  createdByName: string;
  dueAt: string;
  id: number;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'OVERDUE' | 'PENDING';
  title: string;
  totalItems: number;
};

export type ClassroomStudySnapshotRequest = {
  attemptCount: number;
  blockId: number;
  blockTitle: string;
  blockType: string;
  currentFen?: string | null;
  lastMove?: string | null;
  lessonId: number;
  lessonTitle: string;
  solutionUsed: boolean;
  state: 'FAILED' | 'IN_PROGRESS' | 'SOLVED';
  studyId: number;
  studyTitle: string;
  studyVersionId?: number | null;
};

export type ClassroomActivitySummary = {
  activeActivity?: ClassroomActivity | null;
  activeParticipants?: ClassroomActivityParticipant[] | null;
  activities: ClassroomActivity[];
  answeredCount?: number | null;
  leaderboard: ClassroomLeaderboardEntry[];
  pendingCount?: number | null;
  totalParticipants?: number | null;
};

export type ClassroomStudyAssignment = {
  assignedAt: string;
  autoAdvance?: boolean | null;
  id: number;
  lessonId?: number | null;
  lessonTitle?: string | null;
  sessionId: number;
  studentName: string;
  studentUserId: number;
  studyId: number;
  studyTitle: string;
  studyVersionId?: number | null;
  totalPuzzleCount?: number | null;
};

export type McqOption = { id: string; text: string };

export async function getClassroomContext() {
  const academy = await getSelectedAcademy();
  if (!academy) throw new ApiError('Choose an academy before joining a class.', 401);
  const origin = academyOrigin(academy.host);
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return { academy, accessToken: session.accessToken, origin } satisfies ClassroomContext;
}

function classroomPath(sessionId: number, suffix = '') {
  return `/api/v1/class-sessions/${sessionId}${suffix}`;
}

export function joinClassroom(context: ClassroomContext, sessionId: number) {
  return getJsonFromOrigin<ClassroomJoin>(
    classroomPath(sessionId, '/join'),
    context.origin,
    context.accessToken,
  );
}

export function endClassroom(
  context: ClassroomContext,
  sessionId: number,
  sendSummaryEmail = true,
) {
  return postAuthorizedJsonFromOrigin<ClassroomEndResponse>(
    classroomPath(sessionId, '/end'),
    context.origin,
    { sendSummaryEmail },
    context.accessToken,
  );
}

export function fetchClassroomBoard(context: ClassroomContext, sessionId: number) {
  return getJsonFromOrigin<ClassroomBoard>(
    classroomPath(sessionId, '/board'),
    context.origin,
    context.accessToken,
  );
}

export function publishClassroomBoard(
  context: ClassroomContext,
  sessionId: number,
  board: Omit<ClassroomBoard, 'sessionId' | 'updatedAt'>,
) {
  return postAuthorizedJsonFromOrigin<ClassroomBoard>(
    classroomPath(sessionId, '/board'),
    context.origin,
    board,
    context.accessToken,
  );
}

export function updateClassroomBroadcastMode(
  context: ClassroomContext,
  sessionId: number,
  broadcastMode: ClassroomBroadcastMode,
) {
  return postAuthorizedJsonFromOrigin<unknown>(
    classroomPath(sessionId, '/broadcast-mode'),
    context.origin,
    { broadcastMode },
    context.accessToken,
  );
}

export function fetchClassroomActivities(context: ClassroomContext, sessionId: number) {
  return getJsonFromOrigin<ClassroomActivitySummary>(
    classroomPath(sessionId, '/activities'),
    context.origin,
    context.accessToken,
  );
}

export function fetchClassroomStudies(context: ClassroomContext) {
  return getJsonFromOrigin<ClassroomStudy[]>(
    '/api/v1/academy/studies',
    context.origin,
    context.accessToken,
  );
}

export function fetchClassroomStudy(context: ClassroomContext, studyId: number) {
  return getJsonFromOrigin<ClassroomStudyDetail>(
    `/api/v1/academy/studies/${studyId}`,
    context.origin,
    context.accessToken,
  );
}

export function pushClassroomActivity(
  context: ClassroomContext,
  sessionId: number,
  sourceBlockId: number,
  durationSeconds = 180,
) {
  return postAuthorizedJsonFromOrigin<ClassroomActivitySummary>(
    classroomPath(sessionId, '/activities'),
    context.origin,
    { durationSeconds, maxScore: 1, sourceBlockId },
    context.accessToken,
  );
}

export function closeClassroomActivity(context: ClassroomContext, activityId: number) {
  return postAuthorizedJsonFromOrigin<ClassroomActivitySummary>(
    `/api/v1/class-sessions/activities/${activityId}/close`,
    context.origin,
    {},
    context.accessToken,
  );
}

export function fetchClassroomPresence(context: ClassroomContext, sessionId: number) {
  return getJsonFromOrigin<ClassroomPresenceSummary>(
    classroomPath(sessionId, '/presence'),
    context.origin,
    context.accessToken,
  );
}

export function fetchStudentHomework(context: ClassroomContext) {
  return getJsonFromOrigin<ClassroomHomework[]>(
    '/api/v1/student/assignments',
    context.origin,
    context.accessToken,
  );
}

export function fetchClassroomStudyAssignment(context: ClassroomContext, sessionId: number) {
  return getJsonFromOrigin<ClassroomStudyAssignment | null>(
    classroomPath(sessionId, '/live-study/my-assignment'),
    context.origin,
    context.accessToken,
  );
}

export function sendClassroomHeartbeat(
  context: ClassroomContext,
  sessionId: number,
  visible: boolean,
  focused: boolean,
) {
  return postAuthorizedJsonFromOrigin<unknown>(
    classroomPath(sessionId, '/presence/heartbeat'),
    context.origin,
    { focused, visible },
    context.accessToken,
  );
}

export function submitClassroomActivity(
  context: ClassroomContext,
  activityId: number,
  answerText: string,
) {
  return postAuthorizedJsonFromOrigin<ClassroomActivityResponse>(
    `/api/v1/class-sessions/activities/${activityId}/responses`,
    context.origin,
    { answerText, firstAttempt: true },
    context.accessToken,
  );
}

export function submitClassroomStudySnapshot(
  context: ClassroomContext,
  sessionId: number,
  body: ClassroomStudySnapshotRequest,
) {
  return postAuthorizedJsonFromOrigin<unknown>(
    classroomPath(sessionId, '/live-study/snapshot'),
    context.origin,
    body,
    context.accessToken,
  );
}

export function isClassroomEndedError(error: unknown) {
  return error instanceof Error && (
    error.message === 'CLASS_SESSION_NOT_LIVE' ||
    error.message === 'CLASS_SESSION_COMPLETED' ||
    error.message === 'CLASS_SESSION_CANCELLED'
  );
}

export function resolveAcademyUrl(origin: string, value: string) {
  try {
    return new URL(value, `${origin.replace(/\/+$/, '')}/`).toString();
  } catch {
    return value;
  }
}

export function parseMcqOptions(value?: string | null): McqOption[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return [{ id: String(index + 1), text: item.trim() }];
      }
      if (typeof item !== 'object' || item === null) return [];
      const option = item as { id?: unknown; text?: unknown; label?: unknown; value?: unknown };
      const text = [option.text, option.label, option.value].find(
        (candidate) => typeof candidate === 'string' && candidate.trim(),
      );
      if (typeof text !== 'string') return [];
      const id = typeof option.id === 'string' || typeof option.id === 'number'
        ? String(option.id)
        : String(index + 1);
      return [{ id, text: text.trim() }];
    });
  } catch {
    return [];
  }
}

type AnnotationColor = 'blue' | 'default' | 'green' | 'red';

export function parseBoardArrows(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const arrow = item as { color?: unknown; from?: unknown; to?: unknown };
      const color = String(arrow.color || 'default') as AnnotationColor;
      return typeof arrow.from === 'string' && /^[a-h][1-8]$/.test(arrow.from)
        && typeof arrow.to === 'string' && /^[a-h][1-8]$/.test(arrow.to)
        && ['blue', 'default', 'green', 'red'].includes(color)
        ? [{ color, from: arrow.from, to: arrow.to }]
        : [];
    });
  } catch {
    return [];
  }
}

export function parseBoardSquareHighlights(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const highlight = item as { color?: unknown; square?: unknown };
      const color = String(highlight.color || 'default') as AnnotationColor;
      return typeof highlight.square === 'string' && /^[a-h][1-8]$/.test(highlight.square)
        && ['blue', 'default', 'green', 'red'].includes(color)
        ? [{ color, square: highlight.square }]
        : [];
    });
  } catch {
    return [];
  }
}

export function lastMoveFromText(moveText?: string | null) {
  if (!moveText?.trim()) return null;
  const uciMoves = moveText.toLowerCase().match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g);
  const lastUci = uciMoves?.at(-1);
  if (lastUci) return { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) };
  try {
    const game = new Chess();
    game.loadPgn(moveText);
    const last = game.history({ verbose: true }).at(-1);
    return last ? { from: last.from, to: last.to } : null;
  } catch {
    return null;
  }
}

export function classroomErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : 'Unable to enter the live classroom.';
  const messages: Record<string, string> = {
    CLASS_SESSION_NOT_LIVE: 'This class is no longer live.',
    CLASS_SESSION_NOT_FOUND: 'This class could not be found.',
    CLASS_SESSION_ACTIVITY_ALREADY_ANSWERED: 'Your answer has already been submitted.',
    CLASS_SESSION_ACTIVITY_CLOSED: 'This activity has ended.',
    CLASS_SESSION_ACTIVITY_JOIN_REQUIRED: 'Join the class before answering this activity.',
    CLASS_SESSION_ACTIVITY_PUSHED_BEFORE_JOIN: 'This activity began before you joined. You can follow along, but cannot submit an answer.',
    FEE_OVERDUE_CLASS_JOIN_BLOCKED: 'Class access is blocked because academy fees are overdue.',
    STUDENT_NOT_IN_SESSION_BATCH: 'This class is not assigned to your batch.',
  };
  return messages[raw] ?? raw.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
