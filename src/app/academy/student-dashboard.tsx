import type { ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { RoyalDashboardCard } from '@/components/royal-dashboard-card';
import { colors } from '@/constants/colors';
import {
  academyOrigin,
  fetchUpcomingClass,
  getSelectedAcademy,
  type SelectedAcademy,
  type UpcomingClass,
} from '@/lib/academy';
import { resolveAcademyUrl } from '@/lib/classroom';

type StudentDashboardCard = {
  label: string;
  source: ImageSource;
};

const studentDashboardCards: StudentDashboardCard[] = [
  {
    label: 'STUDY LIBRARY',
    source: require('@/assets/academy/study-library-card-mobile-v1.jpg'),
  },
  {
    label: 'FEES',
    source: require('@/assets/academy/fees-card-mobile-v1.jpg'),
  },
  {
    label: 'MY ATTENDANCE',
    source: require('@/assets/academy/attendance-card-mobile-v1.jpg'),
  },
  {
    label: 'MY DATABASE',
    source: require('@/assets/academy/database-card-mobile-v1.jpg'),
  },
];

function sessionStart(upcoming?: UpcomingClass | null) {
  if (upcoming?.startAt) {
    const parsed = new Date(upcoming.startAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (upcoming?.sessionDate && upcoming.startTime) {
    const parsed = new Date(`${upcoming.sessionDate}T${upcoming.startTime}`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function formatDate(value: Date | null) {
  if (!value) return 'No upcoming class scheduled';
  return value.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });
}

function formatCountdown(milliseconds: number) {
  if (milliseconds <= 0) return '00:00:00';
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

export default function StudentDashboardScreen() {
  const [academy, setAcademy] = useState<SelectedAcademy | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setAcademy(selected);
      setUpcoming(await fetchUpcomingClass(selected));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the Student Dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadDashboard(), 0);
    return () => clearTimeout(initialLoad);
  }, [loadDashboard]);

  useEffect(() => {
    const initialTick = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, []);

  const start = useMemo(() => sessionStart(upcoming), [upcoming]);
  const countdown = useMemo(() => formatCountdown((start?.getTime() ?? 0) - now), [now, start]);
  const statusCopy = upcoming?.status === 'LIVE'
    ? 'Your class is live now.'
    : upcoming?.status === 'BLOCKED'
      ? 'Class access is blocked. Please contact your academy.'
      : upcoming?.status === 'WAITING'
        ? 'Waiting for your coach to start the class.'
        : 'No class is scheduled right now.';

  function openDashboardCard(label: string) {
    if (label === 'STUDY LIBRARY') {
      router.push('/academy/studies' as Href);
      return;
    }
    if (label === 'FEES') {
      router.push('/academy/fees' as Href);
      return;
    }
    Alert.alert(label, `${label} is the next Student Dashboard experience we will build.`);
  }

  async function openClassroom() {
    if (!academy || !upcoming?.joinAllowed) return;
    if (upcoming.sessionId) {
      router.push({
        pathname: '/academy/classroom/[sessionId]',
        params: {
          batchName: upcoming.batchName || 'Live Class',
          sessionId: String(upcoming.sessionId),
        },
      } as Href);
      return;
    }
    if (upcoming.joinUrl) {
      await WebBrowser.openBrowserAsync(
        resolveAcademyUrl(academyOrigin(academy.host), upcoming.joinUrl),
        { createTask: false },
      );
      return;
    }
    Alert.alert('Class unavailable', 'The academy has not provided a classroom link yet.');
  }

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Student Dashboard" />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadDashboard(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.stateText}>Preparing your academy dashboard...</Text>
            </View>
          ) : (
            <>
              <View style={styles.academyPanel}>
                <RoyalCorners />
                <View style={styles.academySeal}>
                  <Text style={styles.academyInitial}>{academy?.academyName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.academyCopy}>
                  <Text style={styles.eyebrow}>CURRENT ACADEMY</Text>
                  <Text numberOfLines={2} style={styles.academyName}>{academy?.academyName}</Text>
                  <Text style={styles.studentRole}>STUDENT</Text>
                </View>
                {(academy?.membershipCount ?? 0) > 1 ? (
                  <Pressable onPress={() => router.push('/academy?choose=1' as Href)} style={styles.changeButton}>
                    <Text style={styles.changeText}>CHANGE</Text>
                  </Pressable>
                ) : null}
              </View>

              {error ? (
                <View style={styles.errorPanel}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable onPress={() => void loadDashboard()} style={styles.retryButton}>
                    <Text style={styles.retryText}>RETRY</Text>
                  </Pressable>
                </View>
              ) : null}

              <OrnamentDivider />

              <View style={styles.classPanel}>
                <RoyalCorners />
                <View style={styles.classHeadingRow}>
                  <View style={styles.classHeadingCopy}>
                    <Text style={styles.eyebrow}>UPCOMING CLASS</Text>
                    <Text style={styles.className}>{upcoming?.batchName || 'No upcoming class'}</Text>
                    <Text style={styles.classDate}>{formatDate(start)}</Text>
                  </View>
                  <View style={styles.countdownPanel}>
                    <Text style={styles.countdownLabel}>STARTS IN</Text>
                    <Text style={styles.countdown}>{start ? countdown : '--:--:--'}</Text>
                  </View>
                </View>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, upcoming?.status === 'LIVE' && styles.statusLive, upcoming?.status === 'BLOCKED' && styles.statusBlocked]} />
                  <Text style={styles.statusText}>{statusCopy}</Text>
                </View>
                <Pressable
                  disabled={!upcoming?.joinAllowed}
                  onPress={() => void openClassroom()}
                  style={({ pressed }) => [styles.joinButton, !upcoming?.joinAllowed && styles.joinDisabled, pressed && styles.pressed]}>
                  <Text style={styles.joinText}>{upcoming?.status === 'LIVE' ? 'JOIN CLASS' : upcoming?.status === 'BLOCKED' ? 'JOIN BLOCKED' : 'WAITING FOR COACH'}</Text>
                </Pressable>
              </View>

              <View style={styles.cardsGrid}>
                {studentDashboardCards.map((card) => (
                  <RoyalDashboardCard
                    key={card.label}
                    label={card.label}
                    onPress={() => openDashboardCard(card.label)}
                    source={card.source}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
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
  background: { flex: 1 },
  changeButton: { borderColor: colors.gold, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  changeText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 19 },
  classDate: { color: colors.muted, fontSize: 11, marginTop: 5 },
  classHeadingCopy: { flex: 1, minWidth: 0 },
  classHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  className: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 5 },
  classPanel: { backgroundColor: 'rgba(8, 15, 21, 0.94)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, padding: 18 },
  content: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 14 },
  countdown: { color: colors.goldLight, fontSize: 20, fontWeight: '900', marginTop: 5 },
  countdownLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  countdownPanel: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderColor: 'rgba(242, 201, 97, 0.22)', borderRadius: 10, borderWidth: 1, minWidth: 101, paddingHorizontal: 9, paddingVertical: 10 },
  errorPanel: { alignItems: 'center', backgroundColor: 'rgba(91, 18, 27, 0.78)', borderColor: colors.danger, borderRadius: 11, borderWidth: 1, marginTop: 12, padding: 13 },
  errorText: { color: '#fecdd3', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  joinButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 16, paddingVertical: 12 },
  joinDisabled: { backgroundColor: 'rgba(89, 73, 56, 0.65)', borderColor: 'rgba(215, 196, 156, 0.35)' },
  joinText: { color: colors.cream, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  retryButton: { marginTop: 9, paddingHorizontal: 14, paddingVertical: 6 },
  retryText: { color: colors.goldLight, fontSize: 10, fontWeight: '900' },
  safeArea: { flex: 1 },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 320 },
  stateText: { color: colors.sandstone, fontSize: 12, marginTop: 13 },
  statusBlocked: { backgroundColor: colors.danger },
  statusDot: { backgroundColor: colors.gold, borderRadius: 5, height: 9, width: 9 },
  statusLive: { backgroundColor: colors.success },
  statusRow: { alignItems: 'center', borderTopColor: 'rgba(255, 255, 255, 0.08)', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 15, paddingTop: 13 },
  statusText: { color: colors.sandstone, flex: 1, fontSize: 11, lineHeight: 16 },
  studentRole: { color: '#a7f3d0', fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 4 },
});
