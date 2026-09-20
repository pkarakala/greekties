import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useMessageRecovery, setMessageRecoveryAccount } from '../../lib/message-recovery';
import { deferred } from '../helpers/message-db';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn() },
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));
jest.mock('../../lib/notifications', () => ({ unregisterPushToken: jest.fn() }));
jest.mock('../../lib/moderation', () => ({
  fetchBlockedIds: async () => new Set(),
  subscribeToBlockListChanges: () => () => {},
  applyBlockListChange: jest.fn(),
}));
let notify: (event: string, session: any) => void;
let auth: ReturnType<typeof useAuth>;
let recovery: ReturnType<typeof useMessageRecovery>;
let profileRead: () => any;
const approved = { user_id: 'me', chapter_id: 'chapter', status: 'approved' };
function Probe() {
  const state = useAuth();
  const recovered = useMessageRecovery('channel', 'room', state.session?.user.id ?? null);
  useEffect(() => { auth = state; recovery = recovered; }, [state, recovered]);
  return <Text>{recovered.draft}</Text>;
}
beforeEach(() => {
  setMessageRecoveryAccount(null);
  const db = supabase as any;
  profileRead = async () => ({ data: approved, error: null });
  db.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => profileRead() }) }) });
  db.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } }, error: null });
  db.auth.onAuthStateChange.mockImplementation((callback: typeof notify) => {
    notify = callback;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  db.channel.mockReturnValue({
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  });
});
afterEach(() => {
  jest.clearAllMocks();
});
describe('AuthProvider message recovery integration', () => {
  it('preserves a draft during same-account revalidation, errors, and token refresh', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(auth.profileState).toBe('ready'));
    act(() => {
      recovery.setDraft('Session draft');
    });
    const pending = deferred();
    profileRead = () => pending.promise;
    let refresh!: Promise<void>;
    act(() => {
      refresh = auth.refreshProfile();
    });
    expect(auth.profileState).toBe('loading');
    expect(recovery.draft).toBe('Session draft');
    await act(async () => {
      pending.resolve({ data: null, error: { message: 'offline' } });
      await refresh;
    });
    expect(auth.profileState).toBe('error');
    expect(recovery.draft).toBe('Session draft');
    profileRead = async () => ({ data: approved, error: null });
    await act(async () => {
      notify('TOKEN_REFRESHED', { user: { id: 'me' } });
    });
    expect(recovery.draft).toBe('Session draft');
    expect(auth.profileState).toBe('ready');
  });
  it.each(['rejected', 'missing', 'logout', 'switch'] as const)(
    'clears recovery when AuthProvider confirms %s',
    async (event) => {
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
      await waitFor(() => expect(auth.profileState).toBe('ready'));
      act(() => {
        recovery.setDraft('Private draft');
      });
      if (event === 'logout' || event === 'switch') {
        await act(async () => {
          notify(event, event === 'logout' ? null : { user: { id: 'another' } });
        });
      } else {
        profileRead = async () => ({
          data: event === 'missing' ? null : { ...approved, status: 'rejected' },
          error: null,
        });
        await act(async () => {
          await auth.refreshProfile();
        });
      }
      expect(recovery.draft).toBe('');
      profileRead = async () => ({ data: approved, error: null });
      await act(async () => {
        notify('SIGNED_IN', { user: { id: 'me' } });
      });
      expect(recovery.draft).toBe('');
    },
  );
});
