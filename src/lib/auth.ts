import { ApiError, postJson, postJsonFromOrigin } from '@/lib/api';

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresIn?: number;
  mustChangePassword?: boolean;
  academyConsentRequired?: boolean;
  loginSessionId?: string | null;
};

function requireAuthTokenResponse(payload: AuthTokenResponse): AuthTokenResponse {
  if (typeof payload?.accessToken !== 'string' || !payload.accessToken.trim()) {
    throw new ApiError('ChessPerfect returned an invalid sign-in response. Please try again.', 502);
  }

  return {
    ...payload,
    accessToken: payload.accessToken.trim(),
    refreshToken: payload.refreshToken?.trim() || undefined,
    tokenType: payload.tokenType?.trim() || 'Bearer',
    loginSessionId: payload.loginSessionId?.trim() || undefined,
  };
}

export async function signInWithPassword(username: string, password: string) {
  const response = await postJson<AuthTokenResponse>('/api/v1/global/auth/login', {
    username,
    password,
  });
  return requireAuthTokenResponse(response);
}

export async function refreshAuthToken(refreshToken: string) {
  const response = await postJson<AuthTokenResponse>('/api/v1/global/auth/refresh', {
    refreshToken,
  });
  return requireAuthTokenResponse(response);
}

export async function refreshAuthTokenFromOrigin(refreshToken: string, origin: string) {
  const response = await postJsonFromOrigin<AuthTokenResponse>(
    '/api/v1/global/auth/refresh',
    origin,
    { refreshToken },
  );
  return requireAuthTokenResponse(response);
}
