import { useIAP, type Purchase } from 'expo-iap';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError, getJson, getJsonFromOrigin, postAuthorizedJsonFromOrigin } from '@/lib/api';
import { config } from '@/lib/config';
import { getSession } from '@/lib/session';

export type GooglePlayCheckout = {
  expectedAmountInr: number;
  obfuscatedAccountId: string;
  paymentIntentId: string;
  productId: string;
  productType: 'in-app' | 'subs';
};

export type GooglePlayPlanProduct = {
  expectedAmountInr: number;
  planCode: string;
  productId: string;
};

export type GooglePlayCatalogue = { playerSubscriptions: GooglePlayPlanProduct[] };
export type GooglePlayFeeQuote = { androidPayableInr: number; cycleId: number; websitePayableInr: number };

export type BillingAuthorization = { accessToken: string; origin: string };

type PendingPurchase = {
  authorization: BillingAuthorization;
  checkout: GooglePlayCheckout;
  oldProductId?: string;
  oldPurchaseToken?: string;
};

type VerifiedPurchase = {
  entitlementExpiresAt?: string | null;
  planCode?: string | null;
  purpose: string;
  success: boolean;
};

export function fetchGooglePlayCatalogue(accessToken: string) {
  return getJson<GooglePlayCatalogue>('/api/v1/mobile/google-play/catalogue', accessToken);
}

export function fetchStudentGooglePlayFeeQuote(authorization: BillingAuthorization, cycleId: number) {
  return getJsonFromOrigin<GooglePlayFeeQuote>(
    `/api/v1/mobile/google-play/student-fees/cycles/${cycleId}/quote`,
    authorization.origin,
    authorization.accessToken,
  );
}

export function createStudentGooglePlayCheckout(authorization: BillingAuthorization, cycleId: number) {
  return postAuthorizedJsonFromOrigin<GooglePlayCheckout>(
    `/api/v1/mobile/google-play/student-fees/cycles/${cycleId}/checkout`,
    authorization.origin,
    {},
    authorization.accessToken,
  );
}

export async function createPlayerGooglePlayCheckout(planCode: string) {
  const session = await getSession();
  if (!session) throw new ApiError('Please sign in again to upgrade your plan.', 401);
  const authorization = { accessToken: session.accessToken, origin: config.apiBaseUrl };
  const checkout = await postAuthorizedJsonFromOrigin<GooglePlayCheckout>(
    `/api/v1/mobile/google-play/player-subscriptions/${encodeURIComponent(planCode)}/checkout`,
    authorization.origin,
    {},
    authorization.accessToken,
  );
  return { authorization, checkout };
}

export function restoreGooglePlayPurchase(authorization: BillingAuthorization, purchase: Purchase) {
  if (!purchase.purchaseToken) throw new Error('Google Play did not return a purchase token.');
  return postAuthorizedJsonFromOrigin<VerifiedPurchase>(
    '/api/v1/mobile/google-play/purchases/verify',
    authorization.origin,
    { paymentIntentId: null, productId: purchase.productId, purchaseToken: purchase.purchaseToken },
    authorization.accessToken,
    30_000,
  );
}

function purchaseMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Google Play could not complete the purchase. Please try again.';
}

export function useGooglePlayCheckout({
  onCompleted,
  onError,
}: {
  onCompleted: (verified: VerifiedPurchase) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [launchRevision, setLaunchRevision] = useState(0);
  const pendingRef = useRef<PendingPurchase | null>(null);
  const launchStartedRef = useRef(false);
  const callbacksRef = useRef({ onCompleted, onError });
  useEffect(() => {
    callbacksRef.current = { onCompleted, onError };
  }, [onCompleted, onError]);

  const reportError = useCallback((error: unknown) => {
    pendingRef.current = null;
    launchStartedRef.current = false;
    setBusy(false);
    callbacksRef.current.onError(purchaseMessage(error));
  }, []);

  const {
    availablePurchases,
    connected,
    fetchProducts,
    finishTransaction,
    getAvailablePurchases,
    products,
    requestPurchase,
    subscriptions,
  } = useIAP({
    onError: reportError,
    onPurchaseError: reportError,
    onPurchaseSuccess: (purchase) => {
      const pending = pendingRef.current;
      if (!pending || purchase.productId !== pending.checkout.productId) return;
      void (async () => {
        try {
          if (!purchase.purchaseToken) throw new Error('Google Play did not return a purchase token.');
          const verified = await postAuthorizedJsonFromOrigin<VerifiedPurchase>(
            '/api/v1/mobile/google-play/purchases/verify',
            pending.authorization.origin,
            {
              paymentIntentId: pending.checkout.paymentIntentId,
              productId: purchase.productId,
              purchaseToken: purchase.purchaseToken,
            },
            pending.authorization.accessToken,
            30_000,
          );
          if (!verified.success) throw new Error('ChessPerfect could not verify the Google Play purchase.');
          // The server acknowledges/consumes after secure verification. This call
          // clears any remaining native transaction state and is safe to retry.
          await finishTransaction({ purchase, isConsumable: pending.checkout.productType === 'in-app' }).catch(() => undefined);
          pendingRef.current = null;
          launchStartedRef.current = false;
          setBusy(false);
          await callbacksRef.current.onCompleted(verified);
        } catch (error) {
          reportError(error);
        }
      })();
    },
  });

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || launchStartedRef.current) return;
    const checkout = pending.checkout;
    const available = checkout.productType === 'subs' ? subscriptions : products;
    const product = available.find((candidate) => candidate.id === checkout.productId);
    if (!product) return;
    launchStartedRef.current = true;
    void (async () => {
      try {
        if (checkout.productType === 'in-app') {
          await requestPurchase({
            type: 'in-app',
            request: { google: { skus: [checkout.productId], obfuscatedAccountId: checkout.obfuscatedAccountId } },
          });
          return;
        }
        if (product.type !== 'subs' || product.platform !== 'android') {
          throw new Error('The selected Google Play subscription is unavailable.');
        }
        const offer = product.subscriptionOffers.find((candidate) => Boolean(candidate.offerTokenAndroid));
        if (!offer?.offerTokenAndroid) throw new Error('No eligible Google Play subscription offer is available.');
        await requestPurchase({
          type: 'subs',
          request: {
            google: {
              skus: [checkout.productId],
              obfuscatedAccountId: checkout.obfuscatedAccountId,
              subscriptionOffers: [{ sku: checkout.productId, offerToken: offer.offerTokenAndroid }],
              ...(pending.oldPurchaseToken ? { purchaseToken: pending.oldPurchaseToken } : {}),
              ...(pending.oldPurchaseToken && pending.oldProductId
                ? { subscriptionProductReplacementParams: { oldProductId: pending.oldProductId, replacementMode: 'charge-full-price' as const } }
                : {}),
            },
          },
        });
      } catch (error) {
        reportError(error);
      }
    })();
  }, [launchRevision, products, reportError, requestPurchase, subscriptions]);

  const begin = useCallback(async (
    checkout: GooglePlayCheckout,
    authorization: BillingAuthorization,
    oldPurchase?: Purchase,
  ) => {
    if (Platform.OS !== 'android') throw new Error('Google Play Billing is available on Android only.');
    if (!connected) throw new Error('Google Play is still connecting. Please try again in a moment.');
    if (busy) return;
    setBusy(true);
    pendingRef.current = {
      authorization,
      checkout,
      oldProductId: oldPurchase?.productId,
      oldPurchaseToken: oldPurchase?.purchaseToken ?? undefined,
    };
    launchStartedRef.current = false;
    setLaunchRevision((current) => current + 1);
    try {
      await fetchProducts({ skus: [checkout.productId], type: checkout.productType });
    } catch (error) {
      reportError(error);
      throw error;
    }
  }, [busy, connected, fetchProducts, reportError]);

  return {
    availablePurchases,
    begin,
    busy,
    connected,
    fetchProducts,
    getAvailablePurchases,
    products,
    subscriptions,
  };
}
