import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  academyAssetSource,
  fetchAcademyStudyOverview,
  getAcademyStudyContext,
  type AcademyStudyContext,
  type StudentLearnOverview,
  type StudentStudySummary,
  type StudyProgressStatus,
} from '@/lib/academy-study';

type Filter = 'ALL' | StudyProgressStatus;

const filters: { label: string; value: Filter }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'OPEN', value: 'OPEN' },
  { label: 'ASSESSMENT', value: 'READY_FOR_ASSESSMENT' },
  { label: 'COMPLETED', value: 'COMPLETED' },
];

function statusLabel(status: StudyProgressStatus) {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'READY_FOR_ASSESSMENT') return 'ASSESSMENT READY';
  return 'OPEN';
}

function StudyCard({ context, study }: { context: AcademyStudyContext; study: StudentStudySummary }) {
  const imageSource = academyAssetSource(context, study.photoKey);
  const coachMode = context.academy.role === 'COACH';

  function openStudy() {
    const version = study.studyVersionId ? `?studyVersionId=${study.studyVersionId}` : '';
    router.push(`/academy/studies/${study.id}${version}` as Href);
  }

  return (
    <Pressable accessibilityLabel={`Open ${study.title}`} accessibilityRole="button" onPress={openStudy} style={({ pressed }) => [styles.studyCard, pressed && styles.pressed]}>
      <View style={styles.coverWrap}>
        {imageSource ? (
          <Image contentFit="cover" source={imageSource} style={StyleSheet.absoluteFill} transition={180} />
        ) : (
          <LinearGradient colors={['#8a6031', '#362116', '#10151a']} style={StyleSheet.absoluteFill}>
            <View style={styles.fallbackCover}>
              <SymbolView name={{ android: 'menu_book', ios: 'books.vertical.fill', web: 'menu_book' }} size={43} tintColor={colors.goldLight} />
              <Text numberOfLines={2} style={styles.fallbackTitle}>{study.title}</Text>
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(7, 8, 10, 0.92)']} style={StyleSheet.absoluteFill} />
        <View style={[styles.statusPill, study.progressStatus === 'COMPLETED' && styles.statusCompleted, study.progressStatus === 'READY_FOR_ASSESSMENT' && styles.statusAssessment]}>
          <Text style={styles.statusPillText}>{coachMode ? 'PUBLISHED' : statusLabel(study.progressStatus)}</Text>
        </View>
      </View>

      <View style={styles.studyCopy}>
        <Text numberOfLines={2} style={styles.studyTitle}>{study.title}</Text>
        <Text numberOfLines={2} style={styles.studyDescription}>{study.description || 'Open this study to begin learning.'}</Text>
        <View style={styles.studyFooter}>
          <View style={styles.sourceRow}>
            <SymbolView name={{ android: 'account_tree', ios: 'rectangle.3.group.fill', web: 'account_tree' }} size={15} tintColor={colors.gold} />
            <Text numberOfLines={1} style={styles.sourceText}>{study.sourceType === 'SERIES' ? study.sourceTitle || 'Series' : 'Direct study'}</Text>
          </View>
          <View style={styles.openRow}>
            <Text style={styles.openText}>{coachMode ? 'LEARN' : study.progressStatus === 'OPEN' ? 'CONTINUE' : 'OPEN'}</Text>
            <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={17} tintColor={colors.goldLight} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function StudyLibraryScreen() {
  const [context, setContext] = useState<AcademyStudyContext | null>(null);
  const [overview, setOverview] = useState<StudentLearnOverview | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const nextContext = await getAcademyStudyContext();
      const nextOverview = await fetchAcademyStudyOverview(nextContext);
      setContext(nextContext);
      setOverview(nextOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load your Study Library.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadLibrary();
  }, [loadLibrary]));

  const studies = useMemo(() => {
    const all = overview?.studies ?? [];
    if (context?.academy.role === 'COACH') return all;
    return filter === 'ALL' ? all : all.filter((study) => study.progressStatus === filter);
  }, [context?.academy.role, filter, overview]);

  const coachMode = context?.academy.role === 'COACH';

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title="Study Library" />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadLibrary(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.stateTitle}>Opening the library...</Text>
            </View>
          ) : error && !overview ? (
            <View style={styles.statePanel}>
              <SymbolView name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }} size={42} tintColor={colors.danger} />
              <Text style={styles.stateTitle}>The library is unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={() => void loadLibrary()} style={styles.retryButton}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable>
            </View>
          ) : context && overview ? (
            <>
              <View style={styles.coursePanel}>
                <RoyalCorners />
                <View style={styles.courseSeal}>
                  <SymbolView name={{ android: 'school', ios: 'graduationcap.fill', web: 'school' }} size={27} tintColor={colors.goldLight} />
                </View>
                <View style={styles.courseCopy}>
                  <Text style={styles.eyebrow}>{context.academy.academyName.toUpperCase()}</Text>
                  <Text numberOfLines={1} style={styles.courseTitle}>{overview.courseTitle || 'Current Course'}</Text>
                  <Text numberOfLines={1} style={styles.batchName}>{overview.batchName || 'Current Batch'}</Text>
                </View>
                <View style={styles.countSeal}><Text style={styles.countValue}>{overview.studies.length}</Text><Text style={styles.countLabel}>STUDIES</Text></View>
              </View>

              {error ? <View style={styles.inlineError}><Text style={styles.inlineErrorText}>{error}</Text></View> : null}

              {!coachMode ? (
                <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
                  {filters.map((item) => (
                    <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterActive]}>
                      <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : <View style={styles.coachLibrarySpacer} />}

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{coachMode ? 'Published Studies' : 'Assigned Studies'}</Text>
                <Text style={styles.sectionCount}>{studies.length} {studies.length === 1 ? 'study' : 'studies'}</Text>
              </View>

              {studies.length ? (
                <View style={styles.studyGrid}>{studies.map((study) => <StudyCard context={context} key={`${study.id}-${study.studyVersionId ?? 0}`} study={study} />)}</View>
              ) : (
                <View style={styles.emptyPanel}>
                  <SymbolView name={{ android: 'menu_book', ios: 'books.vertical.fill', web: 'menu_book' }} size={39} tintColor={colors.goldLight} />
                  <Text style={styles.emptyTitle}>{overview.studies.length ? 'No studies in this section' : coachMode ? 'No published studies yet' : 'No studies assigned yet'}</Text>
                  <Text style={styles.emptyText}>{overview.studies.length ? 'Choose another filter to view your studies.' : coachMode ? 'Studies will appear here after an academy owner or administrator publishes them.' : 'Published studies from your active course curriculum will appear here.'}</Text>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 14 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 360, padding: 25 },
  stateTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  stateText: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: 'center' },
  retryButton: { backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 18, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: colors.cream, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  coursePanel: { alignItems: 'center', backgroundColor: 'rgba(7, 16, 24, 0.94)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 17, padding: 15 },
  courseSeal: { alignItems: 'center', backgroundColor: '#241911', borderColor: colors.gold, borderRadius: 25, borderWidth: 1.5, height: 50, justifyContent: 'center', width: 50 },
  courseCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  courseTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 18, fontWeight: '900', marginTop: 3 },
  batchName: { color: colors.sandstone, fontSize: 10, marginTop: 3 },
  countSeal: { alignItems: 'center', borderColor: 'rgba(214, 170, 65, 0.5)', borderLeftWidth: 1, minWidth: 58, paddingLeft: 12 },
  countValue: { color: colors.goldLight, fontFamily: 'serif', fontSize: 20, fontWeight: '900' },
  countLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  inlineError: { backgroundColor: 'rgba(91, 18, 27, 0.75)', borderColor: colors.danger, borderRadius: 9, borderWidth: 1, marginTop: 11, padding: 10 },
  inlineErrorText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  filters: { gap: 8, paddingVertical: 15 },
  coachLibrarySpacer: { height: 15 },
  filter: { backgroundColor: 'rgba(8, 15, 21, 0.92)', borderColor: colors.border, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  filterActive: { backgroundColor: colors.gold, borderColor: colors.goldLight },
  filterText: { color: colors.sandstone, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  filterTextActive: { color: '#21140a' },
  sectionHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900' },
  sectionCount: { color: colors.muted, fontSize: 9 },
  studyGrid: { gap: 14 },
  studyCard: { backgroundColor: 'rgba(8, 15, 21, 0.96)', borderColor: colors.border, borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  coverWrap: { backgroundColor: '#17110c', height: 174, overflow: 'hidden', position: 'relative' },
  fallbackCover: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  fallbackTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900', marginTop: 11, textAlign: 'center' },
  statusPill: { backgroundColor: 'rgba(137, 82, 22, 0.94)', borderColor: colors.goldLight, borderRadius: 12, borderWidth: 1, left: 11, paddingHorizontal: 9, paddingVertical: 5, position: 'absolute', top: 11 },
  statusCompleted: { backgroundColor: 'rgba(19, 112, 80, 0.94)', borderColor: '#78d8b2' },
  statusAssessment: { backgroundColor: 'rgba(25, 85, 137, 0.94)', borderColor: '#8ecdf5' },
  statusPillText: { color: colors.cream, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  studyCopy: { padding: 15 },
  studyTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 21, fontWeight: '900', lineHeight: 25 },
  studyDescription: { color: colors.sandstone, fontSize: 11, lineHeight: 17, marginTop: 7 },
  studyFooter: { alignItems: 'center', borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 13, paddingTop: 11 },
  sourceRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6, minWidth: 0 },
  sourceText: { color: colors.muted, flex: 1, fontSize: 9 },
  openRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginLeft: 10 },
  openText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  emptyPanel: { alignItems: 'center', backgroundColor: 'rgba(8, 15, 21, 0.9)', borderColor: colors.border, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, padding: 28 },
  emptyTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 19, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  emptyText: { color: colors.sandstone, fontSize: 11, lineHeight: 17, marginTop: 7, textAlign: 'center' },
});
