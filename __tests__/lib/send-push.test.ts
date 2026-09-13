import { approvedRecipientIds } from '../../supabase/functions/send-push/recipients';
import { describe, expect, it, jest } from '@jest/globals';

function mockAdmin(result: { data: unknown[] | null; error: Error | null }) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(async () => result),
  };
  return { from: jest.fn(() => query) };
}

describe('send-push approved recipient filtering', () => {
  it('deduplicates and only returns rows selected by the approved/chapter query', async () => {
    const admin = mockAdmin({ data: [{ user_id: 'approved-1' }], error: null });
    await expect(approvedRecipientIds(admin, ['approved-1', 'pending-1', 'approved-1'], 'chapter-a'))
      .resolves.toEqual(['approved-1']);
    expect(admin.from).toHaveBeenCalledWith('profiles');
  });

  it('fails closed when the service-role lookup errors', async () => {
    const admin = mockAdmin({ data: null, error: new Error('lookup failed') });
    await expect(approvedRecipientIds(admin, ['member-1'], 'chapter-a')).resolves.toEqual([]);
  });
});
