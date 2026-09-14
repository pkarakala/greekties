import { approvedRecipientIds } from '../../supabase/functions/send-push/recipients';
import { describe, expect, it, jest } from '@jest/globals';

function mockAdmin(input: {
  profiles: { data: unknown[] | null; error: Error | null };
  blocks?: { data: unknown[] | null; error: Error | null };
}) {
  return {
    from: jest.fn((table: string) => {
      const query = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        in: jest.fn(async () => input.profiles),
        or: jest.fn(async () => input.blocks ?? { data: [], error: null }),
      };
      if (table !== 'profiles' && table !== 'user_blocks') {
        throw new Error(`unexpected table ${table}`);
      }
      return query;
    }),
  };
}

describe('send-push approved recipient filtering', () => {
  it('deduplicates and only returns rows selected by the approved/chapter query', async () => {
    const admin = mockAdmin({
      profiles: { data: [{ user_id: 'approved-1' }], error: null },
    });
    await expect(approvedRecipientIds(admin, ['approved-1', 'pending-1', 'approved-1'], 'chapter-a'))
      .resolves.toEqual(['approved-1']);
    expect(admin.from).toHaveBeenCalledWith('profiles');
  });

  it('fails closed when the service-role lookup errors', async () => {
    const admin = mockAdmin({
      profiles: { data: null, error: new Error('lookup failed') },
    });
    await expect(approvedRecipientIds(admin, ['member-1'], 'chapter-a')).resolves.toEqual([]);
  });

  it('removes recipients blocked in either direction', async () => {
    const admin = mockAdmin({
      profiles: {
        data: [
          { user_id: 'actor-1' },
          { user_id: 'recipient-1' },
          { user_id: 'recipient-2' },
          { user_id: 'recipient-3' },
        ],
        error: null,
      },
      blocks: {
        data: [
          { blocker_id: 'actor-1', blocked_id: 'recipient-1' },
          { blocker_id: 'recipient-2', blocked_id: 'actor-1' },
        ],
        error: null,
      },
    });

    await expect(
      approvedRecipientIds(
        admin,
        ['recipient-1', 'recipient-2', 'recipient-3'],
        'chapter-a',
        'actor-1',
      ),
    ).resolves.toEqual(['recipient-3']);
    expect(admin.from).toHaveBeenCalledWith('user_blocks');
  });

  it('fails closed when the service-role block lookup errors', async () => {
    const admin = mockAdmin({
      profiles: {
        data: [{ user_id: 'actor-1' }, { user_id: 'recipient-1' }],
        error: null,
      },
      blocks: { data: null, error: new Error('block lookup failed') },
    });

    await expect(
      approvedRecipientIds(admin, ['recipient-1'], 'chapter-a', 'actor-1'),
    ).resolves.toEqual([]);
  });

  it('fails closed when the event actor is not approved in the same chapter', async () => {
    const admin = mockAdmin({
      profiles: { data: [{ user_id: 'recipient-1' }], error: null },
    });

    await expect(
      approvedRecipientIds(admin, ['recipient-1'], 'chapter-a', 'cross-chapter-actor'),
    ).resolves.toEqual([]);
    expect(admin.from).toHaveBeenCalledTimes(1);
  });
});
