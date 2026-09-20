import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { storePendingInviteCode, readPendingInvite, clearPendingInvite } from '../../lib/invite';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
const originalOS = Platform.OS;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const values = new Map<string, string>();
const web = {
  getItem: jest.fn((key: string) => values.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    values.set(key, value);
  }),
  removeItem: jest.fn((key: string) => {
    values.delete(key);
  }),
};
beforeEach(() => {
  values.clear();
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { value: web, configurable: true });
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => values.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    values.set(key, value);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
});
afterEach(() => {
  Platform.OS = originalOS;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
describe('platform invitation persistence adapters', () => {
  it.each(['ios', 'web'] as const)(
    'persists and clears only on success/cancellation on %s',
    async (os) => {
      Platform.OS = os;
      const saved = await storePendingInviteCode('abc');
      expect((await readPendingInvite()).invite).toEqual(saved.invite);
      expect(saved.warning).toBeNull();
      if (os === 'web') {
        expect(web.setItem).toHaveBeenCalled();
        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      } else {
        expect(SecureStore.setItemAsync).toHaveBeenCalled();
        expect(web.setItem).not.toHaveBeenCalled();
      }
      await clearPendingInvite(saved.invite);
      expect((await readPendingInvite()).invite).toBeNull();
    },
  );
});
