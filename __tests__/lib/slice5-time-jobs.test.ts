import { describe, expect, it, jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as babel from '@babel/core';
import path from 'path';
import { Linking } from 'react-native';
import { eventPhase, eventDateTime, parseLocalDateTime, toLocalDateTimeFields } from '@/lib/time';
import { applicationUrl, jobApplicationState, openJobApplication } from '@/lib/job-application';

it('uses exact start/end boundaries, and removes an event with no end at its start', () => {
  const start = '2026-09-17T12:00:00Z',
    end = '2026-09-17T13:00:00Z';
  const event = { starts_at: start, ends_at: end };
  expect(eventPhase(event, Date.parse(start) - 1)).toBe('Upcoming');
  expect(eventPhase(event, Date.parse(start))).toBe('Happening now');
  expect(eventPhase(event, Date.parse(end))).toBe('Ended');
  expect(eventPhase({ starts_at: start }, Date.parse(start))).toBe('Ended');
  expect(eventPhase({ starts_at: 'invalid' })).toBe('Ended');
});
it.each([
  ['2026-02-30', '12:00'],
  ['2026-13-01', '12:00'],
  ['2026-01-01', '24:01'],
  ['2026-01-01', '12:60'],
  ['26-01-01', '12:00'],
])('rejects invalid local input %s %s', (d, t) => expect(parseLocalDateTime(d, t)).toBeNull());
it('preserves the complete instant on an unchanged edit and labels displayed timezones', () => {
  const original = '2026-09-17T12:34:56.789Z';
  const f = toLocalDateTimeFields(original);
  expect(parseLocalDateTime(f.date, f.time, original)?.toISOString()).toBe(original);
  expect(eventDateTime(original)).toMatch(/UTC|GMT|PDT|PST|EDT|EST/);
});
it('rejects DST gaps and resolves repeated times explicitly in Los Angeles and Lord Howe', () => {
  // Separate Node processes are needed: Jest's TZ mutation is not a runtime
  // timezone change. Only this pure local helper is compiled, never app startup.
  const code = babel.transformFileSync(path.resolve('lib/time.ts'), {
    presets: ['babel-preset-expo'],
  })!.code;
  const run = (zone: string, script: string) =>
    JSON.parse(
      execFileSync(process.execPath, ['-e', code + '\n' + script], {
        env: { ...process.env, TZ: zone },
        encoding: 'utf8',
      }),
    );
  const la = run(
    'America/Los_Angeles',
    `const a=exports.localDateTimeCandidates('2026-11-01','01:30'); console.log(JSON.stringify([exports.localDateTimeCandidates('2026-03-08','02:30').length,a.map(d=>d.toISOString()),exports.parseLocalDateTime('2026-11-01','01:30'),exports.parseLocalDateTime('2026-11-01','01:30',null,a[1].toISOString()).toISOString()]));`,
  );
  expect(la).toEqual([
    0,
    ['2026-11-01T08:30:00.000Z', '2026-11-01T09:30:00.000Z'],
    null,
    '2026-11-01T09:30:00.000Z',
  ]);
  expect(
    run(
      'Australia/Lord_Howe',
      `console.log(JSON.stringify(exports.localDateTimeCandidates('2026-04-05','01:45').length));`,
    ),
  ).toBe(2);
});
describe('application actions', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///a',
    'https://user:secret@example.com',
    'https://example.com/ bad',
    'https://example.com\\evil',
  ])('rejects unsafe URL %s', (url) => expect(applicationUrl(url)).toBeNull());
  it('accepts a bare web address and HTTP(S)', () => {
    expect(applicationUrl('example.com/apply')).toBe('https://example.com/apply');
    expect(applicationUrl('http://example.com')).toBe('http://example.com/');
  });
  it('blocks closed jobs even with a good link and distinguishes absent/invalid links', () => {
    expect(
      jobApplicationState({ is_open: false, apply_url: 'https://example.com' }).message,
    ).toMatch(/closed/);
    expect(jobApplicationState({ apply_url: null }).message).toMatch(/No application link/);
    expect(jobApplicationState({ apply_url: 'javascript:x' }).message).toMatch(/not a valid/);
  });
  it('reports opening failures inline and never opens closed jobs', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
    expect(await openJobApplication({ apply_url: 'https://example.com' })).toMatch(/Couldn’t open/);
    await openJobApplication({ is_open: false, apply_url: 'https://example.com' });
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });
});
