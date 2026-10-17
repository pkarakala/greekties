import { describe, it, expect, jest } from '@jest/globals';
import {
  handleDeleteAccount,
  type DeletionBackend,
} from '../../supabase/functions/delete-account/handler';
const uid = '11111111-1111-4111-8111-111111111111';
const request = (body = '', authorization = 'Bearer user-token', query = '') =>
  ({
    method: 'POST',
    url: 'http://localhost/delete-account' + query,
    headers: { get: () => authorization },
    text: async () => body,
  }) as unknown as Request;
function backend() {
  return {
    authenticate: jest
      .fn<DeletionBackend['authenticate']>()
      .mockResolvedValue({ data: { id: uid }, error: null }),
    begin: jest.fn<DeletionBackend['begin']>().mockResolvedValue({ data: null, error: null }),
    list: jest.fn<DeletionBackend['list']>().mockResolvedValue({ data: [], error: null }),
    remove: jest.fn<DeletionBackend['remove']>().mockResolvedValue({ data: [], error: null }),
    finish: jest.fn<DeletionBackend['finish']>().mockResolvedValue({ data: null, error: null }),
  };
}
describe('server-owned account deletion', () => {
  it('derives identity from live Auth and fences even accounts with no listed photo', async () => {
    const b = backend();
    const r = await handleDeleteAccount(request(), b);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    expect(b.authenticate).toHaveBeenCalledWith('user-token');
    expect(b.begin).toHaveBeenCalledWith(uid);
    expect(b.finish).toHaveBeenCalledWith(uid);
    expect(b.begin.mock.invocationCallOrder[0]).toBeLessThan(b.list.mock.invocationCallOrder[0]);
  });
  it.each(['', 'Basic password'])('rejects missing or invalid bearer header %s', async (header) => {
    const b = backend();
    expect((await handleDeleteAccount(request('', header), b)).status).toBe(401);
    expect(b.begin).not.toHaveBeenCalled();
  });
  it('rejects an expired/deleted user returned by Auth', async () => {
    const b = backend();
    b.authenticate.mockResolvedValue({ data: null, error: new Error('invalid') });
    expect((await handleDeleteAccount(request(), b)).status).toBe(401);
    expect(b.begin).not.toHaveBeenCalled();
  });
  it.each(['{"userId":"victim"}', '{"paths":["victim/avatar.jpg"]}'])(
    'rejects caller-supplied targets %s',
    async (body) => {
      const b = backend();
      expect((await handleDeleteAccount(request(body), b)).status).toBe(400);
      expect(b.begin).not.toHaveBeenCalled();
    },
  );
  it('rejects query targets as well', async () => {
    const b = backend();
    expect(
      (await handleDeleteAccount(request('', 'Bearer user-token', '?uid=victim'), b)).status,
    ).toBe(400);
    expect(b.begin).not.toHaveBeenCalled();
  });
  it('paginates before deletion, traverses nested folders and batches removals', async () => {
    const b = backend();
    b.list.mockImplementation(async (prefix, offset) => ({
      data:
        prefix === uid
          ? offset === 0
            ? [
                ...Array.from({ length: 99 }, (_, i) => ({ name: `file${i}`, id: String(i) })),
                { name: 'nested', id: null },
              ]
            : [{ name: 'last', id: 'last' }]
          : [{ name: 'orphan.jpg', id: 'nested-file' }],
      error: null,
    }));
    expect((await handleDeleteAccount(request(), b)).status).toBe(200);
    expect(b.list.mock.calls).toEqual([
      [uid, 0, 100],
      [uid, 100, 100],
      [uid + '/nested', 0, 100],
    ]);
    expect(b.remove.mock.calls.map((c) => c[0].length)).toEqual([100, 1]);
    expect(b.remove.mock.calls[1][0]).toEqual([uid + '/nested/orphan.jpg']);
    expect(b.list.mock.invocationCallOrder.at(-1)).toBeLessThan(
      b.remove.mock.invocationCallOrder[0],
    );
  });
  it.each(['begin', 'list', 'remove', 'finish'] as const)(
    'never reports success on returned %s error',
    async (operation) => {
      const b = backend();
      b.list.mockResolvedValue({ data: [{ name: 'avatar.jpg', id: 'file' }], error: null });
      b[operation].mockResolvedValue({ data: null, error: new Error('private backend error') });
      const r = await handleDeleteAccount(request(), b);
      expect(r.status).toBe(503);
      expect(JSON.stringify(await r.json())).not.toContain('private backend error');
      if (operation !== 'finish') expect(b.finish).not.toHaveBeenCalled();
    },
  );
  it('stops before finalization after a partial batch failure; a new call can retry', async () => {
    const b = backend();
    b.list
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({ name: String(i), id: String(i) })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ name: 'tail', id: 'tail' }], error: null });
    b.remove
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('outage') });
    expect((await handleDeleteAccount(request(), b)).status).toBe(503);
    expect(b.finish).not.toHaveBeenCalled();
    expect((await handleDeleteAccount(request(), b)).status).toBe(200);
    expect(b.finish).toHaveBeenCalledTimes(1);
  });
  it('fails closed on thrown requests and malformed/traversing object names', async () => {
    const b = backend();
    b.list.mockRejectedValueOnce(new Error('network'));
    expect((await handleDeleteAccount(request(), b)).status).toBe(503);
    b.list.mockResolvedValue({ data: [{ name: '../victim', id: 'bad' }], error: null });
    expect((await handleDeleteAccount(request(), b)).status).toBe(503);
    expect(b.remove).not.toHaveBeenCalled();
    expect(b.finish).not.toHaveBeenCalled();
  });
});
