import { getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { getAcademyAccessSession } from '@/lib/academy-session';
import { academyOrigin, getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';

export type AcademyMessageTemplate = { body: string; category: string; id: number; name: string; system: boolean; title: string };
export type AcademyMessageBatch = { activeStudentCount: number; id: number; name: string };
export type AcademyMessageStudent = {
  appStatus: 'ACTIVE' | 'INACTIVE' | 'NOT_CONNECTED' | 'NOTIFICATIONS_OFF';
  appVersion?: string | null;
  batchId?: number | null;
  batchName?: string | null;
  id: number;
  lastSeenAt?: string | null;
  name: string;
  notificationPermission?: string | null;
  platform?: string | null;
  studentUserId: number;
};
export type AcademyAdoptionSummary = { active: number; inactive: number; notConnected: number; notificationsOff: number; recentlyActive: number; totalStudents: number };
export type AcademyMessagingContext = { academyName: string; adoption: AcademyAdoptionSummary; batches: AcademyMessageBatch[]; students: AcademyMessageStudent[]; templates: AcademyMessageTemplate[] };
export type AcademyMessageCampaign = { audienceType: string; body: string; createdAt: string; deliveredCount: number; id: number; pushEligibleCount: number; readCount: number; recipientCount: number; scheduledAt?: string | null; sentAt?: string | null; status: string; title: string };

async function academyMessagingSession(academy?: SelectedAcademy | null) {
  const selected = academy ?? await getSelectedAcademy();
  if (!selected) throw new Error('Choose an academy first.');
  if (selected.role !== 'OWNER' && selected.role !== 'ADMIN') throw new Error('Owner or administrator access is required.');
  const origin = academyOrigin(selected.host);
  const session = await getAcademyAccessSession(selected.tenantId, origin);
  return { academy: selected, origin, token: session.accessToken };
}

export async function fetchAcademyMessagingContext(academy?: SelectedAcademy | null) {
  const context = await academyMessagingSession(academy);
  return getJsonFromOrigin<AcademyMessagingContext>('/api/v1/academy/messaging/context', context.origin, context.token);
}

export async function fetchAcademyMessageCampaigns(academy?: SelectedAcademy | null) {
  const context = await academyMessagingSession(academy);
  return getJsonFromOrigin<AcademyMessageCampaign[]>('/api/v1/academy/messaging/campaigns', context.origin, context.token);
}

export async function sendAcademyMessage(input: {
  academy?: SelectedAcademy | null;
  audienceType: 'ALL' | 'BATCHES' | 'STUDENTS';
  batchIds: number[];
  body: string;
  scheduledAt?: string | null;
  studentIds: number[];
  templateId?: number | null;
  title: string;
}) {
  const context = await academyMessagingSession(input.academy);
  return postAuthorizedJsonFromOrigin<AcademyMessageCampaign>('/api/v1/academy/messaging/campaigns', context.origin, {
    audienceType: input.audienceType,
    batchIds: input.batchIds,
    body: input.body,
    scheduledAt: input.scheduledAt,
    studentIds: input.studentIds,
    templateId: input.templateId,
    title: input.title,
  }, context.token);
}

export async function createAcademyMessageTemplate(input: { academy?: SelectedAcademy | null; body: string; name: string; title: string }) {
  const context = await academyMessagingSession(input.academy);
  return postAuthorizedJsonFromOrigin<AcademyMessageTemplate>('/api/v1/academy/messaging/templates', context.origin, {
    body: input.body,
    category: 'GENERAL',
    name: input.name,
    title: input.title,
  }, context.token);
}
