import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useAuth } from './auth';

export function useMemberScope() {
  const { session, profile, blockedIds } = useAuth();
  return JSON.stringify([
    session?.user.id,
    profile?.chapter_id,
    profile?.status,
    profile?.membership_type,
    profile?.admin_role,
    [...blockedIds].sort(),
  ]);
}

/** Mutable request lifecycle, separate from React render state. */
export class ReadScope<T> {
  version = 0;
  active = false;
  data: T | null = null;
  constructor(readonly key: string) {}
  invalidate() {
    this.version++;
  }
  begin() {
    this.active = true;
    return ++this.version;
  }
  end() {
    this.active = false;
    this.version++;
  }
  current(version: number) {
    return this.active && version === this.version;
  }
  accept(data: T) {
    this.data = data;
  }
}
/** Retain same-scope data on refresh; new scope renders no old data. */
export function useScopedRead<T>(
  key: string,
  enabled: boolean,
  read: (previous: T | null) => Promise<T>,
  failure: string,
) {
  const token = useMemo(() => new ReadScope<T>(key), [key]);
  const [state, setState] = useState<{
    token: typeof token;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>();
  const [nonce, refresh] = useReducer((n: number) => n + 1, 0);
  const invalidate = useCallback(() => token.invalidate(), [token]);
  const reload = useCallback(() => {
    invalidate();
    refresh();
  }, [invalidate]);
  const update = useCallback(
    (data: T) => {
      if (!token.active) return;
      token.invalidate();
      token.accept(data);
      setState({ token, data, error: null, loading: false });
    },
    [token],
  );
  useEffect(() => {
    const version = token.begin();
    const previous = token.data;
    if (enabled) {
      setState({ token, data: previous, error: null, loading: true });
      void Promise.resolve()
        .then(() => {
          if (!token.current(version)) return;
          return read(previous);
        })
        .then(
          (data) => {
            if (!token.current(version) || data === undefined) return;
            token.accept(data);
            setState({ token, data, error: null, loading: false });
          },
          () => {
            if (token.current(version))
              setState({ token, data: previous, error: failure, loading: false });
          },
        );
    }
    return () => token.end();
  }, [token, enabled, read, failure, nonce]);
  const visible = state?.token === token ? state : undefined;
  return {
    data: enabled ? (visible?.data ?? null) : null,
    error: visible?.error ?? null,
    loading: enabled && (visible?.loading ?? true),
    reload,
    invalidate,
    update,
    token,
  };
}
