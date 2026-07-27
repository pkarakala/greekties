import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { createChapter, fetchChapterInvite } from '../../lib/chapters';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
  supabaseConfigError: null,
}));

const mockedRpc = supabase.rpc as unknown as Mock<
  (fn: string, args?: Record<string, unknown>) => unknown
>;

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

function mockRpcResult(result: RpcResult) {
  mockedRpc.mockResolvedValue(result as never);
}

describe('createChapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const input = { name: 'Alpha Beta', designation: 'Gamma', university: 'State U' };

  it('returns the new chapter id on success', async () => {
    mockRpcResult({ data: 'chapter-uuid', error: null });
    await expect(createChapter(input)).resolves.toEqual({
      chapterId: 'chapter-uuid',
      error: null,
    });
    expect(mockedRpc).toHaveBeenCalledWith('create_chapter', {
      chapter_name: 'Alpha Beta',
      chapter_designation: 'Gamma',
      university_name: 'State U',
    });
  });

  it('trims inputs and nulls out blank optional fields', async () => {
    mockRpcResult({ data: 'chapter-uuid', error: null });
    await createChapter({ name: '  Alpha Beta  ', designation: '  ', university: '' });
    expect(mockedRpc).toHaveBeenCalledWith('create_chapter', {
      chapter_name: 'Alpha Beta',
      chapter_designation: null,
      university_name: null,
    });
  });

  it('maps a missing RPC (42883, pre-migration) to the friendly copy', async () => {
    mockRpcResult({
      data: null,
      error: { code: '42883', message: 'function create_chapter(text, text, text) does not exist' },
    });
    const { chapterId, error } = await createChapter(input);
    expect(chapterId).toBeNull();
    expect(error).toMatch(/isn’t available yet/);
    expect(error).not.toMatch(/function|does not exist/);
  });

  it('maps the PostgREST missing-function variant (PGRST202) the same way', async () => {
    mockRpcResult({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    });
    const { error } = await createChapter(input);
    expect(error).toMatch(/isn’t available yet/);
  });

  it('maps "already belong" RPC errors to the one-chapter message', async () => {
    mockRpcResult({
      data: null,
      error: { code: 'P0001', message: 'You already belong to a chapter' },
    });
    const { error } = await createChapter(input);
    expect(error).toMatch(/already belong to a chapter/);
    expect(error).toMatch(/only be in one chapter/);
  });

  it('maps any other error to the generic friendly copy', async () => {
    mockRpcResult({
      data: null,
      error: { code: '42501', message: 'permission denied for function create_chapter' },
    });
    const { error } = await createChapter(input);
    expect(error).toMatch(/Couldn’t create your chapter/);
    expect(error).not.toMatch(/permission denied/);
  });

  it('returns the generic friendly copy when the client throws', async () => {
    mockedRpc.mockRejectedValue(new Error('network down') as never);
    const { chapterId, error } = await createChapter(input);
    expect(chapterId).toBeNull();
    expect(error).toMatch(/Couldn’t create your chapter/);
  });

  it('returns a null chapterId (no error) when the RPC returns a non-string', async () => {
    mockRpcResult({ data: 42, error: null });
    await expect(createChapter(input)).resolves.toEqual({ chapterId: null, error: null });
  });
});

describe('fetchChapterInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the invite code on success', async () => {
    mockRpcResult({ data: 'INVITE42', error: null });
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: 'INVITE42',
      error: null,
    });
    expect(mockedRpc).toHaveBeenCalledWith('create_chapter_invite', {
      target_chapter_id: 'chapter-1',
    });
  });

  it('is silent (null code, no error) when the RPC is missing — pre-migration', async () => {
    mockRpcResult({
      data: null,
      error: { code: '42883', message: 'function create_chapter_invite(uuid) does not exist' },
    });
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: null,
      error: null,
    });
  });

  it('is silent for permission denials — non-admins just get no share link', async () => {
    mockRpcResult({
      data: null,
      error: { code: 'P0001', message: 'Only chapter admins can create invites' },
    });
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: null,
      error: null,
    });
  });

  it('is silent for RLS permission codes (42501) too', async () => {
    mockRpcResult({
      data: null,
      error: { code: '42501', message: 'permission denied for function create_chapter_invite' },
    });
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: null,
      error: null,
    });
  });

  it('surfaces a friendly error for other failures', async () => {
    mockRpcResult({ data: null, error: { message: 'network failure' } });
    const { code, error } = await fetchChapterInvite('chapter-1');
    expect(code).toBeNull();
    expect(error).toMatch(/Couldn’t fetch an invite link/);
    expect(error).not.toMatch(/network failure/);
  });

  it('treats an empty-string code as no invite available', async () => {
    mockRpcResult({ data: '', error: null });
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: null,
      error: null,
    });
  });

  it('is silent when the client throws', async () => {
    mockedRpc.mockRejectedValue(new Error('network down') as never);
    await expect(fetchChapterInvite('chapter-1')).resolves.toEqual({
      code: null,
      error: null,
    });
  });
});
