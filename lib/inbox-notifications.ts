import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

// In-app notification center data layer. Backed by the `notifications` table
// from supabase/migrations/app-v4-notifications.sql — rows are written ONLY
// by the send-push Edge Function (service role); the client reads, marks
// read, and deletes its own rows under RLS. The table may not exist in the
// live DB yet, so every call degrades gracefully — an empty inbox, never a
// raw Postgres error.

/** True for "relation does not exist" — the notifications migration hasn't run. */
function isMissingTable(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

export type NotificationType =
  | 'channel_message'
  | 'mentorship_request'
  | 'mentorship_accepted'
  | 'mentorship_message'
  | 'event_created'
  | 'report_update';

/** A row from `notifications` (see app-v4-notifications.sql). */
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app path ('/inbox/<id>'). Validate before routing — see app/notifications.tsx. */
  url: string | null;
  read: boolean;
  created_at: string;
}

/** Newest-first page size for the notification center. */
const PAGE_SIZE = 50;

export interface NotificationsData {
  loading: boolean;
  error: string | null;
  notifications: AppNotification[];
  unreadCount: number;
  reload: () => void;
  /** Mark every unread notification read (optimistic — reverts on failure). */
  markAllRead: () => Promise<void>;
  /** Mark one notification read (optimistic — reverts on failure). */
  markRead: (id: string) => Promise<void>;
}

/**
 * The signed-in user's latest notifications (newest first, last 50) plus the
 * unread count for the Home bell badge. Empty inbox (no error) when the
 * notifications migration hasn't run yet.
 */
export function useNotifications(userId: string | null): NotificationsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('notifications')
          .select('id, user_id, type, title, body, url, read, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (!mounted) return;
        if (err) {
          // Pre-migration: behave like an empty inbox, not a Postgres error.
          if (!isMissingTable(err.message)) {
            setError('Couldn’t load notifications. Pull to refresh.');
          }
          setNotifications([]);
        } else {
          setNotifications((data as AppNotification[]) ?? []);
        }
      } catch {
        if (!mounted) return;
        setError('Couldn’t load notifications. Pull to refresh.');
        setNotifications([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, nonce]);

  const markRead = useCallback(
    async (id: string) => {
      const target = notifications.find((n) => n.id === id);
      if (!target || target.read) return;
      // Optimistic — the row flips instantly; revert if the write fails.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      try {
        const { error: err } = await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', id);
        if (err && !isMissingTable(err.message)) {
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
          );
        }
      } catch {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
        );
      }
    },
    [notifications],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = new Set(
      notifications.filter((n) => !n.read).map((n) => n.id),
    );
    if (unreadIds.size === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const { error: err } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (err && !isMissingTable(err.message)) {
        setNotifications((prev) =>
          prev.map((n) => (unreadIds.has(n.id) ? { ...n, read: false } : n)),
        );
      }
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.has(n.id) ? { ...n, read: false } : n)),
      );
    }
  }, [userId, notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { loading, error, notifications, unreadCount, reload, markAllRead, markRead };
}
