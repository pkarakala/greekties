import { describe, expect, it } from '@jest/globals';
import { sanitizeHttpUrl } from '../../lib/url';

describe('sanitizeHttpUrl', () => {
  it('accepts https URLs', () => {
    expect(sanitizeHttpUrl('https://linkedin.com/in/someone')).toBe(
      'https://linkedin.com/in/someone',
    );
  });

  it('accepts http URLs', () => {
    expect(sanitizeHttpUrl('http://example.com/path')).toBe('http://example.com/path');
  });

  it('prefixes bare domains with https://', () => {
    expect(sanitizeHttpUrl('linkedin.com/in/someone')).toBe('https://linkedin.com/in/someone');
    expect(sanitizeHttpUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects javascript: URLs', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects file: URLs', () => {
    expect(sanitizeHttpUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects mailto: URLs', () => {
    expect(sanitizeHttpUrl('mailto:someone@example.com')).toBeNull();
  });

  it('rejects mixed-case dangerous schemes', () => {
    expect(sanitizeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(sanitizeHttpUrl('DATA:text/html,x')).toBeNull();
    expect(sanitizeHttpUrl('FILE:///etc/passwd')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHttpUrl('  https://example.com/x  ')).toBe('https://example.com/x');
    expect(sanitizeHttpUrl('  example.com  ')).toBe('https://example.com/');
  });

  it('returns null for null, undefined, and empty input', () => {
    expect(sanitizeHttpUrl(null)).toBeNull();
    expect(sanitizeHttpUrl(undefined)).toBeNull();
    expect(sanitizeHttpUrl('')).toBeNull();
    expect(sanitizeHttpUrl('   ')).toBeNull();
  });

  it('returns null for garbage that cannot parse as a URL', () => {
    expect(sanitizeHttpUrl('https://')).toBeNull();
    expect(sanitizeHttpUrl('http://')).toBeNull();
    expect(sanitizeHttpUrl('not a real url')).toBeNull();
  });
});
