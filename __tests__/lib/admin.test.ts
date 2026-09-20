import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { setMemberMembershipType, reinstateMember } from '../../lib/admin';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  supabaseConfigError: null,
}));

const mockedRpc = supabase.rpc as unknown as Mock<
  (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
>;

describe('reinstateMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('uses only the authorized reinstatement RPC', async () => {
    mockedRpc.mockResolvedValue({ error: null });
    expect(await reinstateMember('removed')).toBeNull();
    expect(mockedRpc).toHaveBeenCalledWith('reinstate_chapter_member', {
      target_profile_id: 'removed',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('fails closed when V9 is missing or the actor is unauthorized', async () => {
    mockedRpc.mockResolvedValue({ error: { message: 'denied' } });
    expect(await reinstateMember('removed')).toMatch(/Couldn’t reinstate/);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('returns retryable transport failures', async () => {
    mockedRpc.mockRejectedValue(new Error('offline'));
    expect(await reinstateMember('removed')).toMatch(/connection/);
  });
});

describe('setMemberMembershipType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the controlled RPC instead of updating profiles directly', async () => {
    mockedRpc.mockResolvedValue({ error: null });

    await expect(setMemberMembershipType('profile-2', 'alumni')).resolves.toBeNull();
    expect(mockedRpc).toHaveBeenCalledWith('set_chapter_member_membership_type', {
      target_profile_id: 'profile-2',
      target_membership_type: 'alumni',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns the RPC rejection without attempting a fallback write', async () => {
    mockedRpc.mockResolvedValue({
      error: { message: 'Only approved chapter admins can change membership type.' },
    });

    await expect(setMemberMembershipType('profile-2', 'active')).resolves.toMatch(
      /Only approved chapter admins/,
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
