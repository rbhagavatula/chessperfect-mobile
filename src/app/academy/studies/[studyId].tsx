import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { StudentStudyBlockPlayer, type StudentStudyLiveState } from '@/components/student-study-block';
import { colors } from '@/constants/colors';
import {
  fetchStudentStudyDetail,
  getAcademyStudyContext,
  markStudentStudyCompleted,
  updateStudentStudyProgress,
  type AcademyStudyContext,
  type StudentStudyDetail,
} from '@/lib/academy-study';
import {
  classroomErrorMessage,
  fetchClassroomStudyAssignment,
  getClassroomContext,
  joinClassroom,
  sendClassroomHeartbeat,
  submitClassroomStudySnapshot,
  type ClassroomContext,
  type ClassroomStudyAssignment,
} from '@/lib/classroom';

function flatten(detail: StudentStudyDetail | null) {
  return (detail?.lessons ?? []).flatMap((lesson, lessonIndex) => lesson.blocks.map((block, blockIndex) => ({ block, blockIndex, lesson, lessonIndex })));
}

export default function StudentStudyPlayerScreen() {
  const params = useLocalSearchParams<{ lessonId?: string; liveSessionId?: string; studyId?: string; studyVersionId?: string }>();
  const studyId = Number(params.studyId);
  const studyVersionId = Number(params.studyVersionId);
  const requestedLessonId = Number(params.lessonId);
  const liveSessionId = Number(params.liveSessionId);
  const liveClassMode = Number.isFinite(liveSessionId) && liveSessionId > 0;
  const [context, setContext] = useState<AcademyStudyContext | null>(null);
  const [classroomContext, setClassroomContext] = useState<ClassroomContext | null>(null);
  const [liveAssignment, setLiveAssignment] = useState<ClassroomStudyAssignment | null>(null);
  const [detail, setDetail] = useState<StudentStudyDetail | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [blockComplete, setBlockComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSnapshotRef = useRef('');
  const autoAdvancedBlockRef = useRef<number | null>(null);

  const blocks = useMemo(() => flatten(detail), [detail]);
  const current = blocks[currentIndex] ?? null;
  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);
  const progress = blocks.length ? Math.round((completedIds.filter((id) => blocks.some((item) => item.block.id === id)).length / blocks.length) * 100) : 0;

  const loadStudy = useCallback(async () => {
    if (!Number.isFinite(studyId) || studyId <= 0) {
      setError('Study not found.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextContext = await getAcademyStudyContext();
      let nextAssignment: ClassroomStudyAssignment | null = null;
      let nextClassroomContext: ClassroomContext | null = null;
      if (liveClassMode) {
        nextClassroomContext = await getClassroomContext();
        await joinClassroom(nextClassroomContext, liveSessionId);
        nextAssignment = await fetchClassroomStudyAssignment(nextClassroomContext, liveSessionId);
        if (!nextAssignment || nextAssignment.studyId !== studyId) {
          throw new Error('This study is not assigned in the current live class.');
        }
      }
      const nextDetail = await fetchStudentStudyDetail(nextContext, studyId, Number.isFinite(studyVersionId) ? studyVersionId : undefined);
      const flattened = flatten(nextDetail);
      const assignedLessonId = nextAssignment?.lessonId ?? (Number.isFinite(requestedLessonId) ? requestedLessonId : null);
      const assignedLessonIndex = assignedLessonId
        ? flattened.findIndex((item) => item.lesson.id === assignedLessonId)
        : -1;
      const resumeIndex = flattened.findIndex((item) => item.lesson.id === nextDetail.resumeLessonId && item.block.id === nextDetail.resumeBlockId);
      const firstIncomplete = flattened.findIndex((item) => !(nextDetail.completedBlockIds ?? []).includes(item.block.id));
      setContext(nextContext);
      setClassroomContext(nextClassroomContext);
      setLiveAssignment(nextAssignment);
      setDetail(nextDetail);
      setCompletedIds(nextDetail.completedBlockIds ?? []);
      setBlockComplete(false);
      setCurrentIndex(assignedLessonIndex >= 0 ? assignedLessonIndex : resumeIndex >= 0 ? resumeIndex : firstIncomplete >= 0 ? firstIncomplete : 0);
      lastSnapshotRef.current = '';
    } catch (caught) {
      setError(liveClassMode ? classroomErrorMessage(caught) : caught instanceof Error ? caught.message : 'Unable to open this study.');
    } finally {
      setLoading(false);
    }
  }, [liveClassMode, liveSessionId, requestedLessonId, studyId, studyVersionId]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadStudy(), 0);
    return () => clearTimeout(initialLoad);
  }, [loadStudy]);

  const publishLiveSnapshot = useCallback((state?: StudentStudyLiveState) => {
    if (!liveClassMode || !classroomContext || !detail || !current || !liveAssignment) return;
    const body = {
      attemptCount: state?.attemptCount ?? 0,
      blockId: current.block.id,
      blockTitle: current.block.title,
      blockType: current.block.type,
      currentFen: state?.currentFen ?? current.block.interactiveConfig?.startFen ?? null,
      lastMove: state?.lastMove ?? null,
      lessonId: current.lesson.id,
      lessonTitle: current.lesson.title,
      solutionUsed: Boolean(state?.solutionUsed),
      state: state?.state ?? (blockComplete ? 'SOLVED' : 'IN_PROGRESS'),
      studyId: detail.study.id,
      studyTitle: detail.study.title,
      studyVersionId: detail.study.studyVersionId,
    } as const;
    const key = JSON.stringify(body);
    if (key === lastSnapshotRef.current) return;
    lastSnapshotRef.current = key;
    void submitClassroomStudySnapshot(classroomContext, liveSessionId, body).catch(() => {
      lastSnapshotRef.current = '';
    });
  }, [blockComplete, classroomContext, current, detail, liveAssignment, liveClassMode, liveSessionId]);

  useEffect(() => {
    publishLiveSnapshot();
  }, [publishLiveSnapshot]);

  useEffect(() => {
    if (!liveClassMode || !classroomContext) return;
    const heartbeat = () => void sendClassroomHeartbeat(classroomContext, liveSessionId, AppState.currentState === 'active', AppState.currentState === 'active').catch(() => undefined);
    const timer = setInterval(heartbeat, 15_000);
    const subscription = AppState.addEventListener('change', heartbeat);
    heartbeat();
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [classroomContext, liveClassMode, liveSessionId]);

  const saveProgress = useCallback(async (markCompleted: boolean, targetIndex?: number) => {
    if (!context || !detail || !current) return;
    await updateStudentStudyProgress(context, detail.study.id, current.lesson.id, current.block.id, markCompleted, detail.study.studyVersionId);
    if (markCompleted && !completedSet.has(current.block.id)) setCompletedIds((ids) => [...ids, current.block.id]);
    const target = typeof targetIndex === 'number' ? blocks[targetIndex] : null;
    if (target) await updateStudentStudyProgress(context, detail.study.id, target.lesson.id, target.block.id, false, detail.study.studyVersionId);
  }, [blocks, completedSet, context, current, detail]);

  const moveTo = useCallback(async (nextIndex: number, completeCurrent: boolean) => {
    if (saving || !blocks[nextIndex]) return;
    setSaving(true);
    setError(null);
    try {
      await saveProgress(completeCurrent, nextIndex);
      setBlockComplete(false);
      setCurrentIndex(nextIndex);
      autoAdvancedBlockRef.current = null;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save your progress.');
    } finally {
      setSaving(false);
    }
  }, [blocks, saveProgress, saving]);

  useEffect(() => {
    if (!liveClassMode || !liveAssignment?.autoAdvance || !blockComplete || !current || saving) return;
    if (autoAdvancedBlockRef.current === current.block.id) return;
    autoAdvancedBlockRef.current = current.block.id;
    const timer = setTimeout(() => {
      if (currentIndex < blocks.length - 1) void moveTo(currentIndex + 1, true);
    }, 650);
    return () => clearTimeout(timer);
  }, [blockComplete, blocks.length, current, currentIndex, liveAssignment?.autoAdvance, liveClassMode, moveTo, saving]);

  async function finishStudy() {
    if (!context || !detail || !current || saving || !blockComplete) return;
    setSaving(true);
    setError(null);
    try {
      await saveProgress(true);
      const completedAfterSave = new Set([...completedIds, current.block.id]);
      const incompleteIndex = blocks.findIndex((item) => !completedAfterSave.has(item.block.id));
      if (incompleteIndex >= 0) {
        setBlockComplete(false);
        setCurrentIndex(incompleteIndex);
        setError('Complete every remaining block before finishing the study.');
        return;
      }
      await markStudentStudyCompleted(context, detail.study.id, current.lesson.id, current.block.id, detail.study.studyVersionId);
      Alert.alert('Study Complete', 'All lesson blocks are complete. Your assessment is now ready.', [
        { onPress: () => router.back(), text: 'Back to Library' },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to complete this study.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title={detail?.study.title || 'Study'} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}><ActivityIndicator color={colors.goldLight} size="large" /><Text style={styles.stateTitle}>Preparing your lesson...</Text></View>
          ) : error && !detail ? (
            <View style={styles.statePanel}>
              <SymbolView name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }} size={42} tintColor={colors.danger} />
              <Text style={styles.stateTitle}>Unable to open the study</Text><Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={() => void loadStudy()} style={styles.retryButton}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable>
            </View>
          ) : detail && context && current ? (
            <>
              {liveClassMode ? (
                <View style={styles.liveModePanel}>
                  <Text style={styles.liveModeTitle}>LIVE CLASS MODE</Text>
                  <Text style={styles.liveModeCopy}>Your coach can follow your progress but cannot control your board. Hints and solutions are disabled.</Text>
                </View>
              ) : null}
              <View style={styles.lessonHeading}>
                <Text numberOfLines={2} style={styles.lessonTitle}>{current.lesson.title}</Text>
                <Text accessibilityLabel={`${progress} percent complete`} style={styles.progressValue}>{progress}%</Text>
                <Text style={styles.stepText}>Block {currentIndex + 1} of {blocks.length} · {current.lesson.title}</Text>
              </View>

              {error ? <View style={styles.inlineError}><Text style={styles.inlineErrorText}>{error}</Text></View> : null}

              <StudentStudyBlockPlayer
                assistanceDisabled={liveClassMode}
                block={current.block}
                context={context}
                key={current.block.id}
                onCompletionChange={setBlockComplete}
                onLiveStateChange={publishLiveSnapshot}
              />

              <View style={styles.navigationRow}>
                <Pressable disabled={currentIndex === 0 || saving} onPress={() => void moveTo(currentIndex - 1, false)} style={[styles.navButton, (currentIndex === 0 || saving) && styles.navDisabled]}>
                  <SymbolView name={{ android: 'arrow_back', ios: 'arrow.left', web: 'arrow_back' }} size={18} tintColor={colors.goldLight} /><Text style={styles.navText}>PREVIOUS</Text>
                </Pressable>
                {currentIndex < blocks.length - 1 ? (
                  <Pressable disabled={!blockComplete || saving} onPress={() => void moveTo(currentIndex + 1, true)} style={[styles.navButton, styles.navPrimary, (!blockComplete || saving) && styles.navDisabled]}>
                    {saving ? <ActivityIndicator color={colors.cream} size="small" /> : null}<Text style={styles.navText}>NEXT</Text><SymbolView name={{ android: 'arrow_forward', ios: 'arrow.right', web: 'arrow_forward' }} size={18} tintColor={colors.goldLight} />
                  </Pressable>
                ) : (
                  <Pressable disabled={!blockComplete || saving} onPress={() => void finishStudy()} style={[styles.navButton, styles.finishButton, (!blockComplete || saving) && styles.navDisabled]}>
                    {saving ? <ActivityIndicator color={colors.cream} size="small" /> : null}<Text style={styles.navText}>FINISH STUDY</Text>
                  </Pressable>
                )}
              </View>
              {!blockComplete ? <Text style={styles.completionHint}>Complete the current activity to continue.</Text> : null}
            </>
          ) : (
            <View style={styles.statePanel}><Text style={styles.stateTitle}>No published lesson blocks</Text><Text style={styles.stateText}>This study does not currently contain learner-ready content.</Text></View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 }, safeArea: { flex: 1 }, content: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 14 },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 360, padding: 24 },
  stateTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginTop: 13, textAlign: 'center' },
  stateText: { color: colors.sandstone, fontSize: 11, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  retryButton: { backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 17, paddingHorizontal: 22, paddingVertical: 11 }, retryText: { color: colors.cream, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  lessonHeading: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 12, marginTop: 15, paddingHorizontal: 3 },
  liveModePanel: { backgroundColor: 'rgba(14, 92, 130, 0.2)', borderColor: 'rgba(125, 211, 252, 0.55)', borderRadius: 10, borderWidth: 1, marginTop: 13, padding: 11 },
  liveModeTitle: { color: '#bae6fd', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  liveModeCopy: { color: '#d5effc', fontSize: 10, lineHeight: 15, marginTop: 3 },
  progressValue: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900' },
  stepText: { display: 'none' },
  inlineError: { backgroundColor: 'rgba(91,18,27,0.75)', borderColor: colors.danger, borderRadius: 9, borderWidth: 1, marginBottom: 11, padding: 10 }, inlineErrorText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  lessonTitle: { color: colors.goldLight, flex: 1, fontFamily: 'serif', fontSize: 20, fontWeight: '900', lineHeight: 25 },
  navigationRow: { flexDirection: 'row', gap: 10, marginTop: 15 }, navButton: { alignItems: 'center', backgroundColor: 'rgba(8,15,21,0.95)', borderColor: colors.gold, borderRadius: 10, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 48, paddingHorizontal: 10 }, navPrimary: { backgroundColor: colors.terracotta }, finishButton: { backgroundColor: '#176b51', borderColor: '#74cfa8' }, navDisabled: { opacity: 0.4 }, navText: { color: colors.cream, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, completionHint: { color: colors.muted, fontSize: 9, marginTop: 8, textAlign: 'right' },
});
