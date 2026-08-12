const productionApiBaseUrl = 'https://chessperfect.com';

export const config = {
  apiBaseUrl: (process.env.EXPO_PUBLIC_API_BASE_URL || productionApiBaseUrl).replace(/\/+$/, ''),
} as const;
