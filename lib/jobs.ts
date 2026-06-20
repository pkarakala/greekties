import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { JobPosting } from './types';

export interface JobsData {
  loading: boolean;
  error: string | null;
  jobs: JobPosting[];
  reload: () => void;
}

/** Job postings for a chapter, newest first. RLS scopes to the user's chapter. */
export function useJobs(chapterId: string | null): JobsData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
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
      .from('job_postings')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) setError(err.message);
        else setJobs((data as JobPosting[]) ?? []);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, nonce]);

  return { loading, error, jobs, reload };
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
