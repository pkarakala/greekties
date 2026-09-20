import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { joinChapterWithInvite, resolveChapterInvite } from '../../lib/invite';
import { fetchChapterInvite } from '../../lib/chapters';
import { supabase } from '../../lib/supabase';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
  supabaseConfigError: null,
}));

const mockedRpc = supabase.rpc as unknown as Mock<
  (fn: string, args?: Record<string, unknown>) => unknown
>;

describe('secure invite RPCs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a legitimate code through the preview RPC', async () => {
    mockedRpc.mockResolvedValue({
      data: [
        {
          chapter_id: 'chapter-a',
          chapter_name: 'Alpha Beta',
          chapter_designation: 'Gamma',
          chapter_university: 'State U',
        },
      ],
      error: null,
    } as never);

    await expect(resolveChapterInvite('  INVITE42  ')).resolves.toEqual({
      kind: 'valid',
      chapter: {
        id: 'chapter-a',
        name: 'Alpha Beta',
        designation: 'Gamma',
        university: 'State U',
      },
    });
    expect(mockedRpc).toHaveBeenCalledWith('resolve_chapter_invite', {
      invite_code: 'invite42',
    });
  });

  it('fails closed when invite preview is unavailable', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function missing from schema cache' },
    } as never);
    await expect(resolveChapterInvite('invite42')).resolves.toEqual({ kind: 'error' });
  });

  it('joins only through join_chapter', async () => {
    mockedRpc.mockResolvedValue({ data: 'chapter-a', error: null } as never);
    await expect(joinChapterWithInvite(' INVITE42 ')).resolves.toEqual({ error: null });
    expect(mockedRpc).toHaveBeenCalledWith('join_chapter', { invite_code: 'invite42' });
  });

  it('does not create a profile when the secure join RPC is missing', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function missing from schema cache' },
    } as never);
    const result = await joinChapterWithInvite('invite42');
    expect(result.error).toMatch(/Secure chapter joining isn’t available/);
    expect(mockedRpc).toHaveBeenCalledTimes(1);
    expect((supabase as unknown as { from?: unknown }).from).toBeUndefined();
  });

  it('returns invite validation errors without falling back', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'This invite code has expired.' },
    } as never);
    await expect(joinChapterWithInvite('expired')).resolves.toEqual({
      error: 'This invite code has expired.',
    });
  });

  it('does not turn invite RPC failure into a chapter-id fallback', async () => {
    mockedRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'function missing from schema cache' },
    } as never);
    await expect(fetchChapterInvite('chapter-a')).resolves.toEqual({ code: null, error: null });
    expect(mockedRpc).toHaveBeenCalledWith('create_chapter_invite', {
      target_chapter_id: 'chapter-a',
    });
    expect((supabase as unknown as { from?: unknown }).from).toBeUndefined();
  });
});
