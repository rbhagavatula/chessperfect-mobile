import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { colors } from '@/constants/colors';

type ClassroomMeetingModalProps = {
  onHide: () => void;
  title: string;
  url: string;
  visible: boolean;
};

export function isEmbeddedJitsiUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'meet.chessperfect.com';
  } catch {
    return false;
  }
}

export function ClassroomMeetingModal({ onHide, title, url, visible }: ClassroomMeetingModalProps) {
  const { width } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [permissionReady, setPermissionReady] = useState(Platform.OS !== 'android');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [webError, setWebError] = useState(false);
  const source = useMemo(() => ({ uri: url }), [url]);

  useEffect(() => {
    Animated.timing(progress, {
      duration: 280,
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]).then((results) => {
      const allowed = Object.values(results).every((result) => result === PermissionsAndroid.RESULTS.GRANTED);
      setPermissionDenied(!allowed);
      setPermissionReady(true);
    });
  }, []);

  const translateX = useMemo(() => progress.interpolate({
    inputRange: [0, 1],
    outputRange: [width, 0],
  }), [progress, width]);

  return (
    <Animated.View
      accessibilityViewIsModal={false}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.drawer, { transform: [{ translateX }], width }]}>
      <View style={styles.handle}>
        <View style={styles.liveDot} />
        <View style={styles.headingCopy}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text style={styles.caption}>JITSI MEETING · FULL SCREEN</Text>
        </View>
        <Pressable
          accessibilityLabel="Hide meeting"
          onPress={onHide}
          style={({ pressed }) => [styles.hideButton, pressed && styles.pressed]}>
          <Text style={styles.hideText}>HIDE</Text>
          <SymbolView
            name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }}
            size={20}
            tintColor={colors.goldLight}
          />
        </Pressable>
      </View>

      <View style={styles.meetingBody}>
        {!permissionReady ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.goldLight} size="large" />
            <Text style={styles.stateText}>Preparing camera and microphone…</Text>
          </View>
        ) : webError ? (
          <View style={styles.state}>
            <Text style={styles.errorTitle}>Meeting could not be loaded</Text>
            <Text style={styles.stateText}>Check the connection, then collapse and restore the panel.</Text>
          </View>
        ) : (
          <WebView
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            onError={() => setWebError(true)}
            onHttpError={() => setWebError(true)}
            onShouldStartLoadWithRequest={(request) => {
              if (/^https:/i.test(request.url) || request.url === 'about:blank') return true;
              return false;
            }}
            originWhitelist={['https://*', 'about:blank']}
            setSupportMultipleWindows={false}
            sharedCookiesEnabled
            source={source}
            startInLoadingState
            style={styles.webView}
            thirdPartyCookiesEnabled
          />
        )}
        {permissionDenied ? (
          <View style={styles.permissionNotice}>
            <Text numberOfLines={2} style={styles.permissionText}>Camera or microphone permission is disabled.</Text>
            <Pressable onPress={() => void Linking.openSettings()}><Text style={styles.settingsText}>SETTINGS</Text></Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caption: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  drawer: { backgroundColor: colors.ink, borderColor: colors.gold, borderWidth: 1, bottom: 0, elevation: 24, left: 0, overflow: 'hidden', position: 'absolute', shadowColor: '#000', shadowOffset: { height: 0, width: -4 }, shadowOpacity: 0.5, shadowRadius: 12, top: 0, zIndex: 30 },
  errorTitle: { color: colors.cream, fontFamily: 'serif', fontSize: 17, fontWeight: '900' },
  handle: { alignItems: 'center', backgroundColor: '#08131d', borderBottomColor: 'rgba(201, 143, 28, 0.3)', borderBottomWidth: 1, flexDirection: 'row', gap: 10, height: 53, paddingHorizontal: 14 },
  headingCopy: { flex: 1, minWidth: 0 },
  hideButton: { alignItems: 'center', borderColor: colors.gold, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 34, paddingHorizontal: 10 },
  hideText: { color: colors.goldLight, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  liveDot: { backgroundColor: colors.success, borderRadius: 6, height: 12, width: 12 },
  meetingBody: { backgroundColor: '#111', flex: 1 },
  permissionNotice: { alignItems: 'center', backgroundColor: '#48261a', borderTopColor: colors.gold, borderTopWidth: 1, bottom: 0, flexDirection: 'row', gap: 10, left: 0, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', right: 0 },
  permissionText: { color: colors.cream, flex: 1, fontSize: 9 },
  pressed: { opacity: 0.76 },
  settingsText: { color: colors.goldLight, fontSize: 8, fontWeight: '900' },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  stateText: { color: colors.sandstone, fontSize: 10, lineHeight: 15, marginTop: 9, textAlign: 'center' },
  title: { color: colors.cream, fontFamily: 'serif', fontSize: 13, fontWeight: '900' },
  webView: { backgroundColor: '#111', flex: 1 },
});
