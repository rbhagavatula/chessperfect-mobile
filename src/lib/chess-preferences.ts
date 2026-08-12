import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  DEFAULT_BOARD_THEME,
  DEFAULT_PIECE_THEME,
  isBoardThemeName,
  isPieceThemeName,
  type BoardThemeName,
  type PieceThemeName,
} from '@/constants/chess-themes';
import { getJson, putAuthorizedJson } from '@/lib/api';

const BOARD_THEME_KEY = 'chessperfect.boardTheme';
const PIECE_THEME_KEY = 'chessperfect.pieceTheme';
const PROFILE_PATH = '/api/v1/global/player-profile';
let serverSaveQueue: Promise<void> = Promise.resolve();

export type ChessPreferences = {
  boardTheme: BoardThemeName;
  pieceTheme: PieceThemeName;
};

type PlayerProfile = {
  avatarKey?: string | null;
  bio?: string | null;
  boardFrame?: boolean | null;
  boardFrameColor?: string | null;
  boardSound?: boolean | null;
  boardStudyAnnounceCommentary?: boolean | null;
  boardStudyAnnounceMoves?: boolean | null;
  boardStudyAutoPlay?: boolean | null;
  boardStudyAvatarId?: string | null;
  boardTheme?: string | null;
  coordinateColor?: string | null;
  countryCode?: string | null;
  displayName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  locationText?: string | null;
  mobile?: string | null;
  pieceTheme?: string | null;
  showCoordinates?: boolean | null;
  showSquareNames?: boolean | null;
  squareNameColor?: string | null;
};

async function getItem(key: string) {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function getStoredChessPreferences(): Promise<ChessPreferences> {
  const [storedBoardTheme, storedPieceTheme] = await Promise.all([
    getItem(BOARD_THEME_KEY),
    getItem(PIECE_THEME_KEY),
  ]);

  return {
    boardTheme: isBoardThemeName(storedBoardTheme) ? storedBoardTheme : DEFAULT_BOARD_THEME,
    pieceTheme: isPieceThemeName(storedPieceTheme) ? storedPieceTheme : DEFAULT_PIECE_THEME,
  };
}

async function storeChessPreferences(preferences: ChessPreferences) {
  await Promise.all([
    setItem(BOARD_THEME_KEY, preferences.boardTheme),
    setItem(PIECE_THEME_KEY, preferences.pieceTheme),
  ]);
}

export async function loadChessPreferences(accessToken?: string): Promise<ChessPreferences> {
  const stored = await getStoredChessPreferences();
  if (!accessToken) return stored;

  try {
    const profile = await getJson<PlayerProfile>(PROFILE_PATH, accessToken);
    const preferences = {
      boardTheme: isBoardThemeName(profile.boardTheme) ? profile.boardTheme : stored.boardTheme,
      pieceTheme: isPieceThemeName(profile.pieceTheme) ? profile.pieceTheme : stored.pieceTheme,
    };
    await storeChessPreferences(preferences);
    return preferences;
  } catch {
    return stored;
  }
}

export async function saveChessPreferences(
  preferences: ChessPreferences,
  accessToken?: string,
) {
  await storeChessPreferences(preferences);
  if (!accessToken) return;

  serverSaveQueue = serverSaveQueue.then(async () => {
    try {
      const profile = await getJson<PlayerProfile>(PROFILE_PATH, accessToken);
      await putAuthorizedJson<PlayerProfile>(
        PROFILE_PATH,
        {
          avatarKey: profile.avatarKey,
          bio: profile.bio,
          boardFrame: profile.boardFrame,
          boardFrameColor: profile.boardFrameColor,
          boardSound: profile.boardSound,
          boardStudyAnnounceCommentary: profile.boardStudyAnnounceCommentary,
          boardStudyAnnounceMoves: profile.boardStudyAnnounceMoves,
          boardStudyAutoPlay: profile.boardStudyAutoPlay,
          boardStudyAvatarId: profile.boardStudyAvatarId,
          boardTheme: preferences.boardTheme,
          coordinateColor: profile.coordinateColor,
          countryCode: profile.countryCode,
          displayName: profile.displayName,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          locationText: profile.locationText,
          mobile: profile.mobile,
          pieceTheme: preferences.pieceTheme,
          showCoordinates: profile.showCoordinates,
          showSquareNames: profile.showSquareNames,
          squareNameColor: profile.squareNameColor,
        },
        accessToken,
      );
    } catch {
      // The local choice remains active and can be synchronized on a later change.
    }
  });
  await serverSaveQueue;
}
