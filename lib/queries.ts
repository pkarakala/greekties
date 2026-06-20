import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Profile } from './types';

export interface HomeStats {
  members: number;
  industries: number;
  newThisMonth: number;
}

export interface HomeData {
  loading: boolean;
  error: string | null;
  stats: HomeStats;
  suggested: Profile[];
  recent: Profile[];
  reload: () => void;
}

const EMPTY_STATS: HomeStats = { members: 0, industries: 0, newThisMonth: 0 };

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/** Loads everything the Home dashboard needs for the user's chapter. */
export function useHomeData(chapterId: string | null, userId: string | null): HomeData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [suggested, setSuggested] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Profile[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    const approved = () =>
      supabase.from('profiles').select('*', { count: 'exact' }).eq('chapter_id', chapterId).eq('status', 'approved');

    Promise.all([
      // Total approved members (count only).
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('status', 'approved'),
      // Industries column → distinct count computed client-side.
      supabase
        .from('profiles')
        .select('industry')
        .eq('chapter_id', chapterId)
        .eq('status', 'approved'),
      // New members this month (count only).
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('status', 'approved')
        .gte('created_at', startOfMonthISO()),
      // Recent joins — reused for both "suggested" and "recent activity".
      approved().order('created_at', { ascending: false }).limit(12),
    ])
      .then(([membersRes, industriesRes, monthRes, recentRes]) => {
        if (!mounted) return;

        const firstError =
          membersRes.error || industriesRes.error || monthRes.error || recentRes.error;
        if (firstError) {
          setError(firstError.message);
          setLoading(false);
          return;
        }

        const distinctIndustries = new Set(
          (industriesRes.data ?? [])
            .map((r: { industry: string | null }) => r.industry)
            .filter((v): v is string => !!v && v.trim().length > 0),
        );

        setStats({
          members: membersRes.count ?? 0,
          industries: distinctIndustries.size,
          newThisMonth: monthRes.count ?? 0,
        });

        const recentRows = (recentRes.data as Profile[]) ?? [];
        setRecent(recentRows.slice(0, 5));
        setSuggested(recentRows.filter((p) => p.user_id !== userId).slice(0, 10));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load home data.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, userId, nonce]);

  return { loading, error, stats, suggested, recent, reload };
}

interface MembersResult {
  loading: boolean;
  error: string | null;
  members: Profile[];
  reload: () => void;
}

/** All approved members in a chapter (for the directory). Filtering is client-side. */
export function useChapterMembers(chapterId: string | null): MembersResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    supabase
      .from('profiles')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setMembers((data as Profile[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, members, reload };
}

/** Approved members that have map coordinates. */
export function useMapMembers(chapterId: string | null): MembersResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    supabase
      .from('profiles')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('status', 'approved')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setMembers((data as Profile[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, members, reload };
}
