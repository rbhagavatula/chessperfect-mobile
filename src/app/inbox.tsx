import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CivBackdrop } from '@/components/civ-ornament';
import { colors } from '@/constants/colors';
import {
  clearNotificationInbox,
  deleteInboxNotification,
  getNotificationInbox,
  selectInboxNotification,
  syncNotificationInbox,
  type NotificationInboxItem,
} from '@/lib/notification-inbox';
import { getSession } from '@/lib/session';

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

export default function InboxScreen() {
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInbox = useCallback(async () => {
    const session = await getSession();
    const notifications = session
      ? await syncNotificationInbox(session.accessToken).then((result) => result.items).catch(getNotificationInbox)
      : await getNotificationInbox();
    setItems(notifications);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadInbox();
  }, [loadInbox]));

  function confirmClear() {
    Alert.alert('Clear inbox?', 'This removes all notifications stored on this device.', [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: () => void getSession()
          .then((session) => clearNotificationInbox(session?.accessToken))
          .then(() => setItems([]))
          .catch(() => Alert.alert('Could not clear inbox', 'Please try again.')),
        style: 'destructive',
        text: 'Clear',
      },
    ]);
  }

  function confirmDelete(item: NotificationInboxItem, swipeable?: SwipeableMethods) {
    swipeable?.close();
    Alert.alert('Delete message?', 'This message will be removed from your inbox.', [
      { style: 'cancel', text: 'Cancel' },
      {
        onPress: () => void getSession()
          .then((session) => deleteInboxNotification(item, session?.accessToken))
          .then(() => setItems((current) => current.filter((candidate) => candidate.id !== item.id)))
          .catch(() => Alert.alert('Could not delete message', 'Please try again.')),
        style: 'destructive',
        text: 'Delete',
      },
    ]);
  }

  async function openMessage(id: string) {
    await selectInboxNotification(id);
    router.push('/inbox-message' as Href);
  }

  return (
    <LinearGradient colors={['#160e0a', '#25170f', '#0b0706']} style={styles.background}>
      <CivBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.iconButton}>
            <SymbolView name={{ android: 'arrow_back', ios: 'chevron.left', web: 'arrow_back' }} size={23} tintColor={colors.goldLight} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>MESSAGE CENTER</Text>
            <Text style={styles.title}>Inbox</Text>
          </View>
          <Pressable accessibilityLabel="Clear inbox" disabled={!items.length} onPress={confirmClear} style={[styles.iconButton, !items.length && styles.disabled]}>
            <SymbolView name={{ android: 'delete', ios: 'trash', web: 'delete' }} size={21} tintColor={colors.sandstone} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!loading && !items.length ? (
            <View style={styles.emptyCard}>
              <SymbolView name={{ android: 'mail', ios: 'tray', web: 'mail' }} size={42} tintColor={colors.gold} />
              <Text style={styles.emptyTitle}>Your inbox is ready</Text>
              <Text style={styles.emptyBody}>Class reminders, game invitations and important ChessPerfect updates will appear here.</Text>
            </View>
          ) : null}

          {items.map((item) => (
            <ReanimatedSwipeable
              containerStyle={styles.swipeRow}
              dragOffsetFromRightEdge={12}
              friction={1.7}
              key={item.id}
              overshootRight={false}
              renderRightActions={(_progress, _translation, swipeable) => (
                <Pressable
                  accessibilityHint="Deletes this message"
                  accessibilityLabel={`Delete ${item.title}`}
                  accessibilityRole="button"
                  onPress={() => confirmDelete(item, swipeable)}
                  style={({ pressed }) => [styles.swipeDeleteButton, pressed && styles.swipeDeletePressed]}>
                  <SymbolView name={{ android: 'delete', ios: 'trash.fill', web: 'delete' }} size={22} tintColor="#fff7f4" />
                  <Text style={styles.swipeDeleteText}>Delete</Text>
                </Pressable>
              )}
              rightThreshold={44}>
              <View style={styles.messageCard}>
                {!item.readAt ? <View accessibilityLabel="Unread" style={styles.unreadDot} /> : null}
                <Pressable
                  accessibilityHint="Opens the complete message. Swipe left for delete."
                  accessibilityLabel={`${item.title}. ${item.body}`}
                  accessibilityRole="button"
                  onPress={() => void openMessage(item.id)}
                  style={({ pressed }) => [styles.messageMain, pressed && styles.pressed]}>
                  <View style={styles.messageIcon}>
                    <SymbolView name={{ android: 'notifications', ios: 'bell.fill', web: 'notifications' }} size={20} tintColor={colors.goldLight} />
                  </View>
                  <View style={styles.messageCopy}>
                    <View style={styles.messageHeading}>
                      <Text numberOfLines={1} style={styles.messageTitle}>{item.title}</Text>
                      <Text style={styles.messageTime}>{notificationTime(item.receivedAt)}</Text>
                    </View>
                    <Text ellipsizeMode="tail" numberOfLines={2} style={styles.messageBody}>{item.body}</Text>
                  </View>
                  <SymbolView name={{ android: 'chevron_right', ios: 'chevron.right', web: 'chevron_right' }} size={18} tintColor={colors.gold} />
                </Pressable>
              </View>
            </ReanimatedSwipeable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  content: { gap: 12, padding: 16, paddingBottom: 34 },
  disabled: { opacity: 0.35 },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 300, textAlign: 'center' },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 12, marginTop: 48, padding: 30 },
  emptyTitle: { color: colors.cream, fontSize: 20, fontWeight: '800' },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  header: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', minHeight: 78, paddingHorizontal: 12 },
  headerCopy: { flex: 1, paddingHorizontal: 10 },
  iconButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  messageBody: { color: colors.sandstone, fontSize: 14, height: 42, lineHeight: 21, marginTop: 6 },
  messageCard: { alignItems: 'stretch', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 102, overflow: 'hidden' },
  messageCopy: { flex: 1, minWidth: 0 },
  messageHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  messageIcon: { alignItems: 'center', backgroundColor: 'rgba(201,143,28,0.14)', borderRadius: 19, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  messageTime: { color: colors.muted, fontSize: 10 },
  messageTitle: { color: colors.cream, flex: 1, fontSize: 15, fontWeight: '800' },
  messageMain: { alignItems: 'center', flex: 1, flexDirection: 'row', padding: 14 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  safeArea: { flex: 1 },
  swipeDeleteButton: { alignItems: 'center', backgroundColor: '#b42318', gap: 5, justifyContent: 'center', width: 88 },
  swipeDeletePressed: { backgroundColor: '#8f1d15' },
  swipeDeleteText: { color: '#fff7f4', fontSize: 12, fontWeight: '800' },
  swipeRow: { borderRadius: 14, overflow: 'hidden' },
  title: { color: colors.cream, fontSize: 25, fontWeight: '900' },
  unreadDot: { backgroundColor: colors.goldLight, borderRadius: 4, height: 8, left: 7, position: 'absolute', top: 8, width: 8, zIndex: 2 },
});
