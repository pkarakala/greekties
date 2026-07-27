import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { JobPosting } from './types';

/** Jobs fetched per page (initial load + each loadMore). */
const PAGE_SIZE = 50;

export interface JobsData {
  loading: boolean;
  error: string | null;
  jobs: JobPosting[];
  /** True when older jobs exist beyond what's loaded. */
  hasMore: boolean;
  /** True while a loadMore() page is in flight. */
  loadingMore: boolean;
  /** Fetch the page of jobs before the oldest loaded one and append it. */
  loadMore: () => Promise<void>;
  reload: () => void;
}

/** True when the error means the `is_open` column doesn't exist yet (pre-migration). */
function isMissingIsOpen(message: string): boolean {
  return /is_open|column .* does not exist|schema cache/i.test(message);
}

/**
 * Fetch one page of a chapter's job postings, newest first. Filters to open
 * jobs — `.or('is_open.is.null,is_open.eq.true')` keeps rows predating the
 * column — but the live DB may not have `is_open` at all yet, in which case
 * the filtered query errors and we retry unfiltered (graceful degradation,
 * same idea as lib/moderation.ts isMissingTable).
 */
async function fetchJobsPage(
  chapterId: string,
  before: string | null,
): Promise<{ page: JobPosting[]; error: string | null }> {
  const buildQuery = (withOpenFilter: boolean) => {
    let q = supabase.from('job_postings').select('*').eq('chapter_id', chapterId);
    if (withOpenFilter) q = q.or('is_open.is.null,is_open.eq.true');
    if (before) q = q.lt('created_at', before);
    return q.order('created_at', { ascending: false }).limit(PAGE_SIZE);
  };

  let { data, error } = await buildQuery(true);
  if (error && isMissingIsOpen(error.message)) {
    ({ data, error } = await buildQuery(false));
  }
  if (error) return { page: [], error: error.message };
  return { page: (data as JobPosting[]) ?? [], error: null };
}

/** Open job postings for a chapter, newest first, paginated. RLS scopes to the user's chapter. */
export function useJobs(chapterId: string | null): JobsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Pagination cursor: created_at of the oldest fetched job.
  const oldestFetchedRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!chapterId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError(null);
    oldestFetchedRef.current = null;

    fetchJobsPage(chapterId, null).then(({ page, error: err }) => {
      if (!mounted) return;
      if (err) setError(err);
      else {
        setJobs(page);
        oldestFetchedRef.current = page[page.length - 1]?.created_at ?? null;
        setHasMore(page.length === PAGE_SIZE);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  const loadMore = useCallback(async () => {
    const cursor = oldestFetchedRef.current;
    if (!chapterId || !cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const { page, error: err } = await fetchJobsPage(chapterId, cursor);
    if (err) {
      setError(err);
    } else {
      if (page.length > 0) oldestFetchedRef.current = page[page.length - 1].created_at;
      setHasMore(page.length === PAGE_SIZE);
      if (page.length > 0) {
        setJobs((prev) => {
          const seen = new Set(prev.map((j) => j.id));
          return [...prev, ...page.filter((j) => !seen.has(j.id))];
        });
      }
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [chapterId]);

  return { loading, error, jobs, hasMore, loadingMore, loadMore, reload };
}

export function useJob(jobId: string | null): { loading: boolean; job: JobPosting | null } {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<JobPosting | null>(null);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from('job_postings')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setJob((data as JobPosting) ?? null);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [jobId]);

  return { loading, job };
}

export async function createJob(input: {
  chapterId: string;
  postedBy: string;
  title: string;
  company: string;
  location?: string;
  industry?: string;
  description?: string;
  applyUrl?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('job_postings')
    .insert({
      chapter_id: input.chapterId,
      posted_by: input.postedBy,
      title: input.title,
      company: input.company,
      location: input.location || null,
      industry: input.industry || null,
      description: input.description || null,
      apply_url: input.applyUrl || null,
    })
    .select('id')
    .maybeSingle();

  return { id: (data?.id as string) ?? null, error: error?.message ?? null };
}
