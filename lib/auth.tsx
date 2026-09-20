import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { unregisterPushToken } from './notifications';
import { applyBlockListChange, fetchBlockedIds, subscribeToBlockListChanges } from './moderation';
import { createRealtimeTopic } from './realtime';
import type { Profile } from './types';
import { parseRecoveryLink } from './auth-links';
import { setMessageRecoveryAccount, confirmMessageRecoveryMembership } from './message-recovery';

interface AuthState {
  /** Initial session check is in flight — gate the UI on this. */
  initializing: boolean;
  session: Session | null;
  /** The user's chapter profile, or null if not loaded / no profile yet. */
  profile: Profile | null;
  profileState: 'loading' | 'error' | 'missing' | 'ready';
  authError: string | null;
  retrySession: () => Promise<void>;
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
    throw error;
  }
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const [profileState, setProfileState] = useState<AuthState['profileState']>('loading');
  const [authError, setAuthError] = useState<string | null>(null);
  const currentSession = useRef<Session | null>(null);
  const generation = useRef(0);
  const authGeneration = useRef(0);
  const mounted = useRef(true);

  const loadProfileFor = useCallback(async (s: Session | null) => {
    const request = ++generation.current;
    // Keep the last result for this identity while revalidating. ScreenAccess
    // hides (but retains) an approved subtree until this read succeeds again.
    setProfile((current) => (current?.user_id === s?.user.id ? current : null));
    setProfileState(s ? 'loading' : 'missing');
    if (!s?.user) return;
    try {
      const next = await fetchProfile(s.user.id);
      if (!mounted.current || request !== generation.current) return;
      confirmMessageRecoveryMembership(s.user.id, next?.status === 'approved' ? next.chapter_id : null);
      setProfile(next);
      setProfileState(next ? 'ready' : 'missing');
    } catch {
      if (!mounted.current || request !== generation.current) return;
      setProfileState('error');
    }
  }, []);

  const acceptSession = useCallback(
    (next: Session | null) => {
      const sameAccount = !!next && currentSession.current?.user.id === next.user.id;
      setMessageRecoveryAccount(next?.user.id ?? null);
      currentSession.current = next;
      setSession(next);
      setAuthError(null);
      if (!sameAccount) setBlockedIds(new Set());
      // Start outside Supabase's synchronous auth callback to avoid auth-lock
      // reentrancy. Account changes invalidate private state immediately;
      // same-account events revalidate without throwing away drafts/blocks.
      ++generation.current;
      if (!sameAccount) setProfile(null);
      setProfileState(next ? 'loading' : 'missing');
      const version = authGeneration.current;
      void Promise.resolve().then(() => {
        if (mounted.current && version === authGeneration.current) void loadProfileFor(next);
      });
      setInitializing(false);
    },
    [loadProfileFor],
  );

  const retrySession = useCallback(async () => {
    const request = ++authGeneration.current;
    setInitializing(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted.current || request !== authGeneration.current) return;
      if (error) throw error;
      acceptSession(data.session);
    } catch {
      if (!mounted.current || request !== authGeneration.current) return;
      setAuthError('Couldn’t restore your session. Try again or sign out.');
      setInitializing(false);
    }
  }, [acceptSession]);

  useEffect(() => {
    mounted.current = true;
    // Hydrate the external auth store; block children until restoration ends.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void retrySession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      ++authGeneration.current;
      acceptSession(next);
    });
    return () => {
      mounted.current = false;
      // These are request counters, not DOM refs: invalidate the latest work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++authGeneration.current;
      sub.subscription.unsubscribe();
    };
  }, [acceptSession, retrySession]);

  const refreshProfile = useCallback(
    () => loadProfileFor(currentSession.current),
    [loadProfileFor],
  );

  useEffect(() => {
    let active = true;
    const seen = new Set<string>();
    async function recover(url: string | null) {
      if (!url || seen.has(url)) return;
      const credentials = parseRecoveryLink(url);
      if (!credentials) return;
      seen.add(url);
      try {
        const result =
          'code' in credentials
            ? await supabase.auth.exchangeCodeForSession(credentials.code)
            : await supabase.auth.setSession(credentials);
        if (result.error) throw result.error;
        // Remove tokens from browser history after exchange. Never persist
        // recovery links in the invitation store.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        if (active)
          setAuthError(
            'This password reset link could not be verified. Request a new link and try again.',
          );
      }
    }
    const listener = Linking.addEventListener('url', ({ url }) => {
      void recover(url);
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') void recover(window.location.href);
    else
      void Linking.getInitialURL()
        .then(recover)
        .catch(() => {});
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && currentSession.current) void refreshProfile();
    });
    const onFocus = () => {
      if (currentSession.current) void refreshProfile();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined')
      window.addEventListener('focus', onFocus);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined')
        window.removeEventListener('focus', onFocus);
    };
  }, [refreshProfile]);

  const refreshBlockedIds = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const ids = await fetchBlockedIds(userId);
    if (mounted.current && currentSession.current?.user.id === userId) setBlockedIds(ids);
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        initializing,
        session,
        profile,
        profileState,
        authError,
        retrySession,
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
