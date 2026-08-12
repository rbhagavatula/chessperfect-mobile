# ChessPerfect Mobile

Shared React Native application for Android and iOS, built with Expo SDK 57 and TypeScript.

The first delivery target is Android. The codebase remains platform-neutral so iOS can follow without a rewrite.

## Current slice

- Branded welcome experience
- ChessPerfect username/password authentication
- Encrypted access and refresh token storage on Android/iOS
- Mobile dashboard shell for Play, Train, Analyze, and Academy modules
- Environment-specific Spring API base URL

## Requirements

- Node.js 22.13 or newer
- npm
- Android Studio and an Android emulator, or an Android device with Expo Go

## Run on Android

```powershell
npm install
npm run android
```

If `adb` is unavailable, finish the Android Studio SDK setup or scan the Expo QR code from a physical Android device.

## API environments

Production (`https://chessperfect.com`) is the default. To use another environment, create `.env.local`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://mychessschool.com
```

For a backend running on the development computer, use `http://10.0.2.2:8080` from the standard Android emulator. A physical device must use the computer's LAN address.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npx expo-doctor
```
