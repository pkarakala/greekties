import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { supabase } from './supabase';
import { ReadScope, useMemberScope } from './scoped-read';
import type { Profile } from './types';

export interface DirectoryFilters {
  query?: string;
  mentorsOnly?: boolean;
  hiringOnly?: boolean;
  industry?: string | null;
}
export const DIRECTORY_PAGE_SIZE = 50;
const COLUMNS =
  'id, user_id, chapter_id, name, avatar_url, class_year, role, membership_type, industry, city, company, job_title, open_to_mentor, is_hiring, status, admin_role, linkedin_url, bio, created_at';
// Two separate grammars: first literal PostgreSQL regex, then a quoted
// PostgREST value. No user text becomes an operator, column, or OR expression.
export function literalSearchPattern(text: string) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
export function directorySearchExpression(text: string) {
  const pattern = literalSearchPattern(text.trim());
  const quoted = '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return ['name', 'company', 'job_title', 'city', 'role']
    .map((column) => `${column}.imatch.${quoted}`)
    .join(',');
}
export async function fetchDirectoryPage(
  chapterId: string,
  filters: DirectoryFilters,
  from: number,
  blockedIds: ReadonlySet<string>,
) {
  let query = supabase
    .from('profiles')
    .select(COLUMNS)
    .eq('chapter_id', chapterId)
    .eq('status', 'approved');
  if (filters.query?.trim()) query = query.or(directorySearchExpression(filters.query));
  if (filters.mentorsOnly) query = query.eq('open_to_mentor', true);
  if (filters.hiringOnly) query = query.eq('is_hiring', true);
  if (filters.industry?.trim()) query = query.eq('industry', filters.industry.trim());
  // IDs come from trusted membership/block data, not search text. Individual
  // neq filters avoid interpolating IDs into the query-language grammar.
  for (const id of blockedIds) query = query.neq('user_id', id);
  const result = await query
    .order('name', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + DIRECTORY_PAGE_SIZE - 1);
  if (result.error || !result.data) throw new Error('Directory unavailable');
  return result.data as Profile[];
}
class DirectoryScope extends ReadScope<never> {
  busy = false;
  offset = 0;
  startPage() {
    this.busy = true;
    return this.version;
  }
  reset() {
    this.busy = true;
    this.offset = 0;
    return this.begin();
  }
  finishPage(count: number) {
    this.offset += count;
  }
  finish() {
    this.busy = false;
  }
}
export function useChapterMembers(
  chapterId: string | null,
  blockedIds: ReadonlySet<string>,
  filters: DirectoryFilters = {},
) {
  const scope = useMemberScope();
  const { query = '', mentorsOnly = false, hiringOnly = false, industry = null } = filters;
  const key = JSON.stringify([scope, chapterId, query.trim(), mentorsOnly, hiringOnly, industry]);
  const token = useMemo(() => new DirectoryScope(key), [key]);
  const [nonce, bump] = useReducer((n: number) => n + 1, 0);
  const [state, setState] = useState<{
    token: typeof token;
    members: Profile[];
    loading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    error: string | null;
  }>();
  const reload = useCallback(() => {
    token.invalidate();
    token.finish();
    bump();
  }, [token]);
  useEffect(() => {
    const run = token.reset();
    const current = () => token.current(run);
    setState((old) => ({
      token,
      members: old?.token === token ? old.members : [],
      loading: !!chapterId,
      loadingMore: false,
      hasMore: false,
      error: null,
    }));
    if (chapterId)
      void fetchDirectoryPage(
        chapterId,
        { query, mentorsOnly, hiringOnly, industry },
        0,
        blockedIds,
      )
        .then(
          (page) => {
            if (!current()) return;
            token.finishPage(page.length);
            setState({
              token,
              members: page,
              loading: false,
              loadingMore: false,
              hasMore: page.length === DIRECTORY_PAGE_SIZE,
              error: null,
            });
          },
          () => {
            if (current())
              setState((old) => ({
                ...old!,
                loading: false,
                error: 'Couldn’t search members. Please retry.',
              }));
          },
        )
        .finally(() => {
          if (current()) token.finish();
        });
    return () => token.end();
  }, [token, nonce, chapterId, blockedIds, query, mentorsOnly, hiringOnly, industry]);
  const visible = state?.token === token ? state : null;
  const loadMore = async () => {
    if (!chapterId || !token.active || token.busy || !visible?.hasMore || visible.loading) return;
    const run = token.startPage();
    const current = () => token.current(run);
    setState((old) => ({ ...old!, loadingMore: true, error: null }));
    try {
      const page = await fetchDirectoryPage(
        chapterId,
        { query, mentorsOnly, hiringOnly, industry },
        token.offset,
        blockedIds,
      );
      if (!current()) return;
      token.finishPage(page.length);
      setState((old) => ({
        ...old!,
        members: [...old!.members, ...page.filter((p) => !old!.members.some((m) => m.id === p.id))],
        loadingMore: false,
        hasMore: page.length === DIRECTORY_PAGE_SIZE,
      }));
    } catch {
      if (current())
        setState((old) => ({
          ...old!,
          loadingMore: false,
          error: 'Couldn’t load more members. Retry or refresh.',
        }));
    } finally {
      if (current()) token.finish();
    }
  };
  return {
    members: visible?.members ?? [],
    error: visible?.error ?? null,
    loading: !!chapterId && (visible?.loading ?? true),
    hasMore: visible?.hasMore ?? false,
    loadingMore: visible?.loadingMore ?? false,
    reload,
    loadMore,
  };
}
