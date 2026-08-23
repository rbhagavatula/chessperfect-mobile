import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { type Href, router } from 'expo-router';
import { Platform } from 'react-native';

import { postAuthorizedJson } from '@/lib/api';
import { archiveNotification } from '@/lib/notification-inbox';

const GENERAL_CHANNEL_ID = 'general';
const STORED_TOKEN_KEY = 'chessperfect.push.expoToken';
const INSTALLATION_ID_KEY = 'chessperfect.device.installationId';
const allowedRouteRoots = ['/account', '/academy', '/home', '/inbox', '/learn', '/my-database', '/play'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PushDeviceView = {
  active: boolean;
  id: number;
  lastRegisteredAt: string;
  lastSeenAt: string;
};

async function installationId() {
  const stored = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (stored) return stored;
  const created = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(INSTALLATION_ID_KEY, created);
  return created;
}

function permissionName(status: Notifications.PermissionStatus) {
  return status === 'granted' ? 'GRANTED' : status === 'denied' ? 'DENIED' : 'UNDETERMINED';
}

function projectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function appIdentifier() {
  return Constants.expoConfig?.android?.package;
}

function notificationHref(notification: Notifications.Notification): Href | null {
  const route = notification.request.content.data?.route;
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) return null;
  const allowed = allowedRouteRoots.some((root) => route === root || route.startsWith(`${root}/`));
  return allowed ? (route as Href) : null;
}

async function redirectFromNotification(notification: Notifications.Notification) {
  const item = await archiveNotification(notification, true);
  const href = notificationHref(notification) ?? (`/inbox?notificationId=${encodeURIComponent(item.id)}` as Href);
  router.push(href);
}

export function observeNotificationNavigation() {
  if (Platform.OS === 'web') {
    return { remove() {} };
  }

  const initialResponse = Notifications.getLastNotificationResponse();
  if (initialResponse?.notification) {
    void redirectFromNotification(initialResponse.notification);
    void Notifications.clearLastNotificationResponseAsync();
  }

  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    void archiveNotification(notification);
  });
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void redirectFromNotification(response.notification);
  });

  return {
    remove() {
      receivedSubscription.remove();
      responseSubscription.remove();
    },
  };
}

async function configureAndroidChannel() {
  await Notifications.setNotificationChannelAsync(GENERAL_CHANNEL_ID, {
    name: 'General notifications',
    description: 'ChessPerfect activity, classes, games and account updates',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#d7a33b',
    vibrationPattern: [0, 250, 250, 250],
  });
}

async function obtainExpoPushToken() {
  if (Platform.OS !== 'android') return null;

  await configureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === 'granted'
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return null;

  const easProjectId = projectId();
  if (!easProjectId) throw new Error('EAS_PROJECT_ID_NOT_CONFIGURED');

  return (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
}

export async function registerCurrentDeviceForPush(accessToken: string) {
  const token = await obtainExpoPushToken();
  const identifier = appIdentifier();
  if (!token || !identifier) return null;

  await SecureStore.setItemAsync(STORED_TOKEN_KEY, token);
  if (__DEV__) console.info('[push] Expo token:', token);

  const permission = await Notifications.getPermissionsAsync();
  const registered = await postAuthorizedJson<PushDeviceView>(
    '/api/v1/mobile/push-devices',
    {
      appIdentifier: identifier,
      deviceName: Device.deviceName ?? undefined,
      expoPushToken: token,
      installationId: await installationId(),
      appVersion: Constants.expoConfig?.version,
      notificationPermission: permissionName(permission.status),
      platform: 'ANDROID',
    },
    accessToken,
  );
  return registered;
}

export async function registerCurrentDevicePresence(accessToken: string) {
  if (Platform.OS !== 'android') return null;
  const identifier = appIdentifier();
  if (!identifier) return null;
  const permission = await Notifications.getPermissionsAsync();
  return postAuthorizedJson<PushDeviceView>(
    '/api/v1/mobile/push-devices/presence',
    {
      appIdentifier: identifier,
      appVersion: Constants.expoConfig?.version,
      deviceName: Device.deviceName ?? Device.modelName ?? undefined,
      installationId: await installationId(),
      notificationPermission: permissionName(permission.status),
      platform: 'ANDROID',
    },
    accessToken,
  );
}

export async function unregisterCurrentDeviceFromPush(accessToken: string) {
  if (Platform.OS === 'web') return;
  const token = await SecureStore.getItemAsync(STORED_TOKEN_KEY);
  if (!token) return;

  await postAuthorizedJson<{ ok: boolean }>(
    '/api/v1/mobile/push-devices/unregister',
    { expoPushToken: token },
    accessToken,
    5_000,
  );
  await SecureStore.deleteItemAsync(STORED_TOKEN_KEY);
}
