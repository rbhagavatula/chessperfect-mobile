# ChessPerfect Android Play Console checklist

## Completed in the repository

- [x] Package name is `com.chessperfect.mobile`.
- [x] App version is `1.0.0`; first Android version code is configured.
- [x] Target and compile SDK are API 36.
- [x] Production builds use Android App Bundle through EAS.
- [x] Production submission defaults to a **draft Internal testing** release.
- [x] Camera and microphone permission explanations are configured.
- [x] In-app Privacy Policy, Terms of Service and account-deletion entry points exist.
- [x] External account-deletion page is `/account-deletion`.
- [x] Play Store icon and 1024 x 500 feature graphic are prepared.
- [x] Phone screenshots and English listing copy are prepared.
- [x] Data safety and reviewer-access worksheets are prepared.

## Google Play Console / secure owner actions

- [ ] Create the app as **ChessPerfect**, default language English, app type Game, free/paid setting appropriate to the distribution model.
- [ ] Accept Play App Signing and save the upload-key certificate details securely.
- [ ] Complete developer-account verification and merchant/payments profile.
- [ ] Upload `play-store-icon.png`, `feature-graphic.png` and at least two files from `en-US/phone`.
- [ ] Add support email, website, privacy-policy URL and account-deletion URL from `listing.md`.
- [ ] Complete Data safety using `data-safety.md` after verifying production SDKs.
- [ ] Complete App access with durable credentials based on `app-access.md`.
- [ ] Complete Ads, Content rating, Target audience, News apps and Data practices declarations truthfully.
- [ ] Declare the camera and microphone permissions in the app-content workflow when prompted.
- [ ] Create and activate every subscription/product in the Google billing runbook, using the exact package name and product IDs.
- [ ] Grant the backend service account the minimum Play Console permissions and configure server credentials.
- [ ] Upload the first AAB manually if Google requires the initial Play app setup before API submission.
- [ ] Add licence testers and internal testers; install exclusively from the Play opt-in link for billing validation.
- [ ] Test purchase, restore, cancel, renew, grace period, pending purchase and refund/revocation paths.
- [ ] Run the pre-launch report and resolve crashes, ANRs, accessibility and device-compatibility findings.
- [ ] If this is a new personal Play account, satisfy Google’s required closed-test duration and tester count before production access.

## Release command

```powershell
npx eas-cli@latest build --platform android --profile production
```

After the Play application and service account are configured:

```powershell
npx eas-cli@latest submit --platform android --profile production --latest
```

The configured submission creates a draft on the Internal testing track; it does not publish directly to Production.
