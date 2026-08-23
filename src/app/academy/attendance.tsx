import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  applyForLeave,
  fetchMyAttendance,
  fetchMyLeaveRequests,
  getSelectedAcademy,
  type SelectedAcademy,
  type StudentAttendanceReport,
  type StudentLeaveRequest,
} from '@/lib/academy';

function localIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function validIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function leaveStatusTone(status: StudentLeaveRequest['status']) {
  if (status === 'APPROVED') return colors.success;
  if (status === 'REJECTED' || status === 'CANCELLED') return colors.danger;
  return colors.goldLight;
}

export default function MyAttendanceScreen() {
  const today = useMemo(() => new Date(), []);
  const initialFrom = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 30);
    return localIso(date);
  }, [today]);
  const todayIso = useMemo(() => localIso(today), [today]);
  const [academy, setAcademy] = useState<SelectedAcademy | null>(null);
  const [report, setReport] = useState<StudentAttendanceReport | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<StudentLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const selected = await getSelectedAcademy();
      if (!selected || selected.role !== 'STUDENT') {
        router.replace('/academy');
        return;
      }
      setAcademy(selected);
      const [nextReport, nextLeaveRequests] = await Promise.all([
        fetchMyAttendance(selected, initialFrom, todayIso),
        fetchMyLeaveRequests(selected),
      ]);
      setReport(nextReport);
      setLeaveRequests(nextLeaveRequests);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load your attendance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialFrom, todayIso]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void load(), 0);
    return () => clearTimeout(initialLoad);
  }, [load]);

  const attendance = report?.students[0] ?? null;

  async function submitLeave() {
    if (!academy || submitting) return;
    if (!validIsoDate(fromDate) || !validIsoDate(toDate)) {
      Alert.alert('Check the dates', 'Enter dates in YYYY-MM-DD format.');
      return;
    }
    if (toDate < fromDate) {
      Alert.alert('Check the dates', 'The end date cannot be before the start date.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Tell your academy why you need leave.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await applyForLeave(academy, {
        fromDate,
        reason: reason.trim(),
        toDate,
      });
      setLeaveRequests((current) => [created, ...current]);
      setReason('');
      setLeaveOpen(false);
      Alert.alert('Leave request sent', 'Your academy has received your request.');
    } catch (caught) {
      Alert.alert('Could not apply for leave', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader
          rightAction={{
            accessibilityLabel: 'Apply for leave',
            icon: { android: 'event_available', ios: 'calendar.badge.plus', web: 'event_available' },
            onPress: () => setLeaveOpen(true),
          }}
          title="My Attendance"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void load(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.mutedText}>Loading your class record...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()} style={styles.retryButton}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={styles.summaryPanel}>
                <RoyalCorners />
                <Text style={styles.eyebrow}>LAST 30 DAYS</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.percentRing}>
                    <Text style={styles.percent}>{attendance?.attendancePercent ?? 0}%</Text>
                    <Text style={styles.percentLabel}>ATTENDANCE</Text>
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.studentName}>{attendance?.studentName ?? 'Student'}</Text>
                    <Text style={styles.batchName}>{attendance?.batchName ?? academy?.academyName}</Text>
                    <View style={styles.countRow}>
                      <View><Text style={[styles.count, { color: colors.success }]}>{attendance?.presentCount ?? 0}</Text><Text style={styles.countLabel}>PRESENT</Text></View>
                      <View><Text style={[styles.count, { color: colors.danger }]}>{attendance?.absentCount ?? 0}</Text><Text style={styles.countLabel}>ABSENT</Text></View>
                      <View><Text style={styles.count}>{attendance?.sessionsHeld ?? 0}</Text><Text style={styles.countLabel}>CLASSES</Text></View>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => setLeaveOpen(true)} style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}>
                  <SymbolView name={{ android: 'event_available', ios: 'calendar.badge.plus', web: 'event_available' }} size={19} tintColor={colors.cream} />
                  <Text style={styles.leaveButtonText}>APPLY FOR LEAVE</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>CLASS HISTORY</Text>
              {attendance?.sessions.length ? attendance.sessions.map((session) => (
                <View key={session.sessionId} style={styles.sessionCard}>
                  <View style={[styles.statusBar, { backgroundColor: session.present ? colors.success : colors.danger }]} />
                  <View style={styles.sessionCopy}>
                    <Text style={styles.sessionDate}>{displayDate(session.sessionDate)}</Text>
                    <Text style={styles.sessionTime}>{session.startTime?.slice(0, 5) ?? '--:--'} – {session.endTime?.slice(0, 5) ?? '--:--'}</Text>
                  </View>
                  <Text style={[styles.sessionStatus, { color: session.present ? colors.success : colors.danger }]}>{session.present ? 'PRESENT' : 'ABSENT'}</Text>
                </View>
              )) : <Text style={styles.emptyText}>No classes were held in this period.</Text>}

              <Text style={styles.sectionTitle}>LEAVE REQUESTS</Text>
              {leaveRequests.length ? leaveRequests.map((leave) => (
                <View key={leave.id} style={styles.leaveCard}>
                  <View style={styles.leaveHeading}>
                    <Text style={styles.leaveDates}>{displayDate(leave.fromDate)}{leave.toDate === leave.fromDate ? '' : ` – ${displayDate(leave.toDate)}`}</Text>
                    <Text style={[styles.leaveStatus, { color: leaveStatusTone(leave.status) }]}>{leave.status}</Text>
                  </View>
                  <Text style={styles.leaveReason}>{leave.reason}</Text>
                  {leave.reviewNote ? <Text style={styles.reviewNote}>Academy: {leave.reviewNote}</Text> : null}
                </View>
              )) : <Text style={styles.emptyText}>You have not applied for leave yet.</Text>}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal animationType="slide" onRequestClose={() => setLeaveOpen(false)} transparent visible={leaveOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <View><Text style={styles.eyebrow}>STUDENT REQUEST</Text><Text style={styles.modalTitle}>Apply for Leave</Text></View>
              <Pressable accessibilityLabel="Close" onPress={() => setLeaveOpen(false)} style={styles.closeButton}><Text style={styles.closeText}>✕</Text></Pressable>
            </View>
            <Text style={styles.fieldLabel}>FROM DATE · YYYY-MM-DD</Text>
            <TextInput autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={setFromDate} placeholder="2026-08-22" placeholderTextColor="#746c5f" style={styles.input} value={fromDate} />
            <Text style={styles.fieldLabel}>TO DATE · YYYY-MM-DD</Text>
            <TextInput autoCapitalize="none" keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={setToDate} placeholder="2026-08-22" placeholderTextColor="#746c5f" style={styles.input} value={toDate} />
            <Text style={styles.fieldLabel}>REASON</Text>
            <TextInput maxLength={1000} multiline onChangeText={setReason} placeholder="Tell your academy why you will be away" placeholderTextColor="#746c5f" style={[styles.input, styles.reasonInput]} textAlignVertical="top" value={reason} />
            <Pressable disabled={submitting} onPress={() => void submitLeave()} style={({ pressed }) => [styles.submitButton, submitting && styles.disabled, pressed && styles.pressed]}>
              {submitting ? <ActivityIndicator color={colors.cream} size="small" /> : <Text style={styles.submitText}>SEND LEAVE REQUEST</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 14, paddingBottom: 36 },
  loadingPanel: { alignItems: 'center', minHeight: 360, justifyContent: 'center' },
  mutedText: { color: colors.muted, fontSize: 12, marginTop: 12 },
  errorPanel: { alignItems: 'center', backgroundColor: 'rgba(91,18,27,0.75)', borderColor: colors.danger, borderRadius: 12, borderWidth: 1, padding: 20 },
  errorText: { color: '#fecdd3', lineHeight: 19, textAlign: 'center' },
  retryButton: { marginTop: 12, padding: 8 },
  retryText: { color: colors.goldLight, fontSize: 11, fontWeight: '900' },
  summaryPanel: { backgroundColor: 'rgba(7,16,24,0.95)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, padding: 18 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  summaryRow: { alignItems: 'center', flexDirection: 'row', marginTop: 13 },
  percentRing: { alignItems: 'center', borderColor: colors.goldLight, borderRadius: 50, borderWidth: 3, height: 100, justifyContent: 'center', width: 100 },
  percent: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900' },
  percentLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', marginTop: 2 },
  summaryCopy: { flex: 1, marginLeft: 17 },
  studentName: { color: colors.cream, fontFamily: 'serif', fontSize: 19, fontWeight: '900' },
  batchName: { color: colors.sandstone, fontSize: 11, marginTop: 3 },
  countRow: { flexDirection: 'row', gap: 17, marginTop: 15 },
  count: { color: colors.goldLight, fontSize: 18, fontWeight: '900' },
  countLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', marginTop: 2 },
  leaveButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 18, paddingVertical: 12 },
  leaveButtonText: { color: colors.cream, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 15, fontWeight: '900', letterSpacing: 0.5, marginBottom: 9, marginTop: 22 },
  sessionCard: { alignItems: 'center', backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', marginBottom: 8, minHeight: 66, overflow: 'hidden', paddingRight: 13 },
  statusBar: { alignSelf: 'stretch', width: 4 },
  sessionCopy: { flex: 1, paddingHorizontal: 13 },
  sessionDate: { color: colors.cream, fontSize: 13, fontWeight: '800' },
  sessionTime: { color: colors.muted, fontSize: 10, marginTop: 4 },
  sessionStatus: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  emptyText: { backgroundColor: 'rgba(9,21,34,0.72)', borderRadius: 10, color: colors.muted, fontSize: 11, padding: 16, textAlign: 'center' },
  leaveCard: { backgroundColor: 'rgba(9,21,34,0.92)', borderColor: 'rgba(201,143,28,0.25)', borderRadius: 11, borderWidth: 1, marginBottom: 8, padding: 13 },
  leaveHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  leaveDates: { color: colors.cream, flex: 1, fontSize: 12, fontWeight: '800' },
  leaveStatus: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginLeft: 8 },
  leaveReason: { color: colors.sandstone, fontSize: 11, lineHeight: 17, marginTop: 7 },
  reviewNote: { borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, color: colors.muted, fontSize: 10, marginTop: 8, paddingTop: 8 },
  modalBackdrop: { backgroundColor: 'rgba(0,0,0,0.78)', flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#08131f', borderColor: colors.border, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 30 },
  modalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900', marginTop: 4 },
  closeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  closeText: { color: colors.goldLight, fontSize: 20 },
  fieldLabel: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#050c13', borderColor: 'rgba(201,143,28,0.4)', borderRadius: 9, borderWidth: 1, color: colors.cream, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11 },
  reasonInput: { minHeight: 96 },
  submitButton: { alignItems: 'center', backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, justifyContent: 'center', marginTop: 20, minHeight: 47 },
  submitText: { color: colors.cream, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75 },
});
