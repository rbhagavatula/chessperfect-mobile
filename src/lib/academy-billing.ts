import { ApiError, getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { academyOrigin, getSelectedAcademy, type SelectedAcademy } from '@/lib/academy';
import { getAcademyAccessSession } from '@/lib/academy-session';
import { config } from '@/lib/config';

export type BillingCycleStatus = 'DUE' | 'INVOICED' | 'PAID' | 'VOID';
export type PaymentStatus = 'CANCELLED' | 'CREATED' | 'EXPIRED' | 'FAILED' | 'ORDER_CREATED' | 'PAID';

export type StudentBillingCycle = {
  baseFeeAmountInr: number;
  gstAmountInr: number;
  gstPercent: number;
  id: number;
  payableAmountInr: number;
  periodEnd: string;
  periodStart: string;
  status: BillingCycleStatus;
  taxableAmountInr: number;
  waiverAmountInr: number;
};

export type StudentPayment = {
  amountPaise: number;
  billingCycleId: number;
  createdAt: string;
  currency: string;
  finalizedAt?: string | null;
  id: number;
  paymentMethod?: string | null;
  periodEnd: string;
  periodStart: string;
  receiptNumber?: string | null;
  status: PaymentStatus;
  transactionReference?: string | null;
};

export type AcademyBillingContext = {
  academy: SelectedAcademy;
  accessToken: string;
  origin: string;
};

type PayIntentResponse = { publicId: string };

export async function getAcademyBillingContext(): Promise<AcademyBillingContext> {
  const academy = await getSelectedAcademy();
  if (!academy) throw new ApiError('Please choose an academy first.', 409);
  const origin = academyOrigin(academy.host);
  const session = await getAcademyAccessSession(academy.tenantId, origin);
  return { academy, accessToken: session.accessToken, origin };
}

export function fetchStudentBillingCycles(context: AcademyBillingContext) {
  return getJsonFromOrigin<StudentBillingCycle[]>(
    '/api/v1/academy/me/billing-cycles',
    context.origin,
    context.accessToken,
  );
}

export function fetchStudentPaymentHistory(context: AcademyBillingContext, status?: PaymentStatus) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return getJsonFromOrigin<StudentPayment[]>(
    `/api/v1/academy/me/payment-history${suffix}`,
    context.origin,
    context.accessToken,
  );
}

export async function createStudentFeeCheckout(context: AcademyBillingContext, cycleId: number) {
  // The approved payment portal returns to the tenant web Fees route. When the
  // student closes the secure browser, the native screen refreshes from the
  // same billing API and reflects the finalized payment.
  const returnUrl = `${context.origin}/fees`;
  const response = await postAuthorizedJsonFromOrigin<PayIntentResponse>(
    `/api/v1/academy/student/fees/cycles/${cycleId}/pay-intent`,
    context.origin,
    { returnUrl },
    context.accessToken,
  );
  if (!response.publicId) throw new ApiError('ChessPerfect returned an invalid payment session.', 502);

  const checkout = new URL('/payments/checkout', config.apiBaseUrl);
  checkout.searchParams.set('publicId', response.publicId);
  checkout.searchParams.set('returnUrl', returnUrl);
  return checkout.toString();
}

export function payableAmount(cycle: StudentBillingCycle) {
  return Math.max(0, Number(cycle.payableAmountInr ?? cycle.baseFeeAmountInr - cycle.waiverAmountInr) || 0);
}

export function isPayableCycle(cycle: StudentBillingCycle) {
  return payableAmount(cycle) > 0 && (cycle.status === 'DUE' || cycle.status === 'INVOICED');
}
