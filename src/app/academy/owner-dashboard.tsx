import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, OrnamentDivider, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import { fetchAcademyMessagingContext, type AcademyMessagingContext } from '@/lib/academy-messaging';
import { getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';

export default function AcademyOwnerDashboard() {
  const [academy, setAcademy] = useState<SelectedAcademy | null>(null);
  const [context, setContext] = useState<AcademyMessagingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const selected = await getSelectedAcademy();
      if (!selected) throw new Error('Choose an academy first.');
      setAcademy(selected);
      setContext(await fetchAcademyMessagingContext(selected));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load the academy.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <LinearGradient colors={['#07111b', '#1b110b', '#05080b']} style={styles.background}>
    <CivBackdrop />
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <PlayScreenHeader title="Academy Admin" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.goldLight}/>}>
        {loading && !context ? <View style={styles.state}><ActivityIndicator color={colors.goldLight}/><Text style={styles.muted}>Loading academy communication…</Text></View> : null}
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        {context ? <>
          <View style={styles.hero}><RoyalCorners/><View style={styles.seal}><Text style={styles.sealText}>{context.academyName.charAt(0)}</Text></View><View style={styles.heroCopy}><Text style={styles.eyebrow}>{academy?.role} CONSOLE</Text><Text numberOfLines={2} style={styles.title}>{context.academyName}</Text><Text style={styles.muted}>Communication and mobile app adoption</Text></View></View>
          <OrnamentDivider />
          <View style={styles.metrics}>
            <Metric label="Students" value={context.adoption.totalStudents}/>
            <Metric label="Push ready" value={context.adoption.active} tone="good"/>
            <Metric label="No app" value={context.adoption.notConnected} tone="danger"/>
            <Metric label="Notifications off" value={context.adoption.notificationsOff} tone="warn"/>
          </View>
          <Pressable onPress={() => router.push('/academy/messaging')} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <View style={styles.actionIcon}><SymbolView name={{ android: 'campaign', ios: 'message.fill', web: 'campaign' }} size={28} tintColor={colors.goldLight}/></View>
            <View style={styles.actionCopy}><Text style={styles.actionTitle}>ACADEMY MESSAGING</Text><Text style={styles.muted}>Message students, batches, or the whole academy.</Text></View>
            <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={20} tintColor={colors.goldLight}/>
          </Pressable>
          <Pressable onPress={() => router.push('/academy/messaging?tab=ADOPTION')} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <View style={styles.actionIcon}><SymbolView name={{ android: 'phone_android', ios: 'iphone', web: 'phone_android' }} size={27} tintColor={colors.goldLight}/></View>
            <View style={styles.actionCopy}><Text style={styles.actionTitle}>APP ADOPTION</Text><Text style={styles.muted}>Follow up with families who are not connected.</Text></View>
            <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={20} tintColor={colors.goldLight}/>
          </Pressable>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  </LinearGradient>;
}

function Metric({ label, value, tone }: { label: string; tone?: 'danger' | 'good' | 'warn'; value: number }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, tone === 'good' && styles.good, tone === 'warn' && styles.warn, tone === 'danger' && styles.danger]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', backgroundColor: 'rgba(7,16,24,.94)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 15 },
  actionCopy: { flex: 1, gap: 4 }, actionIcon: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,.13)', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  actionTitle: { color: colors.goldLight, fontSize: 12, fontWeight: '900', letterSpacing: .8 }, background: { flex: 1 }, content: { gap: 13, paddingBottom: 30, paddingHorizontal: 14 },
  danger: { color: '#fda4af' }, error: { backgroundColor: 'rgba(127,29,29,.55)', borderColor: colors.danger, borderRadius: 10, borderWidth: 1, padding: 12 }, errorText: { color: '#fecdd3', fontSize: 11 },
  eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, good: { color: '#86efac' }, hero: { alignItems: 'center', backgroundColor: 'rgba(6,14,22,.94)', borderColor: colors.gold, borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 13, marginTop: 8, padding: 17 },
  heroCopy: { flex: 1, gap: 4 }, metric: { alignItems: 'center', backgroundColor: 'rgba(7,16,24,.88)', borderColor: colors.border, borderRadius: 11, borderWidth: 1, minHeight: 80, padding: 11, width: '48%' }, metricLabel: { color: colors.muted, fontSize: 9, marginTop: 4, textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }, metricValue: { color: colors.cream, fontFamily: 'serif', fontSize: 25, fontWeight: '900' }, muted: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  pressed: { opacity: .78, transform: [{ scale: .99 }] }, safeArea: { flex: 1 }, seal: { alignItems: 'center', backgroundColor: '#25180f', borderColor: colors.gold, borderRadius: 27, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 }, sealText: { color: colors.goldLight, fontFamily: 'serif', fontSize: 24, fontWeight: '900' },
  state: { alignItems: 'center', gap: 10, justifyContent: 'center', minHeight: 220 }, title: { color: colors.cream, fontFamily: 'serif', fontSize: 20, fontWeight: '900' }, warn: { color: '#fde68a' },
});
