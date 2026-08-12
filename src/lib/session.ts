import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { postAuthorizedJson } from '@/lib/api';
import { refreshAuthToken } from '@/lib/auth';

const keys = {
  accessToken: 'chessperfect.accessToken',
  expiresAt: 'chessperfect.expiresAt',
  loginSessionId: 'chessperfect.loginSessionId',
  refreshToken: 'chessperfect.refreshToken',
  tokenType: 'chessperfect.tokenType',
  username: 'chessperfect.username',
} as const;

let sessionGeneration = 0;

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function getItem(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export type Session = {
  accessToken: string;
  expiresAt?: number;
  loginSessionId?: string;
  refreshToken?: string;
  tokenType?: string;
  username: string;
};

async function persistSession(session: Session) {
  await Promise.all([
    setItem(keys.accessToken, session.accessToken),
    setItem(keys.username, session.username),
    session.refreshToken ? setItem(keys.refreshToken, session.refreshToken) : deleteItem(keys.refreshToken),
    session.tokenType ? setItem(keys.tokenType, session.tokenType) : deleteItem(keys.tokenType),
    session.expiresAt
      ? setItem(keys.expiresAt, String(session.expiresAt))
      : deleteItem(keys.expiresAt),
    session.loginSessionId
      ? setItem(keys.loginSessionId, session.loginSessionId)
      : deleteItem(keys.loginSessionId),
  ]);
}

export async function saveSession(session: Session) {
  sessionGeneration += 1;
  await persistSession(session);
}

export async function getSession(): Promise<Session | null> {
  const [accessToken, expiresAtValue, loginSessionId, refreshToken, tokenType, username] =
    await Promise.all([
      getItem(keys.accessToken),
      getItem(keys.expiresAt),
      getItem(keys.loginSessionId),
      getItem(keys.refreshToken),
      getItem(keys.tokenType),
      getItem(keys.username),
    ]);

  if (!accessToken || !username) return null;

  const parsedExpiresAt = expiresAtValue ? Number(expiresAtValue) : undefined;
  return {
    accessToken,
    expiresAt: Number.isFinite(parsedExpiresAt) ? parsedExpiresAt : undefined,
    loginSessionId: loginSessionId || undefined,
    refreshToken: refreshToken || undefined,
    tokenType: tokenType || 'Bearer',
    username,
  };
}

export async function restoreSession(): Promise<Session | null> {
  const generation = sessionGeneration;
  try {
    const session = await getSession();
    if (generation !== sessionGeneration) return null;
    if (!session) return null;

    const accessTokenIsFresh =
      !session.expiresAt || session.expiresAt - Date.now() > 30_000;
    if (accessTokenIsFresh) return session;

    if (!session.refreshToken) {
      await clearSession();
      return null;
    }

    const refreshed = await refreshAuthToken(session.refreshToken);
    if (generation !== sessionGeneration) return null;
    const nextSession: Session = {
      accessToken: refreshed.accessToken,
      expiresAt:
        typeof refreshed.expiresIn === 'number'
          ? Date.now() + refreshed.expiresIn * 1000
          : undefined,
      loginSessionId: refreshed.loginSessionId || session.loginSessionId,
      refreshToken: refreshed.refreshToken || session.refreshToken,
      tokenType: refreshed.tokenType || session.tokenType,
      username: session.username,
    };
    await persistSession(nextSession);
    if (generation !== sessionGeneration) {
      await clearStoredSession();
      return null;
    }
    return nextSession;
  } catch {
    if (generation === sessionGeneration) await clearSession();
    return null;
  }
}

async function clearStoredSession() {
  await Promise.all(Object.values(keys).map(deleteItem));
}

export async function clearSession() {
  // Invalidate refreshes already in flight before deleting stored credentials.
  sessionGeneration += 1;
  await clearStoredSession();
}

async function notifyServerLogout(session: Session) {
  await Promise.allSettled([
    session.loginSessionId
      ? postAuthorizedJson<{ ok: boolean }>(
          '/api/v1/global/login-sessions/logout',
          { loginSessionId: session.loginSessionId },
          session.accessToken,
          5_000,
        )
      : Promise.resolve(),
    postAuthorizedJson<{ ok: boolean }>(
      '/api/v1/global/presence/logout',
      undefined,
      session.accessToken,
      5_000,
    ),
  ]);
}

export async function logoutSession() {
  const session = await getSession();
  await clearSession();
  if (session) void notifyServerLogout(session);
}
