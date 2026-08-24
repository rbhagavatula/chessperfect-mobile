# Data safety worksheet

This worksheet is an implementation inventory for the Play Console declaration. Confirm it against the final production build, backend logs and every third-party SDK before submitting.

## Data collected

| Play data type | Purpose | Required? | Shared externally? | Notes |
|---|---|---:|---:|---|
| Name / display name | Account management, academy participation | Optional | No | User profile and classroom identity. |
| Email address | Account creation, verification, support and service messages | Required | Service providers only | Backend/email delivery processor may process it. |
| Phone number | Profile and academy administration | Optional | No | Not required for a free player account. |
| User IDs / username | Authentication, game identity, academy activity | Required | No | Public username can appear in games and leaderboards. |
| Address / location | Profile or academy billing administration | Optional | No | Only when supplied. |
| Purchase history | Player plans, academy fees, entitlements and reconciliation | Conditional | Google Play for player plans; ChessPerfect backend for academy fee records | Player purchase tokens are verified server-side. Academy payment credentials are entered only on the hosted Razorpay checkout and are not collected by the native app. |
| App interactions | Games, moves, puzzles, studies, attendance and feature activity | Required | No | Needed to deliver the chess and academy services. |
| Other user-generated content | PGN/FEN, studies, chats/class activity where enabled | Conditional | Other class/game participants | Scope depends on the feature used. |
| Diagnostics | Reliability, security and troubleshooting logs | Required | Hosting/service providers only | Confirm whether crash analytics SDKs are added before release. |
| Device or other IDs | Authentication/session security and Google Play purchase verification | Required | Google Play/service providers | No advertising use. |
| Photos or videos | Camera during live class | Optional | Meeting participants/provider | Camera is permission-gated and used only when the user joins with video. |
| Audio | Microphone during live class | Optional | Meeting participants/provider | Microphone is permission-gated and used only during live class. |

## Security and handling answers

- Data is encrypted in transit: **Yes** (HTTPS/WSS production endpoints).
- Users can request deletion: **Yes** — in app at **My Account > Privacy**, and on the web at `https://chessperfect.com/account-deletion`.
- Account deletion disables access immediately and begins profile anonymisation. Limited transaction, legal, fraud-prevention, game-integrity or classroom records may be retained when required.
- Data is not sold and is not used for third-party advertising.
- Children / target audience answer must match the final audience selection and privacy policy. Do not claim Families compliance without completing the separate Families review.

## Final verification before answering Play Console

1. Review the production dependency tree for analytics, crash reporting and advertising SDKs.
2. Verify Jitsi/meeting deployment data handling and its privacy terms.
3. Verify production log retention and backup deletion periods.
4. Ensure the deployed privacy policy names the same categories and purposes.
