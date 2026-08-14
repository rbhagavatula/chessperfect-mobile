import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop, RoyalCorners } from '@/components/civ-ornament';
import { PlayScreenHeader } from '@/components/play-screen-header';
import { colors } from '@/constants/colors';
import {
  fetchStudentBillingCycles,
  fetchStudentPaymentHistory,
  getAcademyBillingContext,
  isPayableCycle,
  payableAmount,
  type AcademyBillingContext,
  type PaymentStatus,
  type StudentBillingCycle,
  type StudentPayment,
} from '@/lib/academy-billing';
import {
  createStudentGooglePlayCheckout,
  fetchStudentGooglePlayFeeQuote,
  useGooglePlayCheckout,
  type GooglePlayFeeQuote,
} from '@/lib/google-play-billing';

type ViewMode = 'BILLING' | 'HISTORY';
type HistoryFilter = 'ALL' | PaymentStatus;

const historyFilters: { label: string; value: HistoryFilter }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'PAID', value: 'PAID' },
  { label: 'CREATED', value: 'CREATED' },
  { label: 'PROCESSING', value: 'ORDER_CREATED' },
  { label: 'FAILED', value: 'FAILED' },
  { label: 'EXPIRED', value: 'EXPIRED' },
  { label: 'CANCELLED', value: 'CANCELLED' },
];

const paymentErrors: Record<string, string> = {
  BILLING_CYCLE_NOT_FOUND: 'The fee record could not be found.',
  CYCLE_ALREADY_PAID: 'This fee has already been paid.',
  CYCLE_VOID: 'This fee is no longer payable.',
  PAYMENT_ALREADY_EXISTS_FOR_BILLING_CYCLE: 'A payment is already being processed.',
  GOOGLE_PLAY_BILLING_DISABLED: 'Google Play Billing is not configured yet.',
  GOOGLE_PLAY_PURCHASE_NOT_COMPLETED: 'Google Play has not completed this purchase.',
  ZERO_FEE_MARKED_PAID: 'This no-fee cycle has been marked paid.',
};

function monthLabel(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00`);
  const end = new Date(`${periodEnd}T00:00:00`);
  if (Number.isNaN(start.getTime())) return periodStart || 'Billing period';
  const format = (date: Date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startLabel = format(start);
  const endLabel = Number.isNaN(end.getTime()) ? startLabel : format(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function formatInr(value: number) {
  return `₹${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-IN')}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short', year: 'numeric' });
}

function displayCycleStatus(cycle: StudentBillingCycle) {
  return payableAmount(cycle) <= 0 && cycle.status !== 'VOID' ? 'PAID' : cycle.status;
}

function statusStyle(status: string) {
  if (status === 'PAID') return styles.statusPaid;
  if (status === 'VOID' || status === 'FAILED' || status === 'CANCELLED') return styles.statusFailed;
  if (status === 'INVOICED' || status === 'ORDER_CREATED') return styles.statusProcessing;
  return styles.statusDue;
}

function StatusPill({ status }: { status: string }) {
  return (
    <View style={[styles.statusPill, statusStyle(status)]}>
      <Text style={styles.statusText}>{status === 'ORDER_CREATED' ? 'PROCESSING' : status.replaceAll('_', ' ')}</Text>
    </View>
  );
}

function AmountCell({ full, label, strong, value }: { full?: boolean; label: string; strong?: boolean; value: number | string }) {
  return (
    <View style={[styles.amountCell, full && styles.amountCellFull, strong && styles.amountCellStrong]}>
      <Text style={styles.amountLabel}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.amountValueStrong]}>{typeof value === 'string' ? value : formatInr(value)}</Text>
    </View>
  );
}

function BillingCard({
  busy,
  cycle,
  googlePlayAmount,
  googlePlayDisplayPrice,
  onPay,
}: {
  busy: boolean;
  cycle: StudentBillingCycle;
  googlePlayAmount?: number;
  googlePlayDisplayPrice?: string;
  onPay: (cycle: StudentBillingCycle) => void;
}) {
  const payable = payableAmount(cycle);
  const checkoutAmount = googlePlayAmount ?? payable;
  const status = displayCycleStatus(cycle);
  const canPay = isPayableCycle(cycle);

  return (
    <View style={styles.cycleCard}>
      <RoyalCorners />
      <View style={styles.cardHeading}>
        <View style={styles.cardHeadingCopy}>
          <Text style={styles.period}>{monthLabel(cycle.periodStart, cycle.periodEnd)}</Text>
          <Text style={styles.periodDates}>{cycle.periodStart} – {cycle.periodEnd}</Text>
        </View>
        <StatusPill status={status} />
      </View>

      <View style={styles.amountGrid}>
        {canPay ? (
          <AmountCell full label="ANDROID APP TOTAL" strong value={googlePlayDisplayPrice || checkoutAmount} />
        ) : (
          <>
            <AmountCell label="BASE FEE" value={cycle.baseFeeAmountInr} />
            <AmountCell label="WAIVER" value={cycle.waiverAmountInr} />
            <AmountCell label={cycle.gstPercent > 0 ? `GST INCLUDED (${cycle.gstPercent}%)` : 'GST INCLUDED'} value={cycle.gstAmountInr} />
            <AmountCell label="NET PAID" strong value={payable} />
          </>
        )}
      </View>

      {canPay ? (
        <Pressable
          accessibilityLabel={`Pay ${formatInr(checkoutAmount)} for ${monthLabel(cycle.periodStart, cycle.periodEnd)}`}
          disabled={busy}
          onPress={() => onPay(cycle)}
          style={({ pressed }) => [styles.payButton, pressed && styles.pressed, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color="#211305" size="small" /> : <SymbolView name={{ android: 'payments', ios: 'creditcard.fill', web: 'payments' }} size={19} tintColor="#211305" />}
          <Text style={styles.payButtonText}>{busy ? 'OPENING GOOGLE PLAY...' : `PAY ${formatInr(checkoutAmount)}`}</Text>
        </Pressable>
      ) : status === 'PAID' ? (
        <View style={styles.paidNote}>
          <SymbolView name={{ android: 'verified', ios: 'checkmark.seal.fill', web: 'verified' }} size={17} tintColor={colors.success} />
          <Text style={styles.paidNoteText}>Payment complete</Text>
        </View>
      ) : null}
    </View>
  );
}

function PaymentCard({ payment }: { payment: StudentPayment }) {
  return (
    <View style={styles.paymentCard}>
      <View style={styles.cardHeading}>
        <View style={styles.cardHeadingCopy}>
          <Text style={styles.period}>{monthLabel(payment.periodStart, payment.periodEnd)}</Text>
          <Text style={styles.createdAt}>Started {formatDateTime(payment.createdAt)}</Text>
        </View>
        <StatusPill status={payment.status} />
      </View>
      <View style={styles.paymentAmountRow}>
        <Text style={styles.paymentAmount}>{formatInr(payment.amountPaise / 100)}</Text>
        <Text style={styles.paymentCurrency}>{payment.currency || 'INR'}</Text>
      </View>
      <View style={styles.paymentDetails}>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>METHOD</Text><Text style={styles.detailValue}>{payment.paymentMethod || '—'}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>REFERENCE</Text><Text numberOfLines={2} selectable style={styles.detailValue}>{payment.transactionReference || '—'}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>RECEIPT</Text><Text selectable style={styles.detailValue}>{payment.receiptNumber || '—'}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>FINALIZED</Text><Text style={styles.detailValue}>{formatDateTime(payment.finalizedAt)}</Text></View>
      </View>
    </View>
  );
}

export default function StudentFeesScreen() {
  const [context, setContext] = useState<AcademyBillingContext | null>(null);
  const [cycles, setCycles] = useState<StudentBillingCycle[]>([]);
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [feeQuotes, setFeeQuotes] = useState<Record<number, GooglePlayFeeQuote>>({});
  const [mode, setMode] = useState<ViewMode>('BILLING');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingCycleId, setPayingCycleId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFees = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const nextContext = await getAcademyBillingContext();
      const [nextCycles, nextPayments] = await Promise.all([
        fetchStudentBillingCycles(nextContext),
        fetchStudentPaymentHistory(nextContext),
      ]);
      setContext(nextContext);
      setCycles(nextCycles);
      setPayments(nextPayments);
      const quotes = await Promise.all(nextCycles.filter(isPayableCycle).map((cycle) =>
        fetchStudentGooglePlayFeeQuote(
          { accessToken: nextContext.accessToken, origin: nextContext.origin },
          cycle.id,
        ).catch(() => null),
      ));
      setFeeQuotes(Object.fromEntries(quotes.filter((quote): quote is GooglePlayFeeQuote => Boolean(quote)).map((quote) => [quote.cycleId, quote])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load your fees.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadFees();
  }, [loadFees]));

  const googlePlay = useGooglePlayCheckout({
    onCompleted: async () => {
      setPayingCycleId(null);
      await loadFees(true);
    },
    onError: (message) => {
      setPayingCycleId(null);
      setError(paymentErrors[message] || message);
    },
  });
  const { connected: playConnected, fetchProducts: fetchPlayProducts } = googlePlay;

  useEffect(() => {
    if (!playConnected) return;
    const skus = [...new Set(Object.values(feeQuotes).map((quote) => `chessperfect_fee_inr_${quote.androidPayableInr}`))];
    if (!skus.length) return;
    void fetchPlayProducts({ skus, type: 'in-app' }).catch(() => undefined);
  }, [feeQuotes, fetchPlayProducts, playConnected]);

  const totalDue = useMemo(() => cycles.filter(isPayableCycle).reduce(
    (sum, cycle) => sum + (feeQuotes[cycle.id]?.androidPayableInr ?? payableAmount(cycle)),
    0,
  ), [cycles, feeQuotes]);
  const paidCount = useMemo(() => cycles.filter((cycle) => displayCycleStatus(cycle) === 'PAID').length, [cycles]);
  const filteredPayments = useMemo(
    () => historyFilter === 'ALL' ? payments : payments.filter((payment) => payment.status === historyFilter),
    [historyFilter, payments],
  );

  async function payCycle(cycle: StudentBillingCycle) {
    if (!context || payingCycleId !== null) return;
    setPayingCycleId(cycle.id);
    setError(null);
    try {
      const authorization = { accessToken: context.accessToken, origin: context.origin };
      const checkout = await createStudentGooglePlayCheckout(authorization, cycle.id);
      setFeeQuotes((current) => ({
        ...current,
        [cycle.id]: { cycleId: cycle.id, websitePayableInr: payableAmount(cycle), androidPayableInr: checkout.expectedAmountInr },
      }));
      await googlePlay.begin(checkout, authorization);
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : 'PAYMENT_INITIALIZATION_FAILED';
      setError(paymentErrors[raw] || raw || 'We could not start the payment. Please try again.');
      if (raw === 'CYCLE_ALREADY_PAID' || raw === 'ZERO_FEE_MARKED_PAID') void loadFees(true);
      setPayingCycleId(null);
    }
  }

  return (
    <LinearGradient colors={['#06111c', '#1a110c', '#05090d']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <PlayScreenHeader showSettings={false} title="Fees" />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl colors={[colors.gold]} onRefresh={() => void loadFees(true)} refreshing={refreshing} tintColor={colors.goldLight} />}
          showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.statePanel}><ActivityIndicator color={colors.goldLight} size="large" /><Text style={styles.stateTitle}>Opening your fee ledger...</Text></View>
          ) : error && !context ? (
            <View style={styles.statePanel}>
              <SymbolView name={{ android: 'error', ios: 'exclamationmark.triangle.fill', web: 'error' }} size={42} tintColor={colors.danger} />
              <Text style={styles.stateTitle}>Fees are unavailable</Text><Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={() => void loadFees()} style={styles.retryButton}><Text style={styles.retryText}>TRY AGAIN</Text></Pressable>
            </View>
          ) : context ? (
            <>
              <View style={styles.summaryPanel}>
                <RoyalCorners />
                <View style={styles.summaryIcon}><SymbolView name={{ android: 'account_balance_wallet', ios: 'indianrupeesign.circle.fill', web: 'account_balance_wallet' }} size={27} tintColor={colors.goldLight} /></View>
                <View style={styles.summaryCopy}><Text style={styles.eyebrow}>{context.academy.academyName.toUpperCase()}</Text><Text style={styles.summaryLabel}>TOTAL PAYABLE</Text><Text style={styles.summaryAmount}>{formatInr(totalDue)}</Text></View>
                <View style={styles.paidCount}><Text style={styles.paidCountValue}>{paidCount}</Text><Text style={styles.paidCountLabel}>PAID</Text></View>
              </View>

              <View style={styles.modeTabs}>
                <Pressable onPress={() => setMode('BILLING')} style={[styles.modeTab, mode === 'BILLING' && styles.modeTabActive]}><Text style={[styles.modeTabText, mode === 'BILLING' && styles.modeTabTextActive]}>BILLING CYCLES</Text></Pressable>
                <Pressable onPress={() => setMode('HISTORY')} style={[styles.modeTab, mode === 'HISTORY' && styles.modeTabActive]}><Text style={[styles.modeTabText, mode === 'HISTORY' && styles.modeTabTextActive]}>PAYMENT HISTORY</Text></Pressable>
              </View>

              {error ? <View style={styles.inlineError}><Text style={styles.inlineErrorText}>{error}</Text></View> : null}

              {mode === 'BILLING' ? (
                cycles.length ? (
                  <View style={styles.cards}>{cycles.map((cycle) => {
                    const quote = feeQuotes[cycle.id];
                    const product = quote ? googlePlay.products.find((item) => item.id === `chessperfect_fee_inr_${quote.androidPayableInr}`) : undefined;
                    return <BillingCard busy={payingCycleId === cycle.id} cycle={cycle} googlePlayAmount={quote?.androidPayableInr} googlePlayDisplayPrice={product?.displayPrice} key={cycle.id} onPay={payCycle} />;
                  })}</View>
                ) : (
                  <View style={styles.emptyPanel}><SymbolView name={{ android: 'receipt_long', ios: 'doc.text.fill', web: 'receipt_long' }} size={38} tintColor={colors.goldLight} /><Text style={styles.emptyTitle}>No billing cycles available</Text><Text style={styles.stateText}>Your academy has not generated a fee cycle for the active enrollment.</Text></View>
                )
              ) : (
                <>
                  <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroller}>
                    {historyFilters.map((filter) => <Pressable key={filter.value} onPress={() => setHistoryFilter(filter.value)} style={[styles.filter, historyFilter === filter.value && styles.filterActive]}><Text style={[styles.filterText, historyFilter === filter.value && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}
                  </ScrollView>
                  {filteredPayments.length ? (
                    <View style={styles.cards}>{filteredPayments.map((payment) => <PaymentCard key={payment.id} payment={payment} />)}</View>
                  ) : (
                    <View style={styles.emptyPanel}><SymbolView name={{ android: 'history', ios: 'clock.arrow.circlepath', web: 'history' }} size={38} tintColor={colors.goldLight} /><Text style={styles.emptyTitle}>No matching payments</Text><Text style={styles.stateText}>Payment attempts and completed receipts will appear here.</Text></View>
                  )}
                </>
              )}

              <Text style={styles.paymentNote}>Payments in the Android app are securely processed by Google Play. The amount shown on the Google Play confirmation screen is the final app price.</Text>
            </>
          ) : null}
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
  summaryPanel: { alignItems: 'center', backgroundColor: 'rgba(7,16,24,0.95)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginTop: 16, padding: 16 },
  summaryIcon: { alignItems: 'center', backgroundColor: '#21160e', borderColor: colors.gold, borderRadius: 27, borderWidth: 1.5, height: 54, justifyContent: 'center', width: 54 },
  summaryCopy: { flex: 1, marginLeft: 13, minWidth: 0 }, eyebrow: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, summaryLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginTop: 4 }, summaryAmount: { color: colors.goldLight, fontFamily: 'serif', fontSize: 24, fontWeight: '900', marginTop: 1 },
  paidCount: { alignItems: 'center', borderLeftColor: colors.goldDark, borderLeftWidth: 1, minWidth: 57, paddingLeft: 13 }, paidCountValue: { color: colors.success, fontFamily: 'serif', fontSize: 22, fontWeight: '900' }, paidCountLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  modeTabs: { backgroundColor: 'rgba(7,15,22,0.94)', borderColor: colors.goldDark, borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 13, padding: 3 },
  modeTab: { alignItems: 'center', borderRadius: 7, flex: 1, minHeight: 39, justifyContent: 'center' }, modeTabActive: { backgroundColor: colors.gold }, modeTabText: { color: colors.sandstone, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, modeTabTextActive: { color: '#201305' },
  inlineError: { backgroundColor: 'rgba(91,18,27,0.75)', borderColor: colors.danger, borderRadius: 9, borderWidth: 1, marginTop: 11, padding: 10 }, inlineErrorText: { color: '#fecdd3', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  cards: { gap: 12, marginTop: 13 }, cycleCard: { backgroundColor: 'rgba(7,15,22,0.96)', borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: 'hidden', padding: 15 },
  cardHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 }, cardHeadingCopy: { flex: 1, minWidth: 0 }, period: { color: colors.cream, fontFamily: 'serif', fontSize: 18, fontWeight: '900' }, periodDates: { color: colors.muted, fontSize: 8, marginTop: 3 },
  statusPill: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 }, statusPaid: { backgroundColor: 'rgba(20,111,73,0.25)', borderColor: 'rgba(85,210,157,0.65)' }, statusFailed: { backgroundColor: 'rgba(132,24,37,0.25)', borderColor: 'rgba(251,113,133,0.65)' }, statusProcessing: { backgroundColor: 'rgba(24,89,130,0.27)', borderColor: 'rgba(92,179,232,0.6)' }, statusDue: { backgroundColor: 'rgba(178,125,27,0.22)', borderColor: colors.gold }, statusText: { color: colors.cream, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }, amountCell: { backgroundColor: 'rgba(0,0,0,0.22)', borderColor: 'rgba(255,255,255,0.09)', borderRadius: 8, borderWidth: 1, minHeight: 55, padding: 9, width: '48.8%' }, amountCellFull: { width: '100%' }, amountCellStrong: { backgroundColor: 'rgba(190,136,34,0.12)', borderColor: colors.goldDark }, amountLabel: { color: colors.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.55 }, amountValue: { color: colors.sandstone, fontSize: 13, fontWeight: '700', marginTop: 5 }, amountValueStrong: { color: colors.goldLight, fontFamily: 'serif', fontSize: 16, fontWeight: '900' },
  payButton: { alignItems: 'center', backgroundColor: colors.goldLight, borderColor: '#fff0aa', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 13, minHeight: 45 }, payButtonText: { color: '#211305', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.5 },
  paidNote: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'flex-end', marginTop: 12 }, paidNoteText: { color: '#a7e7c9', fontSize: 9, fontWeight: '800' },
  filtersScroller: { flexGrow: 0, height: 50 }, filters: { alignItems: 'center', gap: 7, paddingTop: 13 }, filter: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(7,15,22,0.94)', borderColor: colors.goldDark, borderRadius: 16, borderWidth: 1, height: 31, justifyContent: 'center', paddingHorizontal: 13 }, filterActive: { backgroundColor: colors.goldLight, borderColor: '#fff1b8' }, filterText: { color: colors.sandstone, fontSize: 8, fontWeight: '900' }, filterTextActive: { color: '#211305' },
  paymentCard: { backgroundColor: 'rgba(7,15,22,0.96)', borderColor: colors.goldDark, borderRadius: 13, borderWidth: 1, padding: 14 }, createdAt: { color: colors.muted, fontSize: 8, marginTop: 3 }, paymentAmountRow: { alignItems: 'baseline', flexDirection: 'row', gap: 6, marginTop: 11 }, paymentAmount: { color: colors.goldLight, fontFamily: 'serif', fontSize: 22, fontWeight: '900' }, paymentCurrency: { color: colors.muted, fontSize: 8, fontWeight: '800' }, paymentDetails: { borderTopColor: 'rgba(255,255,255,0.08)', borderTopWidth: 1, gap: 8, marginTop: 11, paddingTop: 11 }, detailRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, detailLabel: { color: colors.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, detailValue: { color: colors.sandstone, flex: 1, fontSize: 9, textAlign: 'right' },
  emptyPanel: { alignItems: 'center', backgroundColor: 'rgba(7,15,22,0.93)', borderColor: colors.goldDark, borderRadius: 13, borderWidth: 1, marginTop: 13, minHeight: 190, padding: 24, justifyContent: 'center' }, emptyTitle: { color: colors.goldLight, fontFamily: 'serif', fontSize: 18, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  paymentNote: { color: colors.muted, fontSize: 8, lineHeight: 13, marginHorizontal: 9, marginTop: 16, textAlign: 'center' },
});
