import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';
import { storePendingInviteCode, consumePendingInviteCode } from '../../lib/invite';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockedStore = jest.mocked(SecureStore);

describe('pending invite code persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStore.setItemAsync.mockResolvedValue(undefined);
    mockedStore.getItemAsync.mockResolvedValue(null);
    mockedStore.deleteItemAsync.mockResolvedValue(undefined);
  });

  it('stores and consumes a code round trip', async () => {
    await storePendingInviteCode('ABC123');
    expect(mockedStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'ABC123');

    // Simulate the code being present in storage.
    const [key] = mockedStore.setItemAsync.mock.calls[0];
    mockedStore.getItemAsync.mockResolvedValue('ABC123');

    const code = await consumePendingInviteCode();
    expect(code).toBe('ABC123');
    expect(mockedStore.getItemAsync).toHaveBeenCalledWith(key);
  });

  it('clears the stored code on consume', async () => {
    mockedStore.getItemAsync.mockResolvedValue('ABC123');

    await consumePendingInviteCode();
    expect(mockedStore.deleteItemAsync).toHaveBeenCalledTimes(1);
  });

  it('does not clear anything when no code is stored', async () => {
    mockedStore.getItemAsync.mockResolvedValue(null);

    const code = await consumePendingInviteCode();
    expect(code).toBeNull();
    expect(mockedStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('swallows storage errors on store', async () => {
    mockedStore.setItemAsync.mockRejectedValue(new Error('keychain unavailable'));
    await expect(storePendingInviteCode('ABC123')).resolves.toBeUndefined();
  });

  it('returns null when consume fails instead of throwing', async () => {
    mockedStore.getItemAsync.mockRejectedValue(new Error('keychain unavailable'));
    await expect(consumePendingInviteCode()).resolves.toBeNull();
  });

  it('returns null when the delete fails mid-consume', async () => {
    mockedStore.getItemAsync.mockResolvedValue('ABC123');
    mockedStore.deleteItemAsync.mockRejectedValue(new Error('keychain unavailable'));
    await expect(consumePendingInviteCode()).resolves.toBeNull();
  });
});
