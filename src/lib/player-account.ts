import { ApiError, getJson, postAuthorizedJson, putAuthorizedJson } from '@/lib/api';
import { getSession } from '@/lib/session';

export type AccountTab = 'PROGRESS' | 'ACHIEVEMENTS' | 'PROFILE' | 'SUBSCRIPTION' | 'PRIVACY';
export type RatingSpeed = 'BULLET' | 'BLITZ' | 'RAPID' | 'CLASSICAL';

export type Country = { code: string; name: string };

export type PlayerTournamentMedal = {
  awardedAt: string;
  draws: number;
  gamesPlayed: number;
  id: number;
  losses: number;
  medalType: 'BRONZE' | 'GOLD' | 'SILVER';
  performanceRating?: number | null;
  placement: number;
  points: number;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  winPercent: number;
  wins: number;
};

export type PlayerProfile = {
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
  medals?: PlayerTournamentMedal[] | null;
  mobile?: string | null;
  pieceTheme?: string | null;
  showCoordinates?: boolean | null;
  showSquareNames?: boolean | null;
  squareNameColor?: string | null;
};

export type PlayerAccountMe = {
  avatarKey?: string | null;
  displayName?: string | null;
  nextBillingDate?: string | null;
  planCode?: string | null;
  userId: number;
};

export type PlayerPlan = {
  code: string;
  contactOnly: boolean;
  subtitle: string;
  title: string;
  yearlyPriceInr?: number | null;
};

export type CurrentPlayerRating = {
  gamesPlayed: number;
  provisional: boolean;
  rating: number;
  speed: RatingSpeed;
  username: string;
};

export type RatingProgressPoint = {
  date: string;
  rating: number;
  speed: RatingSpeed;
};

type MyDatabaseCollection = { id: number };
type MyDatabaseGame = {
  blackRating?: number | null;
  blackRatingDelta?: number | null;
  blackUsername?: string | null;
  playedAt?: string | null;
  rated?: boolean | null;
  timeControl?: string | null;
  whiteRating?: number | null;
  whiteRatingDelta?: number | null;
  whiteUsername?: string | null;
};
type MyDatabaseGamePage = { items?: MyDatabaseGame[] | null };

export type PlayerAccountData = {
  countries: Country[];
  me: PlayerAccountMe;
  profile: PlayerProfile;
  progress: RatingProgressPoint[];
  ratings: CurrentPlayerRating[];
  plans: PlayerPlan[];
  username: string;
};

const ratingControls: { speed: RatingSpeed; timeControl: string }[] = [
  { speed: 'BULLET', timeControl: '1+0' },
  { speed: 'BLITZ', timeControl: '5+0' },
  { speed: 'RAPID', timeControl: '10+0' },
  { speed: 'CLASSICAL', timeControl: '30+0' },
];

function speedFromTimeControl(timeControl?: string | null): RatingSpeed | null {
  if (!timeControl) return null;
  const minutes = Number.parseInt(timeControl.split('+')[0] || '', 10);
  if (Number.isNaN(minutes)) return 'BLITZ';
  if (minutes <= 2) return 'BULLET';
  if (minutes <= 8) return 'BLITZ';
  if (minutes <= 25) return 'RAPID';
  return 'CLASSICAL';
}

async function fetchRatingProgress(accessToken: string, username: string, ratings: CurrentPlayerRating[]) {
  try {
    const collections = await getJson<MyDatabaseCollection[]>('/api/v1/my-database/collections', accessToken);
    const pages = await Promise.all(
      collections.map((collection) => getJson<MyDatabaseGamePage>(
        `/api/v1/my-database/collections/${collection.id}/games?page=0&size=200`,
        accessToken,
      ).catch(() => null)),
    );
    const normalizedUsername = username.trim().toLowerCase();
    const unique = new Map<string, RatingProgressPoint>();
    pages.forEach((page) => page?.items?.forEach((game) => {
      if (!game.rated || !game.playedAt) return;
      const speed = speedFromTimeControl(game.timeControl);
      if (!speed) return;
      const white = String(game.whiteUsername || '').toLowerCase() === normalizedUsername;
      const black = String(game.blackUsername || '').toLowerCase() === normalizedUsername;
      const base = white ? game.whiteRating : black ? game.blackRating : null;
      const delta = white ? game.whiteRatingDelta : black ? game.blackRatingDelta : null;
      if (base == null) return;
      const point = { date: game.playedAt!, rating: base + (delta ?? 0), speed };
      unique.set(`${point.speed}:${point.date}:${point.rating}`, point);
    }));
    const points = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (points.length) return points;
  } catch {
    // Rating cards remain useful when My Database is unavailable for the plan.
  }
  return ratings.map((rating) => ({
    date: new Date().toISOString(),
    rating: rating.rating,
    speed: rating.speed,
  }));
}

export async function fetchPlayerAccount(): Promise<PlayerAccountData> {
  const session = await getSession();
  if (!session) throw new ApiError('Please sign in to view My Account.', 401);
  const token = session.accessToken;

  const [profile, countries, me, plans] = await Promise.all([
    getJson<PlayerProfile>('/api/v1/global/player-profile', token),
    getJson<Country[]>('/api/v1/global/countries'),
    getJson<PlayerAccountMe>('/api/v1/global/me', token),
    getJson<PlayerPlan[]>('/api/v1/player/plans'),
  ]);
  const ratings = (await Promise.all(
    ratingControls.map(({ timeControl }) => getJson<CurrentPlayerRating>(
      `/api/v1/player-ratings/me?timeControl=${encodeURIComponent(timeControl)}`,
      token,
    ).catch(() => null)),
  )).filter((rating): rating is CurrentPlayerRating => Boolean(rating));
  const username = me.displayName || profile.displayName || session.username;
  const progress = await fetchRatingProgress(token, username || '', ratings);
  return { countries, me, plans, profile, progress, ratings, username: session.username };
}

export async function savePlayerProfile(profile: PlayerProfile) {
  const session = await getSession();
  if (!session) throw new ApiError('Please sign in again to save your profile.', 401);
  // Send all profile preferences back. The backend PUT replaces every field,
  // so omitting hidden board preferences would reset the user's chosen theme.
  return putAuthorizedJson<PlayerProfile>('/api/v1/global/player-profile', profile, session.accessToken);
}

export async function requestAccountDeletion(currentPassword: string) {
  const session = await getSession();
  if (!session) throw new ApiError('Please sign in again to delete your account.', 401);
  return postAuthorizedJson<{ accepted: boolean; requestedAt: string; status: string }>(
    '/api/v1/global/account-deletion',
    { confirmation: 'DELETE', currentPassword, source: 'ANDROID' },
    session.accessToken,
  );
}
