/* Automated, offline screenshot QA of synthetic component markup. Never navigate
 * to the prototype or an external URL; browser requests are blocked. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {
  chromium,
} = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.SLICE_A_OUTPUT;
if (!out) throw new Error('SLICE_A_OUTPUT required');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [],
    shots = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    for (const fixture of JSON.parse(fs.readFileSync(path.join(out, 'fixtures.json')))) {
      await page.setViewportSize({ width: fixture.width, height: 844 });
      await page.setContent(fs.readFileSync(path.join(out, fixture.name + '.html'), 'utf8'));
      await page.evaluate(() => document.fonts.ready);
      const issues = await page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1)
          issues.push('page horizontal overflow');
        for (const el of document.querySelectorAll('[role="button"],[role="tab"]')) {
          const r = el.getBoundingClientRect();
          if (r.width < 44 || r.height < 44)
            issues.push(`small target ${el.textContent}: ${r.width}x${r.height}`);
          if (el.scrollWidth > el.clientWidth + 2)
            issues.push('control overflow ' + el.textContent);
        }
        if (document.querySelectorAll('[role="tab"]').length !== 5)
          issues.push('five tabs missing');
        if (document.querySelectorAll('[role="tab"][aria-selected="true"]').length !== 1)
          issues.push('selection missing');
        return issues;
      });
      results.push({ ...fixture, issues });
      if (
        fixture.width !== 320 &&
        (['loaded', 'long'].includes(fixture.mode) || fixture.role === 'alumni')
      ) {
        await page.screenshot({ path: path.join(out, fixture.name + '.png'), fullPage: true });
        shots.push(fixture.name);
      }
    }
    for (const tab of ['index', 'chats', 'events', 'people', 'me']) {
      await page.setViewportSize({ width: 375, height: 120 });
      await page.setContent(fs.readFileSync(path.join(out, `tabs-${tab}.html`), 'utf8'));
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
      await page.screenshot({ path: path.join(out, `tabs-${tab}.png`), fullPage: true });
      shots.push(`tabs-${tab}`);
    }
    fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(
      path.join(out, 'GALLERY.html'),
      `<!doctype html><meta charset="utf-8"><title>Slice A actual Home</title><style>body{font:16px system-ui;background:#F6F8FC;color:#142743;padding:24px}h1{font:32px Georgia}a{color:#123FA0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0}img{max-width:100%;border:1px solid #D8DEE8}figcaption{padding:12px}</style><h1>Slice A / Home review</h1><p>Actual React Native Home via react-native-web static rendering. Synthetic data, no backend. Real Ionicons glyphs. Tab scaffold consumes actual options, not an Expo Router runtime. Enlarged text approximates native fontScale 1.6. Native device testing remains unavailable.</p><div class="grid">${shots.map((name) => `<figure><a href="${name}.html"><img loading="lazy" src="${name}.png" alt="${name}"></a><figcaption>${name}</figcaption></figure>`).join('')}</div>`,
    );
    const failures = results.filter((r) => r.issues.length);
    console.log(
      `${results.length} fixtures; ${shots.length} screenshots; ${failures.length} bounds/target failures`,
    );
    assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
