import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { ApiError } from '@/lib/api';
import { refreshAuthTokenFromOrigin } from '@/lib/auth';
import { restoreSession } from '@/lib/session';

const keys = {
  accessToken: 'chessperfect.academy.accessToken',
  expiresAt: 'chessperfect.academy.expiresAt',
  refreshToken: 'chessperfect.academy.refreshToken',
  tenantId: 'chessperfect.academy.tenantId',
} as const;

export type AcademyAccessSession = {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  tenantId: number;
};

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function persistAcademySession(session: AcademyAccessSession) {
  await Promise.all([
    setItem(keys.accessToken, session.accessToken),
    setItem(keys.tenantId, String(session.tenantId)),
    session.expiresAt ? setItem(keys.expiresAt, String(session.expiresAt)) : deleteItem(keys.expiresAt),
    session.refreshToken ? setItem(keys.refreshToken, session.refreshToken) : deleteItem(keys.refreshToken),
  ]);
}

async function readAcademySession(): Promise<AcademyAccessSession | null> {
  const [accessToken, expiresAtValue, refreshToken, tenantIdValue] = await Promise.all([
    getItem(keys.accessToken),
    getItem(keys.expiresAt),
    getItem(keys.refreshToken),
    getItem(keys.tenantId),
  ]);
  const tenantId = Number(tenantIdValue);
  if (!accessToken || !Number.isFinite(tenantId)) return null;
  const expiresAt = Number(expiresAtValue);
  return {
    accessToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
    refreshToken: refreshToken || undefined,
    tenantId,
  };
}

async function exchangeForAcademySession(tenantId: number, origin: string, refreshToken?: string) {
  const mainSession = refreshToken ? null : await restoreSession();
  const token = refreshToken || mainSession?.refreshToken;
  if (!token) {
    throw new ApiError('Please sign in again to enter this academy.', 401);
  }

  const response = await refreshAuthTokenFromOrigin(token, origin);
  const academySession: AcademyAccessSession = {
    accessToken: response.accessToken,
    expiresAt: typeof response.expiresIn === 'number' ? Date.now() + response.expiresIn * 1000 : undefined,
    refreshToken: response.refreshToken,
    tenantId,
  };
  await persistAcademySession(academySession);
  return academySession;
}

export async function activateAcademySession(tenantId: number, origin: string) {
  return exchangeForAcademySession(tenantId, origin);
}

export async function getAcademyAccessSession(tenantId: number, origin: string) {
  const stored = await readAcademySession();
  if (stored?.tenantId === tenantId && (!stored.expiresAt || stored.expiresAt - Date.now() > 30_000)) {
    return stored;
  }
  return exchangeForAcademySession(
    tenantId,
    origin,
    stored?.tenantId === tenantId ? stored.refreshToken : undefined,
  );
}

export async function clearAcademySession() {
  await Promise.all(Object.values(keys).map(deleteItem));
}
