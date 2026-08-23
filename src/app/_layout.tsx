import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/constants/colors';
import { observeNotificationNavigation, registerCurrentDevicePresence } from '@/lib/push-notifications';
import { restoreSession } from '@/lib/session';

export default function RootLayout() {
  useEffect(() => {
    const subscription = observeNotificationNavigation();
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const updatePresence = () => void restoreSession()
      .then((session) => session ? registerCurrentDevicePresence(session.accessToken) : null)
      .catch(() => undefined);
    updatePresence();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updatePresence();
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="inbox" options={{ headerShown: false }} />
        <Stack.Screen name="inbox-message" options={{ headerShown: false }} />
        <Stack.Screen name="my-database" options={{ headerShown: false }} />
        <Stack.Screen name="learn" options={{ headerShown: false }} />
        <Stack.Screen name="play" options={{ headerShown: false }} />
        <Stack.Screen name="academy" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
