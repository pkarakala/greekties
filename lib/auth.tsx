import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { unregisterPushToken } from './notifications';
import {
  applyBlockListChange,
  fetchBlockedIds,
  subscribeToBlockListChanges,
} from './moderation';
import { createRealtimeTopic } from './realtime';
import type { Profile } from './types';

interface AuthState {
  /** Initial session check is in flight — gate the UI on this. */
  initializing: boolean;
  session: Session | null;
  /** The user's chapter profile, or null if not loaded / no profile yet. */
  profile: Profile | null;
  /** Auth user ids blocked by the signed-in user. RLS handles reverse blocks. */
  blockedIds: ReadonlySet<string>;
  refreshProfile: () => Promise<void>;
  refreshBlockedIds: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[auth] failed to load profile:', error.message);
    return null;
  }
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const loadProfileFor = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      return;
    }
    setProfile(await fetchProfile(s.user.id));
  }, []);

  useEffect(() => {
    let mounted = true;

    // Restore any session persisted in secure storage.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfileFor(data.session);
      if (mounted) setInitializing(false);
    });

    // Keep app state in sync with auth changes (login, logout, token refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) setBlockedIds(new Set());
      void loadProfileFor(newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileFor]);

  const refreshProfile = useCallback(() => loadProfileFor(session), [loadProfileFor, session]);

  const refreshBlockedIds = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setBlockedIds(await fetchBlockedIds(userId));
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let active = true;
    void fetchBlockedIds(userId).then((ids) => {
      if (active) setBlockedIds(ids);
    });
    const unsubscribeLocal = subscribeToBlockListChanges((change) => {
      if (change.blockerId !== userId) return;
      setBlockedIds((current) => applyBlockListChange(current, change));
    });

    const blockChanges = supabase
      .channel(createRealtimeTopic('blocks', userId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_blocks',
          filter: `blocker_id=eq.${userId}`,
        },
        () => void refreshBlockedIds(),
      )
      .subscribe();

    return () => {
      active = false;
      unsubscribeLocal();
      supabase.removeChannel(blockChanges);
    };
  }, [session?.user?.id, refreshBlockedIds]);

  const signOut = useCallback(async () => {
    // Remove this device's push token first — the delete needs the user's
    // RLS session, which is gone once signOut() completes.
    const userId = session?.user?.id;
    if (userId) await unregisterPushToken(userId);
    await supabase.auth.signOut();
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        initializing,
        session,
        profile,
        blockedIds,
        refreshProfile,
        refreshBlockedIds,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
