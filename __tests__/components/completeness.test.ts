import { describe, expect, it, jest } from '@jest/globals';
import type { Profile } from '../../lib/types';

// Only the pure profileCompleteness() helper is under test; stub the
// component's native/router dependencies (expo-asset isn't installed, so
// letting @expo/vector-icons load for real breaks the suite).
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { profileCompleteness } from '../../components/ProfileNudgeCard';

/** A fully empty (but valid) profile; tests fill in the fields they exercise. */
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    chapter_id: 'chapter-1',
    name: null,
    email: null,
    avatar_url: null,
    class_year: null,
    role: null,
    industry: null,
    city: null,
    lat: null,
    lng: null,
    company: null,
    job_title: null,
    open_to_mentor: null,
    is_hiring: null,
    status: null,
    admin_role: null,
    linkedin_url: null,
    bio: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('profileCompleteness', () => {
  it('returns 0 of 6 for a null profile', () => {
    expect(profileCompleteness(null)).toEqual({ filled: 0, total: 6 });
  });

  it('returns 0 of 6 for an empty profile', () => {
    expect(profileCompleteness(makeProfile())).toEqual({ filled: 0, total: 6 });
  });

  it('counts each of the six findability fields once', () => {
    const full = makeProfile({
      avatar_url: 'https://cdn.example.com/a.png',
      city: 'Atlanta',
      industry: 'Tech',
      job_title: 'Engineer',
      bio: 'Hi there',
      linkedin_url: 'https://linkedin.com/in/me',
    });
    expect(profileCompleteness(full)).toEqual({ filled: 6, total: 6 });
  });

  it('counts partially filled profiles field by field', () => {
    const partial = makeProfile({ avatar_url: 'https://cdn.example.com/a.png', city: 'Atlanta' });
    expect(profileCompleteness(partial)).toEqual({ filled: 2, total: 6 });
  });

  it('counts role and job title as one field — either satisfies it', () => {
    expect(profileCompleteness(makeProfile({ role: 'Alumni' })).filled).toBe(1);
    expect(profileCompleteness(makeProfile({ job_title: 'Engineer' })).filled).toBe(1);
    expect(
      profileCompleteness(makeProfile({ role: 'Alumni', job_title: 'Engineer' })).filled,
    ).toBe(1);
  });

  it('ignores whitespace-only values', () => {
    const blank = makeProfile({
      city: '   ',
      industry: ' ',
      job_title: '\t',
      bio: '  ',
      linkedin_url: ' ',
    });
    expect(profileCompleteness(blank)).toEqual({ filled: 0, total: 6 });
  });

  it('does not count fields outside the six (name, company, class year)', () => {
    const other = makeProfile({ name: 'Pat', company: 'Acme', class_year: 2020 });
    expect(profileCompleteness(other)).toEqual({ filled: 0, total: 6 });
  });
});
