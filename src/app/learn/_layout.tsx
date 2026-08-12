import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { restoreSession } from '@/lib/session';

export default function LearnLayout() {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    void restoreSession().then((session) => {
      if (!session) {
        router.replace('/sign-in');
        return;
      }
      setSessionReady(true);
    });
  }, []);

  if (!sessionReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.goldLight} size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    flex: 1,
    justifyContent: 'center',
  },
});
