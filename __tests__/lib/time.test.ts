import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { timeAgoShort, clockTime } from '../../lib/time';

const NOW = new Date('2026-07-25T12:00:00.000Z').getTime();

/** ISO timestamp `secs` seconds before the mocked "now". */
function secondsAgo(secs: number): string {
  return new Date(NOW - secs * 1000).toISOString();
}

describe('timeAgoShort', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns "now" for anything under 45 seconds', () => {
    expect(timeAgoShort(secondsAgo(0))).toBe('now');
    expect(timeAgoShort(secondsAgo(44))).toBe('now');
  });

  it('switches to minutes at 45 seconds', () => {
    expect(timeAgoShort(secondsAgo(45))).toBe('0m');
    expect(timeAgoShort(secondsAgo(60))).toBe('1m');
    expect(timeAgoShort(secondsAgo(59 * 60))).toBe('59m');
  });

  it('switches to hours at 60 minutes', () => {
    expect(timeAgoShort(secondsAgo(60 * 60))).toBe('1h');
    expect(timeAgoShort(secondsAgo(23 * 60 * 60))).toBe('23h');
  });

  it('switches to days at 24 hours', () => {
    expect(timeAgoShort(secondsAgo(24 * 60 * 60))).toBe('1d');
    expect(timeAgoShort(secondsAgo(6 * 24 * 60 * 60))).toBe('6d');
  });

  it('switches to weeks at 7 days', () => {
    expect(timeAgoShort(secondsAgo(7 * 24 * 60 * 60))).toBe('1w');
    expect(timeAgoShort(secondsAgo(51 * 7 * 24 * 60 * 60))).toBe('51w');
  });

  it('switches to years at 365 days', () => {
    expect(timeAgoShort(secondsAgo(365 * 24 * 60 * 60))).toBe('1y');
    expect(timeAgoShort(secondsAgo(2 * 365 * 24 * 60 * 60))).toBe('2y');
  });

  it('clamps future timestamps to "now"', () => {
    expect(timeAgoShort(secondsAgo(-3600))).toBe('now');
  });

  it('returns an empty string for unparseable input', () => {
    expect(timeAgoShort('not-a-date')).toBe('');
    expect(timeAgoShort('')).toBe('');
  });
});

describe('clockTime', () => {
  it('formats a valid timestamp as hour:minute', () => {
    // Locale-dependent output; assert shape rather than exact string.
    expect(clockTime('2026-07-25T14:05:00.000Z')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns an empty string for unparseable input', () => {
    expect(clockTime('not-a-date')).toBe('');
    expect(clockTime('')).toBe('');
  });
});
