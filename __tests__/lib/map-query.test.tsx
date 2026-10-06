import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMapMembers } from '../../lib/queries';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
const eq = jest.fn<any>();
const select = jest.fn<any>();
let response: Promise<any>;
const member = {
  id: 'p',
  user_id: 'u',
  chapter_id: 'a',
  status: 'approved',
  city: 'Austin',
  membership_type: 'alumni',
  map_sharing_enabled: true,
  lat: 30,
  lng: -97,
};
const blocks = new Set<string>();
beforeEach(() => {
  jest.clearAllMocks();
  response = Promise.resolve({ data: [member], error: null });
  const chain: any = {
    select,
    eq,
    not: () => chain,
    then: (yes: any, no: any) => response.then(yes, no),
  };
  select.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  jest.mocked(supabase.from).mockReturnValue(chain);
});
it('queries only consenting approved alumni in the current chapter', async () => {
  const { result } = renderHook(() => useMapMembers('a', blocks));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(eq.mock.calls).toEqual([
    ['chapter_id', 'a'],
    ['status', 'approved'],
    ['membership_type', 'alumni'],
    ['map_sharing_enabled', true],
  ]);
  expect(select.mock.calls[0][0]).toContain('map_sharing_enabled');
  expect(result.current.members).toEqual([member]);
});
it('also filters malformed legacy rows, other chapters, and blocked members', async () => {
  response = Promise.resolve({
    data: [
      member,
      { ...member, id: 'legacy', map_sharing_enabled: undefined },
      { ...member, id: 'cross', chapter_id: 'b' },
      { ...member, id: 'blocked', user_id: 'blocked' },
      { ...member, id: 'active', membership_type: 'active' },
    ],
    error: null,
  });
  const blocked = new Set(['blocked']);
  const { result } = renderHook(() => useMapMembers('a', blocked));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.members).toEqual([member]);
});
it('clears cached pins while reloading and on missing consent schema', async () => {
  const { result } = renderHook(() => useMapMembers('a', blocks));
  await waitFor(() => expect(result.current.members).toHaveLength(1));
  let finish!: (value: any) => void;
  response = new Promise((resolve) => {
    finish = resolve;
  });
  act(() => result.current.reload());
  expect(result.current.members).toEqual([]);
  await act(async () => {
    finish({ data: null, error: { message: 'column map_sharing_enabled does not exist' } });
  });
  expect(result.current.members).toEqual([]);
  expect(result.current.error).toContain('unavailable');
});
it('handles network rejection without retaining pins or falling back', async () => {
  const { result } = renderHook(() => useMapMembers('a', blocks));
  await waitFor(() => expect(result.current.members).toHaveLength(1));
  response = Promise.reject(new Error('offline'));
  await act(async () => result.current.reload());
  expect(result.current.members).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(supabase.from).toHaveBeenCalledTimes(2);
});
it('discards an obsolete chapter response and clears on sign-out', async () => {
  let finish!: (value: any) => void;
  response = new Promise((resolve) => {
    finish = resolve;
  });
  const { result, rerender } = renderHook(
    ({ chapter }: { chapter: string | null }) => useMapMembers(chapter, blocks),
    { initialProps: { chapter: 'a' } as { chapter: string | null } },
  );
  response = Promise.resolve({ data: [], error: null });
  rerender({ chapter: 'b' });
  await act(async () => {
    finish({ data: [member], error: null });
  });
  expect(result.current.members).toEqual([]);
  rerender({ chapter: null });
  expect(result.current.members).toEqual([]);
});
