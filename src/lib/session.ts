import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { refreshAuthToken } from '@/lib/auth';

const keys = {
  accessToken: 'chessperfect.accessToken',
  expiresAt: 'chessperfect.expiresAt',
  loginSessionId: 'chessperfect.loginSessionId',
  refreshToken: 'chessperfect.refreshToken',
  tokenType: 'chessperfect.tokenType',
  username: 'chessperfect.username',
} as const;

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

export async function saveSession(session: Session) {
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
  try {
    const session = await getSession();
    if (!session) return null;

    const accessTokenIsFresh =
      !session.expiresAt || session.expiresAt - Date.now() > 30_000;
    if (accessTokenIsFresh) return session;

    if (!session.refreshToken) {
      await clearSession();
      return null;
    }

    const refreshed = await refreshAuthToken(session.refreshToken);
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
    await saveSession(nextSession);
    return nextSession;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  await Promise.all(Object.values(keys).map(deleteItem));
}
