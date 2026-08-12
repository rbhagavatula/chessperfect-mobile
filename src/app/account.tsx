import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import { config } from '@/lib/config';
import {
  fetchPlayerAccount,
  savePlayerProfile,
  type AccountTab,
  type Country,
  type CurrentPlayerRating,
  type PlayerAccountData,
  type PlayerPlan,
  type PlayerProfile,
  type PlayerTournamentMedal,
  type RatingProgressPoint,
  type RatingSpeed,
} from '@/lib/player-account';

const tabs: { icon: SymbolViewProps['name']; label: string; value: AccountTab }[] = [
  { icon: { android: 'monitoring', ios: 'chart.xyaxis.line', web: 'monitoring' }, label: 'PROGRESS', value: 'PROGRESS' },
  { icon: { android: 'emoji_events', ios: 'trophy.fill', web: 'emoji_events' }, label: 'ACHIEVEMENTS', value: 'ACHIEVEMENTS' },
  { icon: { android: 'person', ios: 'person.crop.circle.fill', web: 'person' }, label: 'PROFILE', value: 'PROFILE' },
  { icon: { android: 'workspace_premium', ios: 'crown.fill', web: 'workspace_premium' }, label: 'PLAN', value: 'SUBSCRIPTION' },
];

const speedConfig: { color: string; label: string; speed: RatingSpeed; timeControl: string }[] = [
  { color: '#f97316', label: 'Bullet', speed: 'BULLET', timeControl: '1+0' },
  { color: '#38bdf8', label: 'Blitz', speed: 'BLITZ', timeControl: '5+0' },
  { color: '#34d399', label: 'Rapid', speed: 'RAPID', timeControl: '10+0' },
  { color: '#facc15', label: 'Classical', speed: 'CLASSICAL', timeControl: '30+0' },
];

function resolveAvatarUri(value?: string | null) {
  const key = value?.trim();
  if (!key) return null;
  if (/^(https?:|data:)/i.test(key)) return key;
  if (key.startsWith('/')) return `${config.apiBaseUrl}${key}`;
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatInr(value?: number | null) {
  if (!value) return 'Free';
  return `₹${Math.round(value).toLocaleString('en-IN')} / year`;
}

function isEmail(value: string) {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhone(value: string) {
  return !value.trim() || /^[0-9+()\-\s]{6,30}$/.test(value.trim());
}

export default function MyAccountScreen() {
  const [activeTab, setActiveTab] = useState<AccountTab>('PROGRESS');
  const [data, setData] = useState<PlayerAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await fetchPlayerAccount());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'My Account is unavailable right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader showSettings={false} title="My Account" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safeArea}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
            showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.statePanel}><ActivityIndicator color={colors.goldLight} size="large" /><Text style={styles.stateTitle}>Opening your royal record...</Text></View>
            ) : error || !data ? (
              <View style={styles.statePanel}>
                <SymbolView name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }} size={40} tintColor={colors.danger} />
                <Text style={styles.stateTitle}>My Account is unavailable</Text>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable onPress={() => void load()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>TRY AGAIN</Text></Pressable>
              </View>
            ) : (
              <>
                <AccountIdentity data={data} />
                <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroller}>
                  {tabs.map((tab) => {
                    const active = activeTab === tab.value;
                    return (
                      <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.value} onPress={() => setActiveTab(tab.value)} style={[styles.tab, active && styles.tabActive]}>
                        <SymbolView name={tab.icon} size={17} tintColor={active ? '#261607' : colors.sandstone} />
                        <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {activeTab === 'PROGRESS' ? <ProgressPanel progress={data.progress} ratings={data.ratings} /> : null}
                {activeTab === 'ACHIEVEMENTS' ? <AchievementsPanel medals={data.profile.medals ?? []} /> : null}
                {activeTab === 'PROFILE' ? <ProfilePanel countries={data.countries} initialProfile={data.profile} onSaved={(profile) => setData((current) => current ? { ...current, profile } : current)} /> : null}
                {activeTab === 'SUBSCRIPTION' ? <SubscriptionPanel currentCode={data.me.planCode || 'FREE'} nextBillingDate={data.me.nextBillingDate} plans={data.plans} /> : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function AccountIdentity({ data }: { data: PlayerAccountData }) {
  const name = data.me.displayName || data.profile.displayName || data.username || 'Player';
  const avatarUri = resolveAvatarUri(data.me.avatarKey || data.profile.avatarKey);
  return (
    <View style={styles.identityPanel}>
      <RoyalCorners />
      <View style={styles.avatar}>
        {avatarUri ? <Image contentFit="cover" source={{ uri: avatarUri }} style={StyleSheet.absoluteFill} /> : <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>}
      </View>
      <View style={styles.identityCopy}>
        <Text style={styles.eyebrow}>PLAYER ACCOUNT</Text>
        <Text numberOfLines={1} style={styles.identityName}>{name}</Text>
        <Text style={styles.identityPlan}>{(data.me.planCode || 'FREE').toUpperCase()} PLAN</Text>
      </View>
      <SymbolView name={{ android: 'verified', ios: 'checkmark.seal.fill', web: 'verified' }} size={25} tintColor={colors.goldLight} />
    </View>
  );
}

function ProgressPanel({ progress, ratings }: { progress: RatingProgressPoint[]; ratings: CurrentPlayerRating[] }) {
  const bySpeed = useMemo(() => new Map(ratings.map((rating) => [rating.speed, rating])), [ratings]);
  return (
    <View>
      <SectionHeading eyebrow="MY PROGRESS" title="Game Insights" />
      <View style={styles.ratingGrid}>
        {speedConfig.map((speed) => {
          const rating = bySpeed.get(speed.speed);
          return (
            <View key={speed.speed} style={styles.ratingCard}>
              <View style={styles.ratingHeading}><Text style={styles.ratingName}>{speed.label}</Text><View style={[styles.speedDot, { backgroundColor: speed.color }]} /></View>
              <Text style={styles.ratingValue}>{rating?.rating ?? 1400}{rating?.provisional ? '?' : ''}</Text>
              <Text style={styles.ratingMeta}>{rating?.gamesPlayed ?? 0} GAMES · {speed.timeControl}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.panel}>
        <RoyalCorners />
        <Text style={styles.panelTitle}>Rating Progress</Text>
        <Text style={styles.panelSubtitle}>Your latest rated-game results by time control.</Text>
        <OrnamentDivider />
        {speedConfig.map((speed) => <RatingTrack color={speed.color} key={speed.speed} label={speed.label} points={progress.filter((point) => point.speed === speed.speed)} />)}
      </View>
    </View>
  );
}

function RatingTrack({ color, label, points }: { color: string; label: string; points: RatingProgressPoint[] }) {
  const visible = points.slice(-12);
  const current = visible.at(-1)?.rating ?? 1400;
  const min = Math.min(1200, ...visible.map((point) => point.rating));
  const max = Math.max(1600, ...visible.map((point) => point.rating));
  return (
    <View style={styles.trackRow}>
      <View style={styles.trackHeading}><View style={[styles.speedDot, { backgroundColor: color }]} /><Text style={styles.trackLabel}>{label}</Text><Text style={styles.trackRating}>{current}</Text></View>
      <View style={styles.track}>
        {[0, 1, 2, 3, 4].map((line) => <View key={line} style={[styles.trackGridLine, { left: `${line * 25}%` }]} />)}
        {visible.map((point, index) => {
          const left = visible.length <= 1 ? 50 : (index / (visible.length - 1)) * 100;
          const bottom = 4 + ((point.rating - min) / Math.max(1, max - min)) * 25;
          return <View key={`${point.date}-${index}`} style={[styles.trackPoint, { backgroundColor: color, bottom, left: `${left}%` }]} />;
        })}
        {!visible.length ? <Text style={styles.noTrackData}>Play rated games to build your chart</Text> : null}
      </View>
    </View>
  );
}

function AchievementsPanel({ medals }: { medals: PlayerTournamentMedal[] }) {
  const counts = { BRONZE: 0, GOLD: 0, SILVER: 0 };
  medals.forEach((medal) => { counts[medal.medalType] += 1; });
  return (
    <View>
      <SectionHeading eyebrow="ACHIEVEMENTS" title="Player Honours" />
      <View style={styles.medalCountRow}>
        <MedalCount color="#f7c948" label="GOLD" value={counts.GOLD} />
        <MedalCount color="#d7dee7" label="SILVER" value={counts.SILVER} />
        <MedalCount color="#c47b45" label="BRONZE" value={counts.BRONZE} />
      </View>
      <View style={styles.panel}>
        <RoyalCorners />
        <Text style={styles.panelTitle}>Tournament Medals</Text>
        <Text style={styles.panelSubtitle}>Your public ChessPerfect trophy shelf.</Text>
        {medals.length ? medals.slice(0, 6).map((medal) => <MedalCard key={medal.id} medal={medal} />) : (
          <View style={styles.emptyBox}><SymbolView name={{ android: 'military_tech', ios: 'medal.fill', web: 'military_tech' }} size={38} tintColor={colors.gold} /><Text style={styles.emptyTitle}>Your first medal awaits</Text><Text style={styles.stateText}>Tournament medals will appear here when they are awarded.</Text></View>
        )}
      </View>
    </View>
  );
}

function MedalCount({ color, label, value }: { color: string; label: string; value: number }) {
  return <View style={styles.medalCount}><SymbolView name={{ android: 'military_tech', ios: 'medal.fill', web: 'military_tech' }} size={24} tintColor={color} /><Text style={styles.medalCountValue}>{value}</Text><Text style={styles.medalCountLabel}>{label}</Text></View>;
}

function MedalCard({ medal }: { medal: PlayerTournamentMedal }) {
  const medalColor = medal.medalType === 'GOLD' ? '#f7c948' : medal.medalType === 'SILVER' ? '#d7dee7' : '#c47b45';
  return (
    <View style={styles.medalCard}>
      <View style={[styles.medalDisc, { borderColor: medalColor }]}><Text style={[styles.medalDiscText, { color: medalColor }]}>{medal.medalType.charAt(0)}</Text></View>
      <View style={styles.medalCopy}><Text numberOfLines={2} style={styles.medalTitle}>{medal.tournamentName}</Text><Text style={styles.medalMeta}>Rank {medal.placement} · {medal.points} points · {Math.round(Number(medal.winPercent) || 0)}% wins</Text><Text style={styles.medalDate}>{formatDate(medal.awardedAt)}</Text></View>
    </View>
  );
}

function ProfilePanel({ countries, initialProfile, onSaved }: { countries: Country[]; initialProfile: PlayerProfile; onSaved: (profile: PlayerProfile) => void }) {
  const [profile, setProfile] = useState(initialProfile);
  const [countryOpen, setCountryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedCountry = countries.find((country) => country.code === profile.countryCode);

  function update(field: keyof PlayerProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage(null);
    setSaveError(null);
  }

  async function save() {
    if (!isEmail(profile.email || '')) return setSaveError('Enter a valid email address.');
    if (!isPhone(profile.mobile || '')) return setSaveError('Enter a valid mobile number.');
    setSaving(true);
    setSaveError(null);
    setMessage(null);
    try {
      const saved = await savePlayerProfile(profile);
      setProfile(saved);
      onSaved(saved);
      setMessage('Profile saved successfully.');
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <SectionHeading eyebrow="PUBLIC ACCOUNT DETAILS" title="Profile" />
      <View style={styles.panel}>
        <RoyalCorners />
        <ProfileField label="DISPLAY NAME" onChangeText={(value) => update('displayName', value)} value={profile.displayName || ''} />
        <View style={styles.fieldRow}><ProfileField compact label="FIRST NAME" onChangeText={(value) => update('firstName', value)} value={profile.firstName || ''} /><ProfileField compact label="LAST NAME" onChangeText={(value) => update('lastName', value)} value={profile.lastName || ''} /></View>
        <ProfileField autoCapitalize="none" keyboardType="email-address" label="EMAIL" onChangeText={(value) => update('email', value)} value={profile.email || ''} />
        <ProfileField keyboardType="phone-pad" label="MOBILE" onChangeText={(value) => update('mobile', value)} value={profile.mobile || ''} />
        <ProfileField label="LOCATION" onChangeText={(value) => update('locationText', value)} value={profile.locationText || ''} />
        <Text style={styles.fieldLabel}>COUNTRY</Text>
        <Pressable onPress={() => setCountryOpen(true)} style={styles.selectField}><Text style={[styles.selectText, !selectedCountry && styles.placeholder]}>{selectedCountry?.name || 'Select country'}</Text><SymbolView name={{ android: 'arrow_drop_down', ios: 'chevron.down', web: 'arrow_drop_down' }} size={19} tintColor={colors.goldLight} /></Pressable>
        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#2b1807" /> : <Text style={styles.primaryButtonText}>SAVE PROFILE</Text>}</Pressable>
      </View>
      <CountryModal countries={countries} onClose={() => setCountryOpen(false)} onSelect={(country) => { update('countryCode', country.code); setCountryOpen(false); }} visible={countryOpen} />
    </View>
  );
}

function ProfileField({ compact, label, ...inputProps }: React.ComponentProps<typeof TextInput> & { compact?: boolean; label: string }) {
  return <View style={compact ? styles.compactField : undefined}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor="#796f60" selectionColor={colors.goldLight} style={styles.textInput} {...inputProps} /></View>;
}

function CountryModal({ countries, onClose, onSelect, visible }: { countries: Country[]; onClose: () => void; onSelect: (country: Country) => void; visible: boolean }) {
  const [query, setQuery] = useState('');
  const filtered = countries.filter((country) => `${country.name} ${country.code}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}><View style={styles.modalPanel}>
        <Text style={styles.modalTitle}>Choose Country</Text>
        <TextInput autoCapitalize="none" onChangeText={setQuery} placeholder="Search countries" placeholderTextColor={colors.muted} selectionColor={colors.goldLight} style={styles.searchInput} value={query} />
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.countryList}>{filtered.map((country) => <Pressable key={country.code} onPress={() => onSelect(country)} style={styles.countryRow}><Text style={styles.countryName}>{country.name}</Text><Text style={styles.countryCode}>{country.code}</Text></Pressable>)}</ScrollView>
        <Pressable onPress={onClose} style={styles.modalClose}><Text style={styles.modalCloseText}>CANCEL</Text></Pressable>
      </View></View>
    </Modal>
  );
}

function SubscriptionPanel({ currentCode, nextBillingDate, plans }: { currentCode: string; nextBillingDate?: string | null; plans: PlayerPlan[] }) {
  const code = currentCode.toUpperCase();
  const current = plans.find((plan) => plan.code.toUpperCase() === code);
  const upgrade = code === 'FREE' ? 'premium' : code === 'PREMIUM' ? 'master' : null;
  async function managePlan() {
    const url = new URL('/subscription', config.apiBaseUrl);
    if (upgrade) url.searchParams.set('upgrade', upgrade);
    await WebBrowser.openBrowserAsync(url.toString(), { createTask: false });
  }
  return (
    <View>
      <SectionHeading eyebrow="SUBSCRIPTION" title={`${current?.title || code} Plan`} />
      <View style={styles.planHero}>
        <RoyalCorners />
        <View style={styles.planCrown}><SymbolView name={{ android: 'workspace_premium', ios: 'crown.fill', web: 'workspace_premium' }} size={35} tintColor={colors.goldLight} /></View>
        <Text style={styles.planTitle}>{current?.title || code}</Text>
        <Text style={styles.planSubtitle}>{current?.subtitle || 'Your current ChessPerfect player plan.'}</Text>
        <View style={styles.planFacts}><PlanFact label="PRICE" value={current?.contactOnly ? 'Contact us' : formatInr(current?.yearlyPriceInr)} /><PlanFact label="NEXT BILLING" value={code === 'FREE' ? 'Not scheduled' : formatDate(nextBillingDate)} /></View>
        {upgrade ? <Pressable onPress={() => void managePlan()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>UPGRADE PLAN</Text></Pressable> : <View style={styles.highestPlan}><Text style={styles.highestPlanText}>HIGHEST PLAYER PLAN</Text></View>}
      </View>
      <View style={styles.planList}>{plans.filter((plan) => plan.code !== 'FREE').map((plan) => <PlanCard current={plan.code.toUpperCase() === code} key={plan.code} plan={plan} />)}</View>
    </View>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) { return <View style={styles.planFact}><Text style={styles.planFactLabel}>{label}</Text><Text numberOfLines={2} style={styles.planFactValue}>{value}</Text></View>; }
function PlanCard({ current, plan }: { current: boolean; plan: PlayerPlan }) { return <View style={[styles.planCard, current && styles.planCardCurrent]}><View style={styles.planCardHeading}><Text style={styles.planCardTitle}>{plan.title}</Text>{current ? <Text style={styles.currentBadge}>CURRENT</Text> : null}</View><Text style={styles.planCardSubtitle}>{plan.subtitle}</Text><Text style={styles.planCardPrice}>{plan.contactOnly ? 'Contact us' : formatInr(plan.yearlyPriceInr)}</Text></View>; }
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <View style={styles.sectionHeading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text></View>; }

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: '#2b1a0e', borderColor: colors.goldLight, borderRadius: 30, borderWidth: 1.5, height: 60, justifyContent: 'center', overflow: 'hidden', width: 60 }, avatarInitial: { color: colors.goldLight, fontFamily: 'serif', fontSize: 29, fontWeight: '900' },
  background: { flex: 1 }, safeArea: { flex: 1 }, content: { flexGrow: 1, paddingBottom: 35, paddingHorizontal: 14 },
  compactField: { flex: 1, minWidth: 0 }, countryCode: { color: colors.gold, fontSize: 10, fontWeight: '900' }, countryList: { maxHeight: 390 }, countryName: { color: colors.cream, flex: 1, fontSize: 13 }, countryRow: { alignItems: 'center', borderBottomColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 13 },
  currentBadge: { backgroundColor: colors.goldLight, borderRadius: 10, color: '#211305', fontSize: 7, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  disabled: { opacity: 0.55 }, emptyBox: { alignItems: 'center', borderColor: 'rgba(201,143,28,0.3)', borderRadius: 11, borderStyle: 'dashed', borderWidth: 1, marginTop: 16, padding: 25 }, emptyTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900', marginTop: 9 }, errorText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: 'center' }, eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  fieldLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginBottom: 6, marginTop: 13 }, fieldRow: { flexDirection: 'row', gap: 10 },
  highestPlan: { alignItems: 'center', backgroundColor: 'rgba(52,211,153,0.12)', borderColor: colors.success, borderRadius: 8, borderWidth: 1, marginTop: 18, padding: 12 }, highestPlanText: { color: '#a7f3d0', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  identityCopy: { flex: 1, marginHorizontal: 13, minWidth: 0 }, identityName: { color: colors.cream, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginTop: 3 }, identityPanel: { alignItems: 'center', backgroundColor: 'rgba(7,16,24,0.95)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 16, padding: 15 }, identityPlan: { color: colors.sandstone, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginTop: 4 },
  medalCard: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.09)', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 11, padding: 12 }, medalCopy: { flex: 1, marginLeft: 12 }, medalCount: { alignItems: 'center', backgroundColor: 'rgba(7,15,22,0.95)', borderColor: colors.goldDark, borderRadius: 12, borderWidth: 1, flex: 1, padding: 12 }, medalCountLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7, marginTop: 3 }, medalCountRow: { flexDirection: 'row', gap: 8 }, medalCountValue: { color: colors.cream, fontFamily: 'serif', fontSize: 21, fontWeight: '900' }, medalDate: { color: colors.muted, fontSize: 8, marginTop: 5 }, medalDisc: { alignItems: 'center', backgroundColor: '#1b140e', borderRadius: 25, borderWidth: 3, height: 50, justifyContent: 'center', width: 50 }, medalDiscText: { fontFamily: 'serif', fontSize: 19, fontWeight: '900' }, medalMeta: { color: colors.sandstone, fontSize: 9, marginTop: 4 }, medalTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.75)', flex: 1, justifyContent: 'center', padding: 22 }, modalClose: { alignItems: 'center', borderColor: colors.gold, borderRadius: 8, borderWidth: 1, marginTop: 12, padding: 11 }, modalCloseText: { color: colors.goldLight, fontSize: 9, fontWeight: '900' }, modalPanel: { backgroundColor: colors.navy, borderColor: colors.gold, borderRadius: 14, borderWidth: 1, maxHeight: '78%', padding: 16, width: '100%' }, modalTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  noTrackData: { color: colors.muted, fontSize: 8, left: 12, position: 'absolute', top: 13 },
  panel: { backgroundColor: 'rgba(7,15,22,0.96)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 13, padding: 15 }, panelSubtitle: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 4 }, panelTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900' }, placeholder: { color: colors.muted },
  planCard: { backgroundColor: 'rgba(7,15,22,0.95)', borderColor: colors.goldDark, borderRadius: 12, borderWidth: 1, padding: 14 }, planCardCurrent: { backgroundColor: 'rgba(185,130,28,0.15)', borderColor: colors.goldLight }, planCardHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, planCardPrice: { color: colors.goldLight, fontFamily: 'serif', fontSize: 17, fontWeight: '900', marginTop: 11 }, planCardSubtitle: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, planCardTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '900' }, planCrown: { alignItems: 'center', backgroundColor: '#21160e', borderColor: colors.gold, borderRadius: 31, borderWidth: 1.5, height: 62, justifyContent: 'center', width: 62 }, planFact: { backgroundColor: 'rgba(0,0,0,0.23)', borderColor: 'rgba(255,255,255,0.08)', borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 61, padding: 10 }, planFactLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 }, planFactValue: { color: colors.cream, fontSize: 11, fontWeight: '800', marginTop: 6 }, planFacts: { flexDirection: 'row', gap: 8, marginTop: 17, width: '100%' }, planHero: { alignItems: 'center', backgroundColor: 'rgba(7,15,22,0.96)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 18 }, planList: { gap: 11, marginTop: 13 }, planSubtitle: { color: colors.sandstone, fontSize: 10, lineHeight: 15, marginTop: 6, textAlign: 'center' }, planTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 25, fontWeight: '900', marginTop: 11 },
  pressed: { opacity: 0.8 }, primaryButton: { alignItems: 'center', backgroundColor: colors.goldLight, borderColor: '#fff0aa', borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 45, paddingHorizontal: 23 }, primaryButtonText: { color: '#211305', fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  ratingCard: { backgroundColor: 'rgba(7,15,22,0.96)', borderColor: colors.goldDark, borderRadius: 11, borderWidth: 1, padding: 12, width: '48.6%' }, ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, ratingHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, ratingMeta: { color: colors.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 5 }, ratingName: { color: colors.sandstone, fontSize: 10, fontWeight: '900' }, ratingValue: { color: colors.cream, fontFamily: 'serif', fontSize: 24, fontWeight: '900', marginTop: 9 },
  searchInput: { backgroundColor: 'rgba(0,0,0,0.24)', borderColor: colors.goldDark, borderRadius: 8, borderWidth: 1, color: colors.cream, fontSize: 12, minHeight: 44, paddingHorizontal: 12 }, sectionHeading: { marginBottom: 12, marginTop: 18 }, sectionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 3 }, selectField: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderColor: colors.goldDark, borderRadius: 8, borderWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 12 }, selectText: { color: colors.cream, flex: 1, fontSize: 12 }, speedDot: { borderRadius: 5, height: 9, width: 9 }, statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 420, padding: 25 }, stateText: { color: colors.sandstone, fontSize: 10, lineHeight: 16, marginTop: 8, textAlign: 'center' }, stateTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 12, textAlign: 'center' }, successText: { color: '#a7f3d0', fontSize: 10, marginTop: 11, textAlign: 'center' },
  tab: { alignItems: 'center', alignSelf: 'center', borderColor: colors.goldDark, borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 6, height: 35, justifyContent: 'center', paddingHorizontal: 12 }, tabActive: { backgroundColor: colors.goldLight, borderColor: '#fff0aa' }, tabScroller: { flexGrow: 0, height: 56, marginTop: 5 }, tabText: { color: colors.sandstone, fontSize: 8, fontWeight: '900' }, tabTextActive: { color: '#211305' }, tabs: { alignItems: 'center', gap: 7, paddingRight: 2, paddingTop: 12 },
  textInput: { backgroundColor: 'rgba(0,0,0,0.25)', borderColor: colors.goldDark, borderRadius: 8, borderWidth: 1, color: colors.cream, fontSize: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 9 },
  track: { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 7, height: 38, marginTop: 7, overflow: 'hidden', position: 'relative' }, trackGridLine: { backgroundColor: 'rgba(255,255,255,0.08)', bottom: 0, position: 'absolute', top: 0, width: 1 }, trackHeading: { alignItems: 'center', flexDirection: 'row', gap: 7 }, trackLabel: { color: colors.sandstone, flex: 1, fontSize: 9, fontWeight: '900' }, trackPoint: { borderColor: colors.ink, borderRadius: 4, borderWidth: 1, height: 7, marginLeft: -3, position: 'absolute', width: 7 }, trackRating: { color: colors.cream, fontSize: 11, fontWeight: '900' }, trackRow: { marginBottom: 13 },
});
