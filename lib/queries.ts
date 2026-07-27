import { useCallback, useEffect, useRef, useState } from 'react';
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

// Directory/home/map reads deliberately exclude `email` (and anything else the
// UI never shows) so member PII isn't shipped to every client. Email is only
// fetched where it's actually rendered (own account, admin approvals).
const MEMBER_COLUMNS =
  'id, user_id, chapter_id, name, avatar_url, class_year, role, industry, city, company, job_title, open_to_mentor, is_hiring, status, admin_role, linkedin_url, bio, created_at';
const MAP_COLUMNS = 'id, user_id, name, avatar_url, city, class_year, lat, lng';

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
      supabase
        .from('profiles')
        .select(MEMBER_COLUMNS, { count: 'exact' })
        .eq('chapter_id', chapterId)
        .eq('status', 'approved');

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

/** Members fetched per page (initial load + each loadMore). */
const MEMBERS_PAGE_SIZE = 100;

export interface ChapterMembersResult extends MembersResult {
  /** True when more members exist beyond what's loaded. */
  hasMore: boolean;
  /** True while a loadMore() page is in flight. */
  loadingMore: boolean;
  /** Fetch the next page (offset-based, name order) and append it. */
  loadMore: () => Promise<void>;
}

/**
 * Approved members in a chapter (for the directory), ordered by name and
 * paginated via `.range()` offsets. Filtering is client-side, over the pages
 * loaded so far.
 */
export function useChapterMembers(chapterId: string | null): ChapterMembersResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Offset cursor: how many rows have been fetched so far.
  const fetchedCountRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    (from: number) =>
      supabase
        .from('profiles')
        .select(MEMBER_COLUMNS)
        .eq('chapter_id', chapterId!)
        .eq('status', 'approved')
        .order('name', { ascending: true })
        .range(from, from + MEMBERS_PAGE_SIZE - 1),
    [chapterId],
  );

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchedCountRef.current = 0;

    fetchPage(0).then(({ data, error: err }) => {
      if (!mounted) return;
      if (err) setError(err.message);
      else {
        const page = (data as Profile[]) ?? [];
        setMembers(page);
        fetchedCountRef.current = page.length;
        setHasMore(page.length === MEMBERS_PAGE_SIZE);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!chapterId || fetchedCountRef.current === 0 || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const { data, error: err } = await fetchPage(fetchedCountRef.current);
    if (err) {
      setError(err.message);
    } else {
      const page = (data as Profile[]) ?? [];
      fetchedCountRef.current += page.length;
      setHasMore(page.length === MEMBERS_PAGE_SIZE);
      if (page.length > 0) {
        setMembers((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...page.filter((m) => !seen.has(m.id))];
        });
      }
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [chapterId, fetchPage]);

  return { loading, error, members, hasMore, loadingMore, loadMore, reload };
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
      .select(MAP_COLUMNS)
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

// ── Network breakdown (the "Network Net Worth" screen, app/network.tsx) ──────

export interface BreakdownEntry {
  name: string;
  count: number;
}

export interface NetworkBreakdown {
  /** Approved members counted (capped at BREAKDOWN_ROW_CAP). */
  total: number;
  industries: BreakdownEntry[];
  companies: BreakdownEntry[];
  cities: BreakdownEntry[];
  classYears: { year: number; count: number }[];
  /** Members with open_to_mentor set. */
  mentors: number;
  /** Members with is_hiring set. */
  hiring: number;
  /** Members with map coordinates (lat present). */
  onMap: number;
}

export interface NetworkBreakdownData {
  loading: boolean;
  error: string | null;
  breakdown: NetworkBreakdown;
  reload: () => void;
}

const EMPTY_BREAKDOWN: NetworkBreakdown = {
  total: 0,
  industries: [],
  companies: [],
  cities: [],
  classYears: [],
  mentors: 0,
  hiring: 0,
  onMap: 0,
};

// Aggregate-only columns — no names, emails, or anything identifying. The
// breakdown screen renders counts, so counts are all we ship to the client.
const BREAKDOWN_COLUMNS = 'industry, company, city, class_year, open_to_mentor, is_hiring, lat';

/**
 * One un-paginated select capped at 1,000 rows — far above any current chapter
 * size. If a chapter ever outgrows the cap, the aggregates describe the first
 * 1,000 approved members rather than paging (this screen is a summary, not a
 * directory — useChapterMembers handles exhaustive listing).
 */
const BREAKDOWN_ROW_CAP = 1000;

/** Entries kept per list (industries/companies/cities/class years). */
const BREAKDOWN_TOP_N = 8;

interface BreakdownRow {
  industry: string | null;
  company: string | null;
  city: string | null;
  class_year: number | null;
  open_to_mentor: boolean | null;
  is_hiring: boolean | null;
  lat: number | null;
}

/** Same check as lib/moderation.ts — "relation does not exist" pre-migration. */
function isMissingTableOrColumn(message: string): boolean {
  return /does not exist|schema cache/i.test(message);
}

/** Tally non-empty values → top N entries, most common first. */
function topCounts(values: (string | null)[]): BreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const name = raw?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, BREAKDOWN_TOP_N);
}

function aggregateBreakdown(rows: BreakdownRow[]): NetworkBreakdown {
  const yearCounts = new Map<number, number>();
  for (const row of rows) {
    if (row.class_year != null) {
      yearCounts.set(row.class_year, (yearCounts.get(row.class_year) ?? 0) + 1);
    }
  }

  return {
    total: rows.length,
    industries: topCounts(rows.map((r) => r.industry)),
    companies: topCounts(rows.map((r) => r.company)),
    cities: topCounts(rows.map((r) => r.city)),
    classYears: [...yearCounts.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.count - a.count || b.year - a.year)
      .slice(0, BREAKDOWN_TOP_N),
    mentors: rows.filter((r) => r.open_to_mentor === true).length,
    hiring: rows.filter((r) => r.is_hiring === true).length,
    onMap: rows.filter((r) => r.lat != null).length,
  };
}

/**
 * The full "Network Net Worth" breakdown for a chapter: how many approved
 * members there are and where they cluster (industry, company, city, class
 * year), plus mentor/hiring/on-the-map counts. One select, aggregated
 * client-side. Degrades to an empty breakdown pre-migration.
 */
export function useNetworkBreakdown(chapterId: string | null): NetworkBreakdownData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<NetworkBreakdown>(EMPTY_BREAKDOWN);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!chapterId) {
      setBreakdown(EMPTY_BREAKDOWN);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('profiles')
          .select(BREAKDOWN_COLUMNS)
          .eq('chapter_id', chapterId)
          .eq('status', 'approved')
          .limit(BREAKDOWN_ROW_CAP);

        if (!mounted) return;
        if (err) {
          // Missing table/column (pre-migration) → empty breakdown, no error.
          if (!isMissingTableOrColumn(err.message)) {
            setError('Couldn’t load your network. Pull to refresh.');
          }
          setBreakdown(EMPTY_BREAKDOWN);
        } else {
          setBreakdown(aggregateBreakdown((data as BreakdownRow[]) ?? []));
        }
      } catch {
        if (!mounted) return;
        setError('Couldn’t load your network. Pull to refresh.');
        setBreakdown(EMPTY_BREAKDOWN);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, breakdown, reload };
}
