import { Linking } from 'react-native';
import type { JobPosting } from './types';

export function applicationUrl(value: string | null | undefined): string | null {
  if (!value?.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value.trim())) return null;
  const text = value.trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function jobApplicationState(job: Pick<JobPosting, 'is_open' | 'apply_url'>) {
  if (job.is_open === false) return { url: null, message: 'This posting is closed.' };
  if (!job.apply_url?.trim()) return { url: null, message: 'No application link was provided.' };
  const url = applicationUrl(job.apply_url);
  return { url, message: url ? null : 'The application link is not a valid web address.' };
}
export async function openJobApplication(
  job: Pick<JobPosting, 'is_open' | 'apply_url'>,
): Promise<string | null> {
  const state = jobApplicationState(job);
  if (!state.url) return state.message;
  try {
    await Linking.openURL(state.url);
    return null;
  } catch {
    return 'Couldn’t open the application link. Please try again.';
  }
}
