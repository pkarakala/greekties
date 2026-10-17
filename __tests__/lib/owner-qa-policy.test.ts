import { describe, expect, it, jest } from '@jest/globals';
import { ownerQaTargetError, createOwnerQaFetch } from '../../config/owner-qa-policy.cjs';
const ref = 'q'.repeat(20);
const url = `https://${ref}.supabase.co`;
describe('owner-only QA backend and deletion guards', () => {
  it('rejects missing, production, local, and mismatched destinations', () => {
    expect(ownerQaTargetError(url, null)).toBeTruthy();
    expect(
      ownerQaTargetError('https://sdscrvoorrygesrhjeee.supabase.co', 'sdscrvoorrygesrhjeee'),
    ).toBeTruthy();
    expect(ownerQaTargetError('http://127.0.0.1:55321', ref)).toBeTruthy();
    expect(ownerQaTargetError(url + '/other', ref)).toBeTruthy();
    expect(ownerQaTargetError(url, ref)).toBeNull();
  });
  it.each([
    '/functions/v1/delete-account',
    '/functions/v1/delete-account/',
    '/functions//v1/delete-account',
    '/rest/v1/rpc/delete_own_account',
    '/rest/v1/rpc/begin_account_deletion',
    '/rest/v1/rpc/finish_account_deletion?target=other',
    '/rest/v1/rpc/%64elete_own_account',
    '/auth/v1/admin/users/other',
  ])('blocks %s before transport', async (route) => {
    const send = jest.fn<typeof fetch>();
    const guarded = createOwnerQaFetch(url, ref, send as typeof fetch);
    await expect(guarded(url + route, { method: 'POST' })).rejects.toThrow('unavailable');
    expect(send).not.toHaveBeenCalled();
  });
  it('blocks all transport if the target is unconfigured or has a different origin', async () => {
    const send = jest.fn<typeof fetch>();
    await expect(
      createOwnerQaFetch(url, null, send as typeof fetch)(url + '/auth/v1/token'),
    ).rejects.toThrow();
    await expect(
      createOwnerQaFetch(
        url,
        ref,
        send as typeof fetch,
      )('https://sdscrvoorrygesrhjeee.supabase.co/auth/v1/token'),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('allows ordinary QA calls while refusing redirects', async () => {
    const send = jest.fn<typeof fetch>().mockResolvedValue({ status: 200 } as Response);
    await createOwnerQaFetch(
      url,
      ref,
      send as typeof fetch,
    )(url + '/rest/v1/profiles', { method: 'GET' });
    expect(send).toHaveBeenCalledWith(url + '/rest/v1/profiles', {
      method: 'GET',
      redirect: 'error',
    });
  });
});
