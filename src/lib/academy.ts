import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, getJson, getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { activateAcademySession, clearAcademySession, getAcademyAccessSession } from '@/lib/academy-session';
import { restoreSession } from '@/lib/session';

const selectedAcademyKey = 'chessperfect.selectedAcademy';

export type AcademyMembership = {
  academyName?: string | null;
  host?: string | null;
  role?: string | null;
  tenantId: number;
};

export type SelectedAcademy = {
  academyName: string;
  host: string;
  membershipCount: number;
  role: 'COACH' | 'STUDENT';
  tenantId: number;
};

export type CoachUpcomingClass = {
  batchId: number;
  batchName?: string | null;
  coachEmployeeId?: number | null;
  coachName?: string | null;
  endAt: string;
  endTime: string;
  sessionDate: string;
  sessionId?: number | null;
  startAllowed: boolean;
  startAt: string;
  startTime: string;
  status: string;
  timezone: string;
};

export type CoachClassSession = {
  id: number;
  meetingProvider?: 'JITSI' | 'ZOHO' | null;
  meetingReady?: boolean | null;
  status: string;
  zohoJoinLink?: string | null;
  zohoStartLink?: string | null;
};

export type CoachBatch = {
  active: boolean;
  activeStudentCount?: number | null;
  coachName?: string | null;
  courseName?: string | null;
  deliveryMode?: 'HYBRID' | 'OFFLINE' | 'ONLINE' | null;
  id: number;
  name: string;
  scheduleJson?: string | null;
  timezone?: string | null;
};

export type UpcomingClassStatus = 'NONE' | 'WAITING' | 'LIVE' | 'BLOCKED';

export type UpcomingClass = {
  batchName?: string | null;
  endAt?: string | null;
  endTime?: string | null;
  joinAllowed: boolean;
  joinUrl?: string | null;
  sessionDate?: string | null;
  sessionId?: number | null;
  startAt?: string | null;
  startTime?: string | null;
  status: UpcomingClassStatus;
  timezone?: string | null;
};

type MeView = {
  tenantMemberships?: AcademyMembership[] | null;
};

function academyName(membership: AcademyMembership) {
  const configuredName = membership.academyName?.trim();
  if (configuredName) return configuredName;
  const hostLabel = membership.host?.trim().split('.')[0]?.replace(/[-_]+/g, ' ');
  if (hostLabel) {
    return hostLabel.replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return `Academy ${membership.tenantId}`;
}

function normalizeHost(host?: string | null) {
  const value = host?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!value || !/^[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
    throw new ApiError('This academy does not have an active mobile domain.', 422);
  }
  return value.toLowerCase();
}

export function academyOrigin(host: string) {
  const protocol = /^(localhost|127\.0\.0\.1)(?::|$)/i.test(host) ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export async function fetchMobileAcademies() {
  const session = await restoreSession();
  if (!session) throw new ApiError('Please sign in again.', 401);
  const me = await getJson<MeView>('/api/v1/global/me', session.accessToken);
  return (me.tenantMemberships ?? [])
    .filter((membership) => ['COACH', 'STUDENT'].includes(membership.role?.trim().toUpperCase() ?? ''))
    .map((membership) => ({
      ...membership,
      academyName: academyName(membership),
    }));
}

export async function selectAcademy(membership: AcademyMembership, membershipCount: number) {
  const role = membership.role?.trim().toUpperCase();
  if (role !== 'COACH' && role !== 'STUDENT') {
    throw new ApiError('This academy role does not have a mobile dashboard yet.', 403);
  }
  const selected: SelectedAcademy = {
    academyName: academyName(membership),
    host: normalizeHost(membership.host),
    membershipCount,
    role,
    tenantId: membership.tenantId,
  };
  await activateAcademySession(selected.tenantId, academyOrigin(selected.host));
  await AsyncStorage.setItem(selectedAcademyKey, JSON.stringify(selected));
  return selected;
}

export async function getSelectedAcademy(): Promise<SelectedAcademy | null> {
  const raw = await AsyncStorage.getItem(selectedAcademyKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SelectedAcademy>;
    if (
      typeof parsed.academyName !== 'string' ||
      typeof parsed.host !== 'string' ||
      typeof parsed.tenantId !== 'number'
    ) {
      return null;
    }
    return {
      academyName: parsed.academyName,
      host: normalizeHost(parsed.host),
      membershipCount: typeof parsed.membershipCount === 'number' ? parsed.membershipCount : 1,
      role: parsed.role === 'COACH' ? 'COACH' : 'STUDENT',
      tenantId: parsed.tenantId,
    };
  } catch {
    return null;
  }
}

export async function clearSelectedAcademy() {
  await Promise.all([AsyncStorage.removeItem(selectedAcademyKey), clearAcademySession()]);
}

export async function fetchUpcomingClass(academy: SelectedAcademy) {
  const origin = academyOrigin(normalizeHost(academy.host));
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return getJsonFromOrigin<UpcomingClass>(
    '/api/v1/student/dashboard/upcoming-class',
    origin,
    session.accessToken,
  );
}

export async function fetchCoachUpcomingClasses(academy: SelectedAcademy) {
  const origin = academyOrigin(normalizeHost(academy.host));
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return getJsonFromOrigin<{ classes: CoachUpcomingClass[] }>(
    '/api/v1/academy/dashboard/coach-upcoming-classes',
    origin,
    session.accessToken,
  );
}

export async function startCoachClass(academy: SelectedAcademy, item: CoachUpcomingClass) {
  const origin = academyOrigin(normalizeHost(academy.host));
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return postAuthorizedJsonFromOrigin<CoachClassSession>(
    `/api/v1/batches/${item.batchId}/start-class?sessionDate=${encodeURIComponent(item.sessionDate)}&meetingProvider=JITSI`,
    origin,
    undefined,
    session.accessToken,
  );
}

export async function fetchCoachBatches(academy: SelectedAcademy) {
  const origin = academyOrigin(normalizeHost(academy.host));
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return getJsonFromOrigin<CoachBatch[]>(
    '/api/v1/academy/batches',
    origin,
    session.accessToken,
  );
}

export async function startCoachAdhocClass(academy: SelectedAcademy, batchId: number) {
  const origin = academyOrigin(normalizeHost(academy.host));
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return postAuthorizedJsonFromOrigin<CoachClassSession>(
    `/api/v1/batches/${batchId}/start-adhoc?meetingProvider=JITSI`,
    origin,
    undefined,
    session.accessToken,
  );
}
