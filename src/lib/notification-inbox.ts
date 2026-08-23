import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as Notifications from 'expo-notifications';

import { deleteAuthorizedJson, getJson, postAuthorizedJson } from '@/lib/api';

const INBOX_STORAGE_KEY = 'chessperfect.notificationInbox.v1';
const SELECTED_MESSAGE_KEY = 'chessperfect.notificationInbox.selectedMessage';
const MAX_INBOX_ITEMS = 100;

export type NotificationInboxItem = {
  body: string;
  id: string;
  readAt: string | null;
  receivedAt: string;
  serverId: number | null;
  targetRoute: string | null;
  title: string;
};

type ServerInboxMessage = {
  academyId: number | null;
  body: string;
  createdAt: string;
  id: number;
  messageType: string;
  readAt: string | null;
  targetRoute: string | null;
  title: string;
};

type ServerInboxPage = {
  messages: ServerInboxMessage[];
  unreadCount: number;
};

function parseStoredItems(value: string | null): NotificationInboxItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeItems(items: NotificationInboxItem[]) {
  await AsyncStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_INBOX_ITEMS)));
}

export async function getNotificationInbox() {
  return parseStoredItems(await AsyncStorage.getItem(INBOX_STORAGE_KEY));
}

function fromServer(message: ServerInboxMessage): NotificationInboxItem {
  return {
    body: message.body,
    id: `server:${message.id}`,
    readAt: message.readAt,
    receivedAt: message.createdAt,
    serverId: message.id,
    targetRoute: message.targetRoute,
    title: message.title,
  };
}

export async function syncNotificationInbox(accessToken: string) {
  const page = await getJson<ServerInboxPage>('/api/v1/mobile/inbox?limit=100', accessToken);
  const local = await getNotificationInbox();
  const localOnly = local.filter((item) => item.serverId == null && !item.id.startsWith('server:'));
  const merged = [...page.messages.map(fromServer), ...localOnly]
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  await writeItems(merged);
  return { items: merged, unreadCount: page.unreadCount };
}

export async function selectInboxNotification(id: string) {
  await AsyncStorage.setItem(SELECTED_MESSAGE_KEY, id);
}

export async function getSelectedInboxNotification() {
  const [id, items] = await Promise.all([
    AsyncStorage.getItem(SELECTED_MESSAGE_KEY),
    getNotificationInbox(),
  ]);
  return items.find((item) => item.id === id) ?? null;
}

export async function archiveNotification(
  notification: Notifications.Notification,
  markRead = false,
) {
  const content = notification.request.content;
  const existing = await getNotificationInbox();
  const rawServerId = content.data?.inboxMessageId;
  const parsedServerId = typeof rawServerId === 'number'
    ? rawServerId
    : typeof rawServerId === 'string' && /^\d+$/.test(rawServerId)
      ? Number(rawServerId)
      : null;
  const id = parsedServerId == null ? notification.request.identifier : `server:${parsedServerId}`;
  const previous = existing.find((item) => item.id === id);
  const targetRoute = typeof content.data?.targetRoute === 'string'
    ? content.data.targetRoute
    : null;
  const item: NotificationInboxItem = {
    body: content.body?.trim() || 'You have a new ChessPerfect update.',
    id,
    readAt: markRead ? new Date().toISOString() : previous?.readAt ?? null,
    receivedAt: new Date(notification.date || Date.now()).toISOString(),
    serverId: parsedServerId,
    targetRoute,
    title: content.title?.trim() || 'ChessPerfect',
  };

  await writeItems([item, ...existing.filter((candidate) => candidate.id !== item.id)]);
  return item;
}

export async function markAllInboxNotificationsRead() {
  const now = new Date().toISOString();
  const items = await getNotificationInbox();
  await writeItems(items.map((item) => ({ ...item, readAt: item.readAt ?? now })));
}

export async function markInboxNotificationRead(id: string, accessToken?: string) {
  const items = await getNotificationInbox();
  const now = new Date().toISOString();
  const selected = items.find((item) => item.id === id);
  await writeItems(items.map((item) => (
    item.id === id ? { ...item, readAt: item.readAt ?? now } : item
  )));
  if (accessToken && selected?.serverId != null) {
    await postAuthorizedJson(`/api/v1/mobile/inbox/${selected.serverId}/read`, undefined, accessToken);
  }
}

export async function deleteInboxNotification(item: NotificationInboxItem, accessToken?: string) {
  const items = await getNotificationInbox();
  await writeItems(items.filter((candidate) => candidate.id !== item.id));
  if (accessToken && item.serverId != null) {
    await deleteAuthorizedJson(`/api/v1/mobile/inbox/${item.serverId}`, accessToken);
  }
}

export async function clearNotificationInbox(accessToken?: string) {
  await AsyncStorage.multiRemove([INBOX_STORAGE_KEY, SELECTED_MESSAGE_KEY]);
  if (accessToken) await deleteAuthorizedJson('/api/v1/mobile/inbox', accessToken);
}
