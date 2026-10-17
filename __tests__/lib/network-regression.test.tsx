import { act, renderHook, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { useChapterMembers, fetchDirectoryPage } from '@/lib/directory';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { slice5Db } from '../helpers/slice5-db';
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
let db: ReturnType<typeof slice5Db>;
const blockedIds = new Set(['blocked']);
beforeEach(() => {
  db = slice5Db();
  jest.mocked(useAuth).mockReturnValue({
    session: { user: { id: 'self' } },
    profile: { chapter_id: 'chapter', status: 'approved' },
    blockedIds,
  } as any);
  jest.mocked(supabase.from).mockImplementation(db.from);
});
const member = (i: number, extra = {}) => ({
  id: `profile-${String(i).padStart(5, '0')}`,
  user_id: `user-${i}`,
  chapter_id: 'chapter',
  status: 'approved',
  name: `Member ${String(i).padStart(5, '0')}`,
  membership_type: 'alumni',
  open_to_mentor: true,
  is_hiring: true,
  industry: 'Technology',
  city: 'Santa Barbara',
  ...extra,
});
it('exhausts the real paged directory beyond 1000 with no duplicates, while excluding blocked and other scopes', async () => {
  db.rows.profiles = [
    ...Array.from({ length: 1207 }, (_, i) => member(i)),
    member(1300, { user_id: 'blocked' }),
    member(1301, { chapter_id: 'other' }),
    member(1302, { status: 'pending' }),
  ];
  const { result } = renderHook(() => useChapterMembers('chapter', blockedIds));
  await waitFor(() => expect(result.current.members).toHaveLength(50));
  let pages = 1;
  while (result.current.hasMore) {
    expect(pages++).toBeLessThan(30);
    await act(async () => result.current.loadMore());
  }
  expect(result.current.members).toHaveLength(1207);
  expect(new Set(result.current.members.map((p) => p.id)).size).toBe(1207);
  expect(result.current.members.at(-1)?.id).toBe('profile-01206');
  expect(
    result.current.members.some(
      (p) => p.user_id === 'blocked' || p.chapter_id !== 'chapter' || p.status !== 'approved',
    ),
  ).toBe(false);
});
it('combines membership, mentor, hiring, exact industry and literal city search without broadening scope', async () => {
  db.rows.profiles = [
    member(0),
    member(1, { membership_type: 'active' }),
    member(2, { open_to_mentor: false }),
    member(3, { is_hiring: false }),
    member(4, { industry: 'Finance' }),
    member(5, { city: 'Chicago' }),
    member(6, { user_id: 'blocked' }),
  ];
  const rows = await fetchDirectoryPage(
    'chapter',
    {
      membershipType: 'alumni',
      mentorsOnly: true,
      hiringOnly: true,
      industry: ' Technology ',
      query: 'Santa Barbara',
    },
    0,
    blockedIds,
  );
  expect(rows.map((p) => p.id)).toEqual(['profile-00000']);
});
