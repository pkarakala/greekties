/* Interactive browser/component QA only. Synthetic services; all requests blocked.
 * No production access, OS UI interaction, native build, or backend persistence claim. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const {
  chromium,
} = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.SLICE_B_OUTPUT;
if (!out) throw new Error('SLICE_B_OUTPUT required');
const bundle = fs.readFileSync(path.join(out, 'fixture.js'), 'utf8');
const font = fs.readFileSync(path.join(out, 'Ionicons.ttf')).toString('base64');
const cases = [
  ['home', 'loaded', 'active'],
  ['home', 'long', 'alumni'],
  ...['loaded', 'loading', 'empty', 'error', 'retry'].map((mode) => ['agenda', mode, 'alumni']),
  ...['loaded', 'loading', 'empty', 'error', 'retry', 'unknown', 'saving'].map((mode) => [
    'detail',
    mode,
    'alumni',
  ]),
  ['detail', 'loaded', 'admin'],
  ['new', 'loaded', 'active'],
  ['new', 'save-error', 'active'],
  ...['loaded', 'loading', 'empty', 'error', 'save-error'].map((mode) => ['edit', mode, 'admin']),
  ['edit', 'loaded', 'alumni'],
];
const viewports = [
  { width: 320, scale: 1 },
  { width: 375, scale: 1 },
  { width: 440, scale: 1 },
  { width: 820, scale: 1 },
  { width: 375, scale: 1.6 },
  { width: 440, scale: 1.6 },
];
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [],
    images = [],
    interactions = [];
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      timezoneId: 'America/Los_Angeles',
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    let errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function scrollEnd() {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('div'))
          if (getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 20)
            el.scrollTop = el.scrollHeight;
      });
    }
    async function bounds() {
      return page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1)
          issues.push('horizontal page overflow');
        if (document.documentElement.scrollHeight > innerHeight + 1)
          issues.push('root vertical overflow');
        for (const el of document.querySelectorAll('[role="button"],[role="tab"],input,textarea')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.width < 44 || r.height < 44)
            issues.push(
              `small target: ${el.getAttribute('aria-label') || el.textContent} ${r.width}x${r.height}`,
            );
          if (r.left < -1 || r.right > innerWidth + 1) {
            // Category chips intentionally scroll horizontally.
            let ancestor = el.parentElement,
              intentional = false;
            while (ancestor) {
              if (getComputedStyle(ancestor).overflowX === 'auto') intentional = true;
              ancestor = ancestor.parentElement;
            }
            if (!intentional) issues.push('horizontal control outside viewport: ' + el.textContent);
          }
        }
        const dock = document.querySelector('[data-testid="event-rsvp-dock"]');
        if (dock) {
          const r = dock.getBoundingClientRect();
          if (r.bottom > innerHeight + 1 || r.top < 0) issues.push('RSVP dock outside viewport');
          if (r.top < 200) issues.push('RSVP dock leaves insufficient detail space');
        }
        return issues;
      });
    }
    for (const viewport of viewports)
      for (const [screen, mode, role] of cases) {
        const config = { screen, mode, role, ...viewport },
          name = `${screen}-${mode}-${role}-${viewport.width}${viewport.scale > 1 ? '-large' : ''}`;
        errors = [];
        await page.setViewportSize({ width: viewport.width, height: 844 });
        await page.evaluate(() => window.__qaRoot?.unmount());
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:#F6F8FC;font-family:system-ui}#root{height:844px;display:flex;flex-direction:column;overflow:hidden}label{display:flex;flex-direction:column;gap:8px;font-size:${15 * viewport.scale}px;line-height:${23 * viewport.scale}px;color:#142743}*:focus-visible{outline:3px solid #123FA0;outline-offset:2px}</style></head><body><div id="root"></div></body></html>`,
        );
        await page.evaluate((config) => {
          window.__qa = config;
          window.process = { env: { NODE_ENV: 'development' } };
          window.fetch = () => {
            throw new Error('Network forbidden');
          };
        }, config);
        await page.addScriptTag({ content: bundle });
        await page.waitForFunction(() => document.querySelector('#root').textContent.length > 0);
        await page.evaluate(() => document.fonts.ready);
        if (screen === 'edit' && ['loaded', 'save-error'].includes(mode) && role === 'admin')
          await assert.doesNotReject(() => page.getByLabel('Title', { exact: true }).waitFor());
        if (screen === 'edit' && mode === 'save-error') {
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
          await page.getByRole('alert').waitFor();
        }
        if (screen === 'new') {
          await page
            .getByLabel('Title', { exact: true })
            .fill('Chapter connections and an evening with returning alumni');
          await page.getByLabel('Start date', { exact: true }).fill('2099-11-06');
          await page.getByLabel('Start time', { exact: true }).fill('16:00');
          await page.getByLabel('End (optional) date', { exact: true }).fill('2099-11-06');
          await page.getByLabel('End (optional) time', { exact: true }).fill('19:00');
          await page.getByLabel('Location', { exact: true }).fill('Campus lawn, Santa Barbara');
          await page
            .getByLabel('Description', { exact: true })
            .fill(
              'Bring a question or just yourself. A relaxed chapter gathering with conversation, introductions, and shared stories.',
            );
          if (mode === 'save-error') {
            await page.getByRole('button', { name: 'Create event', exact: true }).click();
            await page.getByRole('alert').waitFor();
          }
        }
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('div'))
            if (getComputedStyle(el).overflowY === 'auto') el.scrollTop = 0;
        });
        // Guard against Expo's optimized web imports bypassing scale injection.
        if (screen === 'home') {
          const size = await page
            .getByText('Greek Ties', { exact: true })
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          assert(Math.abs(size - 27 * viewport.scale) < 0.1, `font scale bypass: ${size}`);
        }
        if (screen === 'detail' && mode === 'loaded' && viewport.scale > 1) {
          const choices = await page
            .getByRole('button', { name: 'Going', exact: true })
            .boundingBox();
          const next = await page
            .getByRole('button', { name: 'Interested', exact: true })
            .boundingBox();
          assert(next.y > choices.y, 'enlarged RSVP choices must stack');
        }
        const issues = await bounds();
        const screenshot = viewport.width !== 320 && viewport.width !== 820;
        if (screenshot) {
          await page.screenshot({ path: path.join(out, name + '.png') });
          images.push({ name, config, position: 'top' });
        }
        await scrollEnd();
        issues.push(...(await bounds()));
        if (screenshot && ['loaded', 'retry', 'save-error'].includes(mode)) {
          await page.screenshot({ path: path.join(out, name + '-end.png') });
          images.push({ name: name + '-end', config, position: 'end' });
        }
        if (screen === 'home') {
          assert.equal(
            await page.getByText('Sigma Phi Epsilon · California Gamma', { exact: true }).count(),
            1,
          );
          const university = page.getByText(
            mode === 'long'
              ? 'University of California, Santa Barbara — College of Letters and Science'
              : 'University of California, Santa Barbara',
            { exact: true },
          );
          assert.equal(await university.count(), 1);
        }
        if (screen === 'detail' && mode === 'loaded') {
          await page.getByRole('button', { name: 'Going', exact: true }).click();
          await page.getByText('Your response: Going', { exact: true }).waitFor();
          assert((await page.evaluate(() => window.__actions)).some((a) => a.rsvp === 'going'));
          assert.equal(await page.getByText('Blocked Guest', { exact: true }).count(), 0);
          assert.equal(
            await page.getByRole('button', { name: 'Edit event', exact: true }).count(),
            role === 'admin' ? 1 : 0,
          );
          interactions.push({
            name,
            check: 'direct synthetic RSVP + blocked guest + management role',
            passed: true,
          });
        }
        if (screen === 'detail' && ['saving', 'unknown'].includes(mode)) {
          assert(await page.getByRole('button', { name: 'Going', exact: true }).isDisabled());
        }
        if (screen === 'agenda' && mode === 'loaded') {
          await page.getByRole('button', { name: 'Social', exact: true }).click();
          await page.getByText('No matching events', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
          await page
            .getByText(
              'Back in Santa Barbara: an evening of shared stories and chapter connections',
              { exact: true },
            )
            .waitFor();
          interactions.push({ name, check: 'combined category filter recovery', passed: true });
        }
        if (['agenda', 'detail', 'edit'].includes(screen) && mode === 'error') {
          await page.getByRole('button', { name: 'Retry', exact: true }).click();
          if (screen === 'edit') await page.getByLabel('Title', { exact: true }).waitFor();
          else
            await page
              .getByText(
                'Back in Santa Barbara: an evening of shared stories and chapter connections',
                { exact: true },
              )
              .waitFor();
          interactions.push({ name, check: 'synthetic read Retry recovery', passed: true });
        }
        if (screen === 'edit' && role === 'alumni')
          assert.equal(await page.getByLabel('Title', { exact: true }).count(), 0);
        results.push({ name, ...config, issues: [...new Set(issues)], pageErrors: errors });
      }
    fs.writeFileSync(
      path.join(out, 'visual-checks.json'),
      JSON.stringify({ results, interactions }, null, 2),
    );
    fs.writeFileSync(
      path.join(out, 'GALLERY.html'),
      `<!doctype html><meta charset="utf-8"><title>Slice B / Actual component gallery</title><style>body{font:16px system-ui;color:#142743;background:#F6F8FC;padding:24px}h1{font:32px Georgia}a{color:#123FA0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0}img{max-width:100%;border:1px solid #D8DEE8}figcaption{padding:12px}</style><h1>Slice B / Home refinement and Events</h1><p>Actual React Native components mounted through React Native Web. Synthetic services; all network requests blocked. Native date pickers, backend persistence, device safe areas and screen readers are not established. Font scaling 1.6 is a web approximation; actual responsive fontScale branches run. Five-tab scaffold reads actual tab options; it is not the Expo Router runtime.</p><div class="grid">${images.map((image) => `<figure><a href="${image.name}.png"><img loading="lazy" src="${image.name}.png" alt="${image.name}"></a><figcaption>${image.name} / ${image.position}</figcaption></figure>`).join('')}</div>`,
    );
    const failures = results.filter((r) => r.issues.length || r.pageErrors.length);
    console.log(
      `${results.length} rendered cases; ${images.length} screenshots; ${interactions.length} synthetic interaction checks; ${failures.length} visual failures`,
    );
    assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
