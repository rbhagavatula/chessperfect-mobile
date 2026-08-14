import type { ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalDashboardCard } from '@/components/royal-dashboard-card';
import { colors } from '@/constants/colors';
import {
  fetchCoachBatches,
  fetchCoachUpcomingClasses,
  getSelectedAcademy,
  startCoachAdhocClass,
  startCoachClass,
  type CoachBatch,
  type CoachUpcomingClass,
  type SelectedAcademy,
} from '@/lib/academy';

type CoachMenuCard = { label: string; source: ImageSource };

type BatchScheduleSlot = {
  day: string;
  end: string;
  start: string;
};

const scheduleDayOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const scheduleDayLabels: Record<string, string> = {
  FRI: 'Fri',
  MON: 'Mon',
  SAT: 'Sat',
  SUN: 'Sun',
  THU: 'Thu',
  TUE: 'Tue',
  WED: 'Wed',
};

const menuCards: CoachMenuCard[] = [
  { label: 'STUDY LIBRARY', source: require('@/assets/academy/study-library-card-mobile-v1.jpg') },
  { label: 'MY BATCHES', source: require('@/assets/dashboard/academy-card-mobile-v1.jpg') },
  { label: 'ATTENDANCE', source: require('@/assets/academy/attendance-card-mobile-v1.jpg') },
  { label: 'CLASS ABSENCES', source: require('@/assets/academy/database-card-mobile-v1.jpg') },
];

function batchScheduleSlots(batch: CoachBatch) {
  if (!batch.scheduleJson) return [];
  try {
    const parsed = JSON.parse(batch.scheduleJson) as { days?: unknown };
    if (!Array.isArray(parsed.days)) return [];
    return parsed.days
      .filter((item): item is BatchScheduleSlot => {
        if (!item || typeof item !== 'object') return false;
        const slot = item as Partial<BatchScheduleSlot>;
        return typeof slot.day === 'string' && typeof slot.start === 'string' && typeof slot.end === 'string';
      })
      .sort((left, right) => {
        const timeOrder = left.start.localeCompare(right.start);
        if (timeOrder !== 0) return timeOrder;
        return scheduleDayOrder.indexOf(left.day) - scheduleDayOrder.indexOf(right.day);
      });
  } catch {
    return [];
  }
}

function formatClock(value: string) {
  const [hourText, minuteText = '00'] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const clockHour = hour % 12 || 12;
  return `${clockHour}:${minuteText.slice(0, 2)} ${suffix}`;
}

function timezoneLabel(timezone?: string | null) {
  if (!timezone || timezone === 'Asia/Kolkata') return 'IST';
  if (timezone === 'UTC' || timezone === 'Etc/UTC') return 'GMT';
  return timezone.split('/').at(-1)?.replaceAll('_', ' ') || timezone;
}

function batchScheduleLabel(batch: CoachBatch) {
  const slots = batchScheduleSlots(batch);
  if (!slots.length) return 'Schedule not configured';
  const first = slots[0];
  const sameTime = slots.every((slot) => slot.start === first.start && slot.end === first.end);
  if (sameTime) {
    const days = [...slots]
      .sort((left, right) => scheduleDayOrder.indexOf(left.day) - scheduleDayOrder.indexOf(right.day))
      .map((slot) => scheduleDayLabels[slot.day] || slot.day)
      .join(', ');
    return `${days} · ${formatClock(first.start)}–${formatClock(first.end)} ${timezoneLabel(batch.timezone)}`;
  }
  return slots
    .map((slot) => `${scheduleDayLabels[slot.day] || slot.day} ${formatClock(slot.start)}–${formatClock(slot.end)}`)
    .join(' · ');
}

function sortBatchesByTime(items: CoachBatch[]) {
  return [...items].sort((left, right) => {
    const leftTime = batchScheduleSlots(left)[0]?.start;
    const rightTime = batchScheduleSlots(right)[0]?.start;
    if (leftTime && rightTime) {
      const timeOrder = leftTime.localeCompare(rightTime);
      if (timeOrder !== 0) return timeOrder;
    } else if (leftTime) {
      return -1;
    } else if (rightTime) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function meetingStartError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const known: Record<string, string> = {
    MEETING_CREATE_FAILED: 'ChessPerfect could not create the Jitsi meeting. Please try again.',
    MEETING_SETTINGS_NOT_ACTIVE: 'Live meeting integration is disabled for this academy.',
  };
  return known[message] ?? message;
}

function countdownLabel(startAt: string, now: number) {
  const difference = new Date(startAt).getTime() - now;
  if (!Number.isFinite(difference) || difference <= 0) return 'STARTING NOW';
  const totalSeconds = Math.ceil(difference / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function classTime(item: CoachUpcomingClass) {
  const date = new Date(item.startAt);
  if (Number.isNaN(date.getTime())) return `${item.sessionDate} · ${item.startTime}`;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });
}

function dedupeClasses(items: CoachUpcomingClass[]) {
  const rows = new Map<string, CoachUpcomingClass>();
  for (const item of items) {
    const key = [item.batchName ?? item.batchId, item.sessionDate, item.startTime, item.endTime]
      .map((value) => String(value).trim().toLowerCase())
      .join('|');
    const existing = rows.get(key);
    if (!existing || (!existing.sessionId && item.sessionId) || (existing.status !== 'LIVE' && item.status === 'LIVE')) {
      rows.set(key, item);
    }
  }
  return [...rows.values()].slice(0, 5);
}

function ClassIcon({ name }: { name: SymbolViewProps['name'] }) {
  return <SymbolView name={name} size={24} tintColor={colors.goldLight} />;
}

export default function CoachDashboardScreen() {
  const [academy, setAcademy] = useState<SelectedAcademy | null>(null);
  const [classes, setClasses] = useState<CoachUpcomingClass[]>([]);
  const [batches, setBatches] = useState<CoachBatch[]>([]);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingBatchId, setStartingBatchId] = useState<number | null>(null);
  const [startingAdhocBatchId, setStartingAdhocBatchId] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const selected = await getSelectedAcademy();
      if (!selected) {
        router.replace('/academy' as Href);
        return;
      }
      if (selected.role !== 'COACH') {
        router.replace('/academy/student-dashboard' as Href);
        return;
      }
      setAcademy(selected);
      const [response, assignedBatches] = await Promise.all([
        fetchCoachUpcomingClasses(selected),
        fetchCoachBatches(selected),
      ]);
      setClasses(dedupeClasses(response.classes ?? []));
      setBatches(sortBatchesByTime((assignedBatches ?? []).filter((batch) => batch.active)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the Coach Dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadDashboard(), 0);
    const initialTick = setTimeout(() => setNow(Date.now()), 0);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(initialLoad);
      clearTimeout(initialTick);
      clearInterval(clock);
    };
  }, [loadDashboard]);

  const nextClass = classes[0] ?? null;
  const countdown = useMemo(
    () => nextClass ? countdownLabel(nextClass.startAt, now) : '--:--:--',
    [nextClass, now],
  );

  async function openClass(item: CoachUpcomingClass) {
    if (!academy || startingBatchId !== null || !item.startAllowed) return;
    setStartingBatchId(item.batchId);
    setError(null);
    try {
      const session = await startCoachClass(academy, item);
      if (!session.id) throw new Error('The class started without a classroom identifier.');
      router.push({
        pathname: '/academy/classroom/[sessionId]',
        params: { batchName: item.batchName || 'Live Class', sessionId: String(session.id) },
      } as Href);
    } catch (caught) {
      setError(meetingStartError(caught, 'Unable to start this class.'));
    } finally {
      setStartingBatchId(null);
    }
  }

  async function startAdhocClass(batch: CoachBatch) {
    if (!academy || startingAdhocBatchId !== null || startingBatchId !== null) return;
    setStartingAdhocBatchId(batch.id);
    setError(null);
    try {
      const session = await startCoachAdhocClass(academy, batch.id);
      if (!session.id) throw new Error('The class started without a classroom identifier.');
      setAdhocOpen(false);
      router.push({
        pathname: '/academy/classroom/[sessionId]',
        params: { batchName: `${batch.name} · Ad Hoc Class`, sessionId: String(session.id) },
      } as Href);
    } catch (caught) {
      setError(meetingStartError(caught, 'Unable to start the ad hoc class.'));
    } finally {
      setStartingAdhocBatchId(null);
    }
  }

  function openMenu(label: string) {
    if (label === 'STUDY LIBRARY') {
      router.push('/academy/studies' as Href);
      return;
    }
    Alert.alert(label, `${label} will use the same coach-scoped academy data as the web portal.`);
  }

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Coach Dashboard" />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadDashboard(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.stateText}>Preparing your command centre...</Text>
            </View>
          ) : (
            <>
              <View style={styles.academyPanel}>
                <RoyalCorners />
                <View style={styles.academySeal}><Text style={styles.academyInitial}>{academy?.academyName.charAt(0).toUpperCase()}</Text></View>
                <View style={styles.academyCopy}>
                  <Text style={styles.eyebrow}>CURRENT ACADEMY</Text>
                  <Text numberOfLines={2} style={styles.academyName}>{academy?.academyName}</Text>
                  <Text style={styles.coachRole}>COACH</Text>
                </View>
                {(academy?.membershipCount ?? 0) > 1 ? (
                  <Pressable onPress={() => router.push('/academy?choose=1' as Href)} style={styles.changeButton}><Text style={styles.changeText}>CHANGE</Text></Pressable>
                ) : null}
              </View>

              {error ? (
                <View style={styles.errorPanel}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable onPress={() => void loadDashboard()} style={styles.retryButton}><Text style={styles.retryText}>RETRY</Text></Pressable>
                </View>
              ) : null}

              <OrnamentDivider />

              <Pressable
                accessibilityLabel="Start an ad hoc class"
                onPress={() => setAdhocOpen(true)}
                style={({ pressed }) => [styles.adhocButton, pressed && styles.pressed]}>
                <View style={styles.adhocIcon}>
                  <SymbolView name={{ android: 'add_circle', ios: 'plus.circle.fill', web: 'add_circle' }} size={27} tintColor={colors.goldLight} />
                </View>
                <View style={styles.adhocCopy}>
                  <Text style={styles.adhocTitle}>START AD HOC CLASS</Text>
                  <Text style={styles.adhocCaption}>Choose an assigned batch and begin immediately.</Text>
                </View>
                <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={21} tintColor={colors.goldLight} />
              </Pressable>

              <View style={styles.nextPanel}>
                <RoyalCorners />
                <View style={styles.nextTopRow}>
                  <View style={styles.iconSeal}><ClassIcon name={{ android: 'cast_for_education', ios: 'person.wave.2.fill', web: 'cast_for_education' }} /></View>
                  <View style={styles.nextCopy}>
                    <Text style={styles.eyebrow}>NEXT ASSIGNED CLASS</Text>
                    <Text numberOfLines={2} style={styles.nextTitle}>{nextClass?.batchName || 'No upcoming class'}</Text>
                    <Text style={styles.nextTime}>{nextClass ? classTime(nextClass) : 'Your assigned schedule is clear.'}</Text>
                  </View>
                </View>

                {nextClass ? (
                  <>
                    <View style={styles.countdownRow}>
                      <View><Text style={styles.countdownLabel}>{nextClass.status === 'LIVE' ? 'CLASS STATUS' : 'STARTS IN'}</Text><Text style={styles.countdown}>{nextClass.status === 'LIVE' ? 'LIVE NOW' : countdown}</Text></View>
                      <View style={[styles.liveBadge, nextClass.status !== 'LIVE' && styles.scheduledBadge]}><Text style={styles.liveBadgeText}>{nextClass.status}</Text></View>
                    </View>
                    <Pressable
                      disabled={!nextClass.startAllowed || startingBatchId !== null}
                      onPress={() => void openClass(nextClass)}
                      style={({ pressed }) => [styles.startButton, (!nextClass.startAllowed || startingBatchId !== null) && styles.startDisabled, pressed && styles.pressed]}>
                      {startingBatchId === nextClass.batchId ? <ActivityIndicator color={colors.cream} size="small" /> : <ClassIcon name={{ android: 'videocam', ios: 'video.fill', web: 'videocam' }} />}
                      <Text style={styles.startText}>{startingBatchId === nextClass.batchId ? 'OPENING...' : nextClass.status === 'LIVE' ? 'CONTINUE CLASS' : nextClass.startAllowed ? 'START CLASS' : 'STARTS 10 MINUTES BEFORE'}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              {classes.length > 1 ? (
                <View style={styles.upcomingSection}>
                  <Text style={styles.sectionTitle}>Upcoming Classes</Text>
                  {classes.slice(1, 5).map((item, index) => (
                    <View key={`${item.batchId}-${item.sessionDate}-${item.startTime}`} style={styles.classRow}>
                      <View style={styles.orderSeal}><Text style={styles.orderText}>{index + 2}</Text></View>
                      <View style={styles.classCopy}><Text numberOfLines={1} style={styles.className}>{item.batchName || `Batch ${item.batchId}`}</Text><Text style={styles.classTime}>{classTime(item)}</Text></View>
                      <Pressable
                        accessibilityLabel={`${item.status === 'LIVE' ? 'Continue' : 'Start'} ${item.batchName || `Batch ${item.batchId}`}`}
                        disabled={!item.startAllowed || startingBatchId !== null}
                        onPress={() => void openClass(item)}
                        style={({ pressed }) => [
                          styles.classAction,
                          (!item.startAllowed || startingBatchId !== null) && styles.classActionDisabled,
                          item.status === 'LIVE' && styles.classActionLive,
                          pressed && styles.pressed,
                        ]}>
                        {startingBatchId === item.batchId ? (
                          <ActivityIndicator color={colors.cream} size="small" />
                        ) : (
                          <Text style={styles.classActionText}>
                            {item.status === 'LIVE' ? 'CONTINUE' : item.startAllowed ? 'START' : 'LOCKED'}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.cardsGrid}>
                {menuCards.map((card) => <RoyalDashboardCard key={card.label} label={card.label} onPress={() => openMenu(card.label)} source={card.source} />)}
              </View>
            </>
          )}
        </ScrollView>

        <Modal animationType="fade" onRequestClose={() => setAdhocOpen(false)} transparent visible={adhocOpen}>
          <View style={styles.modalBackdrop}>
            <View style={styles.adhocModal}>
              <RoyalCorners />
              <View style={styles.modalHeader}>
                <View style={styles.adhocCopy}>
                  <Text style={styles.eyebrow}>IMMEDIATE CLASS</Text>
                  <Text style={styles.modalTitle}>Choose a Batch</Text>
                </View>
                <Pressable accessibilityLabel="Close" disabled={startingAdhocBatchId !== null} onPress={() => setAdhocOpen(false)} style={styles.modalClose}>
                  <SymbolView name={{ android: 'close', ios: 'xmark', web: 'close' }} size={22} tintColor={colors.goldLight} />
                </Pressable>
              </View>
              <Text style={styles.modalCaption}>The meeting starts immediately for the selected assigned batch.</Text>
              <ScrollView contentContainerStyle={styles.batchList} showsVerticalScrollIndicator={false}>
                {batches.length ? batches.map((batch) => (
                  <Pressable
                    accessibilityLabel={`Start ad hoc class for ${batch.name}`}
                    disabled={startingAdhocBatchId !== null}
                    key={batch.id}
                    onPress={() => void startAdhocClass(batch)}
                    style={({ pressed }) => [styles.batchChoice, pressed && styles.pressed, startingAdhocBatchId !== null && styles.batchChoiceDisabled]}>
                    <View style={styles.batchSeal}><Text style={styles.batchInitial}>{batch.name.charAt(0).toUpperCase()}</Text></View>
                    <View style={styles.adhocCopy}>
                      <Text numberOfLines={2} style={styles.batchName}>{batch.name}</Text>
                      <Text numberOfLines={2} style={styles.batchSchedule}>{batchScheduleLabel(batch)}</Text>
                      <Text style={styles.batchMeta}>{batch.courseName || 'Academy batch'} · {batch.activeStudentCount ?? 0} students</Text>
                    </View>
                    {startingAdhocBatchId === batch.id ? <ActivityIndicator color={colors.goldLight} size="small" /> : <Text style={styles.startNowText}>START NOW</Text>}
                  </Pressable>
                )) : (
                  <View style={styles.noBatches}><Text style={styles.stateText}>No active assigned batches are available.</Text></View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  academyCopy: { flex: 1, marginLeft: 13, minWidth: 0 },
  academyInitial: { color: colors.goldLight, fontFamily: 'serif', fontSize: 26, fontWeight: '900' },
  academyName: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 3 },
  academyPanel: { alignItems: 'center', backgroundColor: 'rgba(7, 16, 24, 0.94)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 17, padding: 17 },
  academySeal: { alignItems: 'center', backgroundColor: '#1f1712', borderColor: colors.gold, borderRadius: 29, borderWidth: 1.5, height: 58, justifyContent: 'center', width: 58 },
  adhocButton: { alignItems: 'center', backgroundColor: 'rgba(74, 35, 18, 0.94)', borderColor: colors.goldLight, borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 16, padding: 14 },
  adhocCaption: { color: colors.sandstone, fontSize: 10, marginTop: 3 },
  adhocCopy: { flex: 1, minWidth: 0 },
  adhocIcon: { alignItems: 'center', backgroundColor: 'rgba(9, 18, 25, 0.72)', borderColor: colors.gold, borderRadius: 23, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  adhocModal: { backgroundColor: '#08121c', borderColor: colors.gold, borderRadius: 16, borderWidth: 1, maxHeight: '76%', padding: 18, width: '92%' },
  adhocTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  background: { flex: 1 },
  batchChoice: { alignItems: 'center', backgroundColor: 'rgba(20, 15, 12, 0.92)', borderColor: 'rgba(201, 143, 28, 0.35)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 12 },
  batchChoiceDisabled: { opacity: 0.65 },
  batchInitial: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900' },
  batchList: { gap: 9, paddingTop: 15 },
  batchMeta: { color: colors.muted, fontSize: 9, marginTop: 3 },
  batchName: { color: colors.cream, fontFamily: 'serif', fontSize: 14, fontWeight: '900' },
  batchSchedule: { color: colors.goldLight, fontSize: 10, fontWeight: '700', lineHeight: 14, marginTop: 4 },
  batchSeal: { alignItems: 'center', backgroundColor: '#2b1b10', borderColor: colors.gold, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 20 },
  changeButton: { borderColor: colors.gold, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  changeText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  classCopy: { flex: 1, minWidth: 0 },
  classAction: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 38, minWidth: 72, paddingHorizontal: 9 },
  classActionDisabled: { backgroundColor: 'rgba(89, 73, 56, 0.55)', borderColor: 'rgba(215, 196, 156, 0.3)' },
  classActionLive: { backgroundColor: 'rgba(16, 109, 82, 0.84)', borderColor: colors.success },
  classActionText: { color: colors.cream, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  className: { color: colors.cream, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  classRow: { alignItems: 'center', backgroundColor: 'rgba(7, 16, 24, 0.86)', borderColor: 'rgba(201, 143, 28, 0.28)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 12 },
  classTime: { color: colors.muted, fontSize: 10, marginTop: 3 },
  coachRole: { color: '#bff6de', fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 4 },
  content: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 14 },
  countdown: { color: colors.goldLight, fontFamily: 'monospace', fontSize: 27, fontWeight: '900', marginTop: 4 },
  countdownLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  countdownRow: { alignItems: 'center', borderTopColor: 'rgba(242, 201, 97, 0.18)', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 14 },
  errorPanel: { alignItems: 'center', backgroundColor: 'rgba(91, 18, 27, 0.78)', borderColor: colors.danger, borderRadius: 11, borderWidth: 1, marginTop: 12, padding: 13 },
  errorText: { color: '#fecdd3', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  iconSeal: { alignItems: 'center', backgroundColor: 'rgba(90, 48, 20, 0.65)', borderColor: colors.gold, borderRadius: 27, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  liveBadge: { backgroundColor: 'rgba(16, 109, 82, 0.8)', borderColor: colors.success, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  liveBadgeText: { color: colors.cream, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.78)', flex: 1, justifyContent: 'center' },
  modalCaption: { color: colors.sandstone, fontSize: 11, lineHeight: 16, marginTop: 8 },
  modalClose: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  modalTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900', marginTop: 3 },
  nextCopy: { flex: 1, minWidth: 0 },
  nextPanel: { backgroundColor: 'rgba(8, 15, 21, 0.96)', borderColor: colors.gold, borderRadius: 15, borderWidth: 1, padding: 18 },
  nextTime: { color: colors.sandstone, fontSize: 11, marginTop: 5 },
  nextTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 22, fontWeight: '900', marginTop: 5 },
  nextTopRow: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  noBatches: { alignItems: 'center', minHeight: 100, justifyContent: 'center' },
  orderSeal: { alignItems: 'center', backgroundColor: '#21160e', borderColor: colors.gold, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  orderText: { color: colors.goldLight, fontFamily: 'serif', fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  retryButton: { marginTop: 9, paddingHorizontal: 14, paddingVertical: 6 },
  retryText: { color: colors.goldLight, fontSize: 10, fontWeight: '900' },
  safeArea: { flex: 1 },
  scheduledBadge: { backgroundColor: 'rgba(91, 69, 35, 0.8)', borderColor: colors.gold },
  sectionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 19, fontWeight: '900', marginBottom: 9 },
  startButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.goldLight, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 16, minHeight: 49, paddingHorizontal: 12 },
  startDisabled: { backgroundColor: 'rgba(89, 73, 56, 0.65)', borderColor: 'rgba(215, 196, 156, 0.35)' },
  startText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  startNowText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 320 },
  stateText: { color: colors.sandstone, fontSize: 12, marginTop: 13 },
  upcomingSection: { gap: 8, paddingTop: 20 },
});
