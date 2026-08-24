# ChessPerfect Android Play Console checklist

## Completed in the repository

- [x] Package name is `com.chessperfect.mobile`.
- [x] App version is `1.1.0`; Android version codes are remotely managed and auto-incremented by EAS.
- [x] Target and compile SDK are API 36.
- [x] Production builds use Android App Bundle through EAS.
- [x] Production submission defaults to a **draft Internal testing** release so promotion remains a deliberate Play Console action.
- [x] Camera and microphone permission explanations are configured.
- [x] In-app Privacy Policy, Terms of Service and account-deletion entry points exist.
- [x] External account-deletion page is `/account-deletion`.
- [x] Play Store icon and 1024 x 500 feature graphic are prepared.
- [x] Phone screenshots and English listing copy are prepared.
- [x] Data safety and reviewer-access worksheets are prepared.

## Google Play Console / secure owner actions

- [x] Create the app as **ChessPerfect** and activate the Internal testing track.
- [x] Accept Play App Signing; version `1.1.0 (4)` was accepted with the configured upload key.
- [ ] Complete developer-account verification and merchant/payments profile.
- [ ] Upload `play-store-icon.png`, `feature-graphic.png` and at least two files from `en-US/phone`.
- [ ] Add support email, website, privacy-policy URL and account-deletion URL from `listing.md`.
- [ ] Complete Data safety using `data-safety.md` after verifying production SDKs.
- [ ] Complete App access with durable credentials based on `app-access.md`.
- [ ] Complete Ads, Content rating, Target audience, News apps and Data practices declarations truthfully.
- [ ] Declare the camera and microphone permissions in the app-content workflow when prompted.
- [ ] Create and activate every subscription/product in the Google billing runbook, using the exact package name and product IDs.
- [ ] Grant the backend service account the minimum Play Console permissions and configure server credentials.
- [x] Upload the first AAB manually and publish version `1.1.0 (4)` to Internal testing.
- [x] Add an internal tester, install from the Play opt-in link and verify My Database and Inbox against Production.
- [ ] Add licence testers and validate Google Play Billing using Play-installed builds.
- [ ] Test purchase, restore, cancel, renew, grace period, pending purchase and refund/revocation paths.
- [ ] Run the pre-launch report and resolve crashes, ANRs, accessibility and device-compatibility findings.
- [ ] If this is a new personal Play account, satisfy Google’s required closed-test duration and tester count before production access.

## Production promotion gate

- [x] Verify package `com.chessperfect.mobile`, version name `1.1.0`, target SDK 36 and minimum API 24.
- [x] Verify the production upload certificate matches the certificate used by the accepted Internal testing bundle.
- [x] Run `expo install --check`, `expo-doctor`, lint and an Android export after aligning the current SDK 57 patch dependencies.
- [x] Verify the Privacy Policy, Terms and account-deletion URLs return successfully.
- [x] Verify the 512 x 512 icon, 1024 x 500 feature graphic and eight phone screenshots.
- [x] Generate and validate the signed `1.1.0 (5)` production candidate from EAS build `a3fd8203-b5c0-4d1d-8a22-9db2d2ec9698`.
  SHA-256: `B5C1C577BCD4B999A17E6BA222C8E8EE04E40F8DA8E76829807D8C2294A23E42`.
- [ ] Upload the SDK-aligned version-code-5 candidate to Internal testing and repeat the critical-flow smoke test.
- [ ] Complete every remaining Play Console setup and app-content declaration shown above.
- [ ] Review the Play pre-launch report and resolve blocking crashes, ANRs, policy findings or compatibility issues.
- [ ] Promote the tested release to the required closed-testing track or Production, using a staged rollout when available.

## Release command

```powershell
npx eas-cli@latest build --platform android --profile production
```

After the Play application and service account are configured:

```powershell
npx eas-cli@latest submit --platform android --profile production --latest
```

The configured submission creates a draft on the Internal testing track; it does not publish directly to Production.
