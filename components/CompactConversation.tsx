import { useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  useWindowDimensions,
  type FlatListProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import type { TextMessage } from '@/lib/message-send';
import { spacing } from '@/theme';
import { colors, typography } from '@/theme/chats';

export function ConversationHeader({
  title,
  subtitle,
  onBack,
  onProfile,
  onRefresh,
  refreshing = false,
  group = false,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onProfile?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  group?: boolean;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={styles.control}
      >
        <Ionicons name="chevron-back" size={22} color={colors.navy} />
      </Pressable>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {group && (
        <View style={[styles.control, styles.groupMark]}>
          <Ionicons name="people-outline" size={21} color={colors.blue} />
        </View>
      )}
      {onRefresh && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh conversation"
          accessibilityState={{ disabled: refreshing }}
          disabled={refreshing}
          onPress={onRefresh}
          style={styles.control}
        >
          <Ionicons name="refresh-outline" size={21} color={colors.blue} />
        </Pressable>
      )}
      {onProfile && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${title}'s profile`}
          onPress={onProfile}
          style={styles.control}
        >
          <Ionicons name="person-outline" size={21} color={colors.blue} />
        </Pressable>
      )}
    </View>
  );
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isFinite(+date) ? date.toLocaleDateString() : '';
}

/** Group only adjacent messages from the same sender, on the same local day,
 * within five minutes. Deleting/filtering/paging naturally recomputes clusters. */
export function startsMessageCluster(message: TextMessage, previous?: TextMessage) {
  return (
    !previous ||
    previous.sender_id !== message.sender_id ||
    dayKey(previous.created_at) !== dayKey(message.created_at) ||
    Math.abs(+new Date(message.created_at) - +new Date(previous.created_at)) > 5 * 60 * 1000
  );
}

export function CompactMessage({
  message,
  previous,
  mine,
  name,
  avatar,
  onProfile,
  onActions,
  children,
  reactions,
}: {
  message: TextMessage;
  previous?: TextMessage;
  mine: boolean;
  name: string;
  avatar?: string | null;
  onProfile?: () => void;
  onActions?: () => void;
  children: ReactNode;
  reactions?: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const start = startsMessageCluster(message, previous);
  const date = new Date(message.created_at);
  const valid = Number.isFinite(+date);
  const timestamp = valid
    ? date.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })
    : 'Time unavailable';
  const sender = mine ? 'You' : name;
  const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
  return (
    <View>
      {newDay && valid && (
        <View style={styles.dateRow}>
          <View style={styles.rule} />
          <Text style={styles.date}>
            {date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <View style={styles.rule} />
        </View>
      )}
      <View style={[styles.message, start && styles.clusterStart]}>
        <View style={{ width: Math.max(48, 28 * fontScale), marginRight: spacing.sm }}>
          {start &&
            (onProfile ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${name}'s profile`}
                onPress={onProfile}
                style={styles.avatarControl}
              >
                <Avatar tone="home" uri={avatar} name={name} size="xs" />
              </Pressable>
            ) : (
              <View style={styles.avatarControl}>
                <Avatar tone="home" uri={avatar} name={name} size="xs" />
              </View>
            ))}
        </View>
        <View style={[styles.messageBody, mine && styles.ownBody]}>
          {start && (
            <View style={styles.byline}>
              <Text style={[styles.sender, mine && styles.ownSender]}>{sender}</Text>
              <Text accessibilityLabel={timestamp} style={[styles.time, mine && styles.ownTime]}>
                {valid ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}
              </Text>
            </View>
          )}
          {!start && (
            <Text accessibilityLabel={timestamp} style={styles.accessibleTime}>
              {timestamp}
            </Text>
          )}
          {onActions ? (
            <Pressable onLongPress={onActions} accessible={false}>
              {children}
            </Pressable>
          ) : (
            <View>{children}</View>
          )}
          {reactions}
        </View>
        {onActions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message actions from ${sender}`}
            onPress={onActions}
            onLongPress={onActions}
            style={styles.control}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.noActions} />
        )}
      </View>
    </View>
  );
}

/** A real-history jump, not an unread indicator. Paging preserves the viewport;
 * new arrivals scroll only while the reader is already near the bottom. */
export function ConversationList<T extends TextMessage>({
  messages,
  renderItem,
  header,
  empty,
  hasMore = false,
  loadingEarlier = false,
  loadEarlier,
  onRefresh,
  refreshing = false,
}: {
  messages: T[];
  renderItem: FlatListProps<T>['renderItem'];
  header?: ReactNode;
  empty: ReactNode;
  hasMore?: boolean;
  loadingEarlier?: boolean;
  loadEarlier?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const list = useRef<FlatList<T>>(null);
  const nearBottom = useRef(true);
  const newest = useRef<string | null>(null);
  // Content/layout can change across virtualization batches. Keep positioning
  // through those passes until the reader explicitly takes control.
  const positionAtEnd = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const jump = () => {
    positionAtEnd.current = true;
    nearBottom.current = true;
    setShowLatest(false);
    // Use measured scroll content, including bottom padding, rather than the
    // virtualized list's estimated last-cell frame.
    const responder = list.current?.getScrollResponder();
    if (responder && 'scrollToEnd' in responder && typeof responder.scrollToEnd === 'function') {
      responder.scrollToEnd({ animated: false });
    } else {
      list.current?.scrollToEnd({ animated: false });
    }
  };
  const takeControl = () => {
    positionAtEnd.current = false;
    nearBottom.current = false;
  };
  return (
    <View style={styles.listContainer}>
      <FlatList
        testID="conversation-messages"
        ref={list}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(message) => message.id}
        contentContainerStyle={styles.list}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        scrollEventThrottle={16}
        onScrollBeginDrag={takeControl}
        onTouchMove={takeControl}
        {...(Platform.OS === 'web'
          ? {
              onWheel: takeControl,
              onPointerDown: takeControl,
              onKeyDown: (event: { key: string }) => {
                if (
                  ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
                    event.key,
                  )
                )
                  takeControl();
              },
            }
          : {})}
        onLayout={() => {
          if (positionAtEnd.current && messages.length) jump();
        }}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 72;
          if (!positionAtEnd.current) setShowLatest(!nearBottom.current);
        }}
        onContentSizeChange={() => {
          const id = messages[messages.length - 1]?.id ?? null;
          if (!id) return;
          const changed = id !== newest.current;
          newest.current = id;
          if (positionAtEnd.current || (changed && nearBottom.current)) jump();
          else if (changed) setShowLatest(true);
        }}
        ListHeaderComponent={
          <View>
            {header}
            {hasMore && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Load earlier messages"
                accessibilityState={{ disabled: loadingEarlier }}
                disabled={loadingEarlier}
                onPress={() => {
                  takeControl();
                  loadEarlier?.();
                }}
                style={styles.earlier}
              >
                {loadingEarlier ? (
                  <ActivityIndicator
                    color={colors.blue}
                    accessibilityLabel="Loading earlier messages"
                  />
                ) : (
                  <Text style={styles.earlierText}>Load earlier messages</Text>
                )}
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={<View>{empty}</View>}
      />
      {showLatest && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jump to latest messages"
          onPress={jump}
          style={styles.latest}
        >
          <Ionicons name="arrow-down" size={18} color={colors.blue} />
          <Text style={styles.earlierText}>Latest messages</Text>
        </Pressable>
      )}
    </View>
  );
}

export const conversationStyles = StyleSheet.create({
  text: { ...typography.body, color: colors.textPrimary },
  ownText: { color: colors.surface },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 6,
    borderBottomColor: colors.gold,
    backgroundColor: colors.surface,
  },
  control: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  groupMark: { backgroundColor: colors.gold, borderRadius: 6 },
  heading: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: spacing.xs },
  title: { ...typography.h3, fontSize: 20, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  message: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 44 },
  clusterStart: { marginTop: spacing.md },
  avatarControl: { minWidth: 48, minHeight: 48, justifyContent: 'flex-start', paddingTop: 2 },
  messageBody: { flex: 1, minWidth: 0, paddingTop: 2, paddingBottom: spacing.xs },
  ownBody: { backgroundColor: colors.blue, padding: 8, borderRadius: 8, marginBottom: 4 },
  ownTime: { color: colors.surface },
  byline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sender: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  ownSender: { color: colors.surface },
  time: { ...typography.caption, color: colors.textSecondary },
  // Keep clustered timestamps in accessibility traversal without adding a line.
  accessibleTime: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  noActions: { width: spacing.sm },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  rule: { width: 24, height: 1, backgroundColor: colors.border },
  date: { ...typography.caption, color: colors.textSecondary },
  listContainer: { flex: 1, backgroundColor: colors.surface },
  list: {
    paddingHorizontal: 18,
    paddingBottom: spacing.lg,
    flexGrow: 1,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  earlier: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  earlierText: { ...typography.bodySmall, color: colors.blue, fontWeight: '600' },
  latest: {
    minHeight: 48,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldLight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
