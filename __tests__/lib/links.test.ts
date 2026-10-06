import { describe, expect, it } from '@jest/globals';
import { joinLink, joinMessage, WEB_BASE_URL, parseInviteCode } from '../../lib/links';

describe('parseInviteCode', () => {
  it.each([
    ' AbC123 ',
    'greekties://join/ABC123?source=mail#top',
    'https://pkarakala.github.io/greekties/join/ABC123/?source=mail#top',
  ])('parses %s', (input) => {
    expect(parseInviteCode(input)).toBe('abc123');
  });
  it.each([
    '',
    'bad code',
    'https://evil.test/join/abc',
    'https://pkarakala.github.io/greekties/join/a/b',
    'greekties://join/a/b',
    'greekties://join/a%2Fb',
    'greekties://join/%',
    'greekties://other/a',
    '../abc',
    'abc?x',
    'a'.repeat(129),
  ])('rejects malformed input %s', (input) => {
    expect(parseInviteCode(input)).toBeNull();
  });
});

describe('joinLink', () => {
  it('builds the GitHub Pages join URL for a code', () => {
    expect(joinLink('ABC123')).toBe(`${WEB_BASE_URL}/join/ABC123`);
    expect(joinLink('ABC123')).toBe('https://pkarakala.github.io/greekties/join/ABC123');
  });

  it('percent-encodes codes with reserved characters', () => {
    expect(joinLink('a/b?c#d')).toBe(`${WEB_BASE_URL}/join/a%2Fb%3Fc%23d`);
    expect(joinLink('a b&c')).toBe(`${WEB_BASE_URL}/join/a%20b%26c`);
  });
});

describe('joinMessage', () => {
  it('contains both the https link and the greekties:// scheme hint', () => {
    const message = joinMessage('ABC123');
    expect(message).toContain(`${WEB_BASE_URL}/join/ABC123`);
    expect(message).toContain('greekties://join/ABC123');
  });

  it('uses the chapter name when provided', () => {
    expect(joinMessage('ABC123', 'Alpha Beta Gamma')).toContain(
      'Join Alpha Beta Gamma on Greek Ties',
    );
  });

  it('falls back to generic copy without a chapter name', () => {
    expect(joinMessage('ABC123')).toContain('Join our chapter on Greek Ties');
    expect(joinMessage('ABC123', null)).toContain('Join our chapter on Greek Ties');
  });

  it('encodes special characters in both the web link and the scheme hint', () => {
    const message = joinMessage('a/b c');
    expect(message).toContain(`${WEB_BASE_URL}/join/a%2Fb%20c`);
    expect(message).toContain('greekties://join/a%2Fb%20c');
    expect(message).not.toContain('join/a/b c');
  });
});
