import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { colors } from '@/constants/colors';
import {
  deleteInboxNotification,
  getSelectedInboxNotification,
  markInboxNotificationRead,
  type NotificationInboxItem,
} from '@/lib/notification-inbox';
import { getSession } from '@/lib/session';

function fullNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function InboxMessageScreen() {
  const [item, setItem] = useState<NotificationInboxItem | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadMessage() {
      const selected = await getSelectedInboxNotification();
      if (!active) return;
      setItem(selected);
      setLoaded(true);
      if (selected) {
        const session = await getSession();
        await markInboxNotificationRead(selected.id, session?.accessToken).catch(() => undefined);
      }
    }
    void loadMessage();
    return () => {
      active = false;
    };
  }, []);

  function confirmDelete() {
    if (!item) return;
    Alert.alert('Delete message?', 'This message will be removed from your inbox.', [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: () => void getSession()
          .then((session) => deleteInboxNotification(item, session?.accessToken))
          .then(() => router.back())
          .catch(() => Alert.alert('Could not delete message', 'Please try again.')),
        style: 'destructive',
        text: 'Delete',
      },
    ]);
  }

  return (
    <LinearGradient colors={['#160e0a', '#25170f', '#0b0706']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to inbox" onPress={() => router.back()} style={styles.iconButton}>
            <SymbolView name={{ android: 'arrow_back', ios: 'chevron.left', web: 'arrow_back' }} size={23} tintColor={colors.goldLight} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>INBOX MESSAGE</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>Message</Text>
          </View>
          <Pressable accessibilityLabel="Delete message" disabled={!item} onPress={confirmDelete} style={[styles.iconButton, !item && styles.disabled]}>
            <SymbolView name={{ android: 'delete', ios: 'trash', web: 'delete' }} size={21} tintColor={colors.sandstone} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          nestedScrollEnabled
          showsVerticalScrollIndicator>
          {item ? (
            <View style={styles.message}>
              <View style={styles.messageHeading}>
                <View style={styles.messageIcon}>
                  <SymbolView name={{ android: 'notifications', ios: 'bell.fill', web: 'notifications' }} size={22} tintColor={colors.goldLight} />
                </View>
                <View style={styles.titleCopy}>
                  <Text selectable style={styles.title}>{item.title}</Text>
                  <Text style={styles.time}>{fullNotificationTime(item.receivedAt)}</Text>
                </View>
              </View>

              <View style={styles.divider} />
              <Text selectable style={styles.body}>{item.body}</Text>

              {item.targetRoute ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(item.targetRoute as Href)}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                  <Text style={styles.actionText}>OPEN RELATED PAGE</Text>
                  <SymbolView name={{ android: 'arrow_forward', ios: 'arrow.right', web: 'arrow_forward' }} size={18} tintColor={colors.ink} />
                </Pressable>
              ) : null}
            </View>
          ) : loaded ? (
            <View style={styles.missingCard}>
              <Text style={styles.missingTitle}>Message unavailable</Text>
              <Text style={styles.missingBody}>This message is no longer stored on this device.</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.goldLight, borderRadius: 10, flexDirection: 'row', gap: 8, marginTop: 30, minHeight: 48, paddingHorizontal: 18 },
  actionText: { color: colors.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  background: { flex: 1 },
  body: { color: colors.cream, fontSize: 17, lineHeight: 28 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 48 },
  divider: { backgroundColor: colors.border, height: 1, marginBottom: 22, marginTop: 20 },
  disabled: { opacity: 0.35 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  header: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 78, paddingHorizontal: 12 },
  headerCopy: { flex: 1, paddingHorizontal: 10 },
  headerTitle: { color: colors.cream, fontSize: 23, fontWeight: '900' },
  iconButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  message: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, minHeight: '100%', padding: 20 },
  messageHeading: { alignItems: 'center', flexDirection: 'row' },
  messageIcon: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.14)', borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 13, width: 44 },
  missingBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  missingCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 10, marginTop: 48, padding: 28 },
  missingTitle: { color: colors.cream, fontSize: 20, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  safeArea: { flex: 1 },
  time: { color: colors.muted, fontSize: 11, marginTop: 5 },
  title: { color: colors.cream, fontSize: 21, fontWeight: '900', lineHeight: 27 },
  titleCopy: { flex: 1 },
});
