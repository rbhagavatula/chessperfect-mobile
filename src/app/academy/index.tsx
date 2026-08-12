import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import { type AcademyMembership, fetchStudentAcademies, selectAcademy } from '@/lib/academy';

export default function AcademySelectionScreen() {
  const { choose } = useLocalSearchParams<{ choose?: string }>();
  const [memberships, setMemberships] = useState<AcademyMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingTenantId, setOpeningTenantId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openAcademy = useCallback(async (membership: AcademyMembership, count: number) => {
    setOpeningTenantId(membership.tenantId);
    setError(null);
    try {
      await selectAcademy(membership, count);
      router.replace('/academy/student-dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open this academy.');
      setOpeningTenantId(null);
    }
  }, []);

  const loadMemberships = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const available = await fetchStudentAcademies();
      if (available.length === 1 && choose !== '1') {
        await openAcademy(available[0], 1);
        return;
      }
      setMemberships(available);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load your academies.');
    } finally {
      setLoading(false);
    }
  }, [choose, openAcademy]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadMemberships(), 0);
    return () => clearTimeout(initialLoad);
  }, [loadMemberships]);

  return (
    <LinearGradient colors={['#06111c', '#1c120c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader title={memberships.length > 1 ? 'Choose Academy' : 'My Academy'} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={colors.goldLight} size="large" />
              <Text style={styles.stateTitle}>Opening your academy...</Text>
              <Text style={styles.stateCopy}>Checking your active student membership.</Text>
            </View>
          ) : error ? (
            <View style={styles.statePanel}>
              <SymbolView
                name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }}
                size={42}
                tintColor={colors.danger}
              />
              <Text style={styles.stateTitle}>The academy gate is unavailable</Text>
              <Text style={styles.stateCopy}>{error}</Text>
              <Pressable onPress={() => void loadMemberships()} style={styles.retryButton}>
                <Text style={styles.retryText}>TRY AGAIN</Text>
              </Pressable>
            </View>
          ) : memberships.length === 0 ? (
            <View style={styles.statePanel}>
              <SymbolView
                name={{ android: 'school', ios: 'graduationcap.fill', web: 'school' }}
                size={46}
                tintColor={colors.goldLight}
              />
              <Text style={styles.stateTitle}>No student academy found</Text>
              <Text style={styles.stateCopy}>Your account does not have an active student membership.</Text>
            </View>
          ) : (
            <>
              <View style={styles.intro}>
                <Text style={styles.eyebrow}>YOUR ACADEMY REALMS</Text>
                <Text style={styles.heading}>Choose Your Academy</Text>
                <Text style={styles.caption}>
                  You belong to more than one academy. Select the academy dashboard you want to enter.
                </Text>
              </View>
              <OrnamentDivider />
              <View style={styles.cards}>
                {memberships.map((membership) => {
                  const opening = openingTenantId === membership.tenantId;
                  const unavailable = !membership.host?.trim();
                  return (
                    <Pressable
                      accessibilityLabel={`Open ${membership.academyName}`}
                      accessibilityRole="button"
                      disabled={openingTenantId !== null || unavailable}
                      key={membership.tenantId}
                      onPress={() => void openAcademy(membership, memberships.length)}
                      style={({ pressed }) => [styles.cardFrame, pressed && styles.pressed, unavailable && styles.disabled]}>
                      <Image
                        contentFit="cover"
                        source={require('@/assets/dashboard/academy-card-mobile-v1.jpg')}
                        style={StyleSheet.absoluteFill}
                      />
                      <LinearGradient
                        colors={['rgba(7, 10, 13, 0.15)', 'rgba(9, 8, 7, 0.72)', 'rgba(7, 8, 9, 0.98)']}
                        locations={[0, 0.48, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                      <RoyalCorners />
                      <View style={styles.cardContent}>
                        <View style={styles.academySeal}>
                          <Text style={styles.academyInitial}>{membership.academyName?.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.academyName}>{membership.academyName}</Text>
                        <View style={styles.studentPill}>
                          <Text style={styles.studentPillText}>STUDENT</Text>
                        </View>
                        <View style={styles.enterRow}>
                          {opening ? <ActivityIndicator color={colors.goldLight} size="small" /> : null}
                          <Text style={styles.enterText}>{unavailable ? 'DOMAIN UNAVAILABLE' : opening ? 'OPENING...' : 'ENTER ACADEMY'}</Text>
                          {!opening && !unavailable ? (
                            <SymbolView
                              name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }}
                              size={19}
                              tintColor={colors.goldLight}
                            />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  academyInitial: { color: colors.goldLight, fontFamily: 'serif', fontSize: 30, fontWeight: '900' },
  academyName: { color: colors.cream, fontFamily: 'serif', fontSize: 23, fontWeight: '900', lineHeight: 28, marginTop: 12, textAlign: 'center' },
  academySeal: { alignItems: 'center', backgroundColor: 'rgba(9, 16, 22, 0.9)', borderColor: colors.gold, borderRadius: 34, borderWidth: 2, height: 68, justifyContent: 'center', width: 68 },
  background: { flex: 1 },
  caption: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 380, textAlign: 'center' },
  cardContent: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', padding: 19 },
  cardFrame: { borderColor: colors.goldLight, borderRadius: 16, borderWidth: 1, height: 260, overflow: 'hidden', position: 'relative' },
  cards: { gap: 16 },
  content: { flexGrow: 1, paddingBottom: 30, paddingHorizontal: 14 },
  disabled: { opacity: 0.55 },
  enterRow: { alignItems: 'center', borderTopColor: 'rgba(242, 201, 97, 0.3)', borderTopWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 17, paddingTop: 13, width: '100%' },
  enterText: { color: colors.goldLight, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: colors.cream, fontFamily: 'serif', fontSize: 29, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  intro: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 26 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  retryButton: { backgroundColor: colors.terracotta, borderColor: colors.gold, borderRadius: 9, borderWidth: 1, marginTop: 18, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: colors.cream, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  safeArea: { flex: 1 },
  stateCopy: { color: colors.sandstone, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 310, textAlign: 'center' },
  statePanel: { alignItems: 'center', backgroundColor: 'rgba(5, 13, 21, 0.9)', borderColor: colors.border, borderRadius: 16, borderWidth: 1, justifyContent: 'center', marginTop: 35, minHeight: 250, padding: 24 },
  stateTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 21, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  studentPill: { backgroundColor: 'rgba(15, 92, 76, 0.72)', borderColor: 'rgba(96, 218, 183, 0.7)', borderRadius: 12, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 4 },
  studentPillText: { color: '#bff6de', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
});
