import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.ink },
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.goldLight,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen
          name="home"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="play" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
