import { config } from '@/lib/config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'object' && payload !== null) {
    const errorPayload = payload as {
      code?: unknown;
      error?: unknown;
      message?: unknown;
    };
    for (const candidate of [errorPayload.message, errorPayload.error, errorPayload.code]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return fallback;
}

export async function postJson<TResponse>(
  path: string,
  body: unknown,
  timeoutMs = 15_000
): Promise<TResponse> {
  return postJsonFromOrigin(path, config.apiBaseUrl, body, timeoutMs);
}

export async function postJsonFromOrigin<TResponse>(
  path: string,
  origin: string,
  body: unknown,
  timeoutMs = 15_000
): Promise<TResponse> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetch(`${origin.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new ApiError('ChessPerfect took too long to respond. Please try again.', 0);
    }
    throw new ApiError('Unable to reach ChessPerfect. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, 'ChessPerfect could not complete this request.'), response.status);
  }

  return payload as TResponse;
}

export async function postAuthorizedJson<TResponse>(
  path: string,
  body: unknown,
  accessToken: string,
  timeoutMs = 15_000
): Promise<TResponse> {
  return postAuthorizedJsonFromOrigin(path, config.apiBaseUrl, body, accessToken, timeoutMs);
}

export async function postAuthorizedJsonFromOrigin<TResponse>(
  path: string,
  origin: string,
  body: unknown,
  accessToken: string,
  timeoutMs = 15_000
): Promise<TResponse> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetch(`${origin.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new ApiError('ChessPerfect took too long to respond. Please try again.', 0);
    }
    throw new ApiError('Unable to reach ChessPerfect. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, 'ChessPerfect could not complete this request.'), response.status);
  }

  return payload as TResponse;
}

export async function putAuthorizedJson<TResponse>(
  path: string,
  body: unknown,
  accessToken: string,
  timeoutMs = 15_000
): Promise<TResponse> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new ApiError('ChessPerfect took too long to respond. Please try again.', 0);
    }
    throw new ApiError('Unable to reach ChessPerfect. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, 'ChessPerfect could not complete this request.'), response.status);
  }

  return payload as TResponse;
}

export async function getJson<TResponse>(
  path: string,
  accessToken?: string,
  timeoutMs = 15_000
): Promise<TResponse> {
	return getJsonFromOrigin(path, config.apiBaseUrl, accessToken, timeoutMs);
}

export async function getJsonFromOrigin<TResponse>(
  path: string,
  origin: string,
  accessToken?: string,
  timeoutMs = 15_000
): Promise<TResponse> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetch(`${origin.replace(/\/+$/, '')}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      signal: controller.signal,
    });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new ApiError('ChessPerfect took too long to respond. Please try again.', 0);
    }
    throw new ApiError('Unable to reach ChessPerfect. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(errorMessage(payload, 'ChessPerfect could not complete this request.'), response.status);
  }

  return payload as TResponse;
}
