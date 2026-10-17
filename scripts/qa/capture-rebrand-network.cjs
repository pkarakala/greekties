/* Actual RN Web screens with synthetic hooks. Browser requests are blocked;
 * service authorization/persistence are covered separately and never inferred here. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const {
  chromium,
} = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.SLICE_D_OUTPUT;
if (!out) throw new Error('SLICE_D_OUTPUT required');
const bundle = fs.readFileSync(path.join(out, 'fixture.js'), 'utf8');
const font = fs.readFileSync(path.join(out, 'Ionicons.ttf')).toString('base64');
const cases = [
  ...['loaded', 'loading', 'empty', 'error', 'counts-error', 'pagination'].map((mode) => [
    'directory',
    mode,
    'alumni',
  ]),
  ...['loaded', 'loading', 'empty', 'error', 'retry', 'pagination'].map((mode) => [
    'jobs',
    mode,
    'active',
  ]),
  ...[
    'loaded',
    'loading',
    'empty',
    'error',
    'blocked',
    'pending-member',
    'accepted',
    'pending',
    'compose',
    'save-error',
    'sending',
  ].map((mode) => ['profile', mode, 'active']),
  ...['loaded', 'loading', 'empty', 'error', 'retry', 'closed', 'invalid', 'apply-error'].map(
    (mode) => ['detail', mode, 'active'],
  ),
  ['detail', 'loaded', 'owner'],
  ['detail', 'loaded', 'admin'],
  ...['loaded', 'validation', 'save-error', 'pending'].map((mode) => ['new', mode, 'active']),
  ...['loaded', 'loading', 'empty', 'error', 'retry', 'save-error', 'pending'].map((mode) => [
    'edit',
    mode,
    'owner',
  ]),
  ['edit', 'loaded', 'active'],
  ['edit', 'loaded', 'admin'],
];
const sizes = [
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
  let page,
    current,
    errors = [];
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      timezoneId: 'America/Los_Angeles',
    });
    await context.route('**/*', (r) => r.abort());
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
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
              `small target ${el.getAttribute('aria-label') || el.textContent}: ${r.width}x${r.height}`,
            );
          // Intentional horizontal filter-chip rails may extend beyond the viewport.
          let ancestor = el.parentElement,
            scrolls = false;
          while (ancestor) {
            if (
              getComputedStyle(ancestor).overflowX === 'auto' ||
              getComputedStyle(ancestor).overflowX === 'scroll'
            )
              scrolls = true;
            ancestor = ancestor.parentElement;
          }
          if (!scrolls && (r.left < -1 || r.right > innerWidth + 1))
            issues.push('control outside viewport ' + el.textContent);
        }
        for (const el of document.querySelectorAll('[role="heading"]')) {
          const r = el.getBoundingClientRect();
          if (r.width && r.right > innerWidth + 1) issues.push('heading overflow');
        }
        return issues;
      });
    }
    async function scrollEnd() {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('div'))
          if (
            ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) &&
            el.scrollHeight > el.clientHeight
          )
            el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(80);
    }
    async function shot(name, config, position) {
      if (![375, 440].includes(config.width)) return;
      await page.screenshot({ path: path.join(out, name + '.png') });
      images.push({ name, ...config, position });
    }
    for (const size of sizes)
      for (const [screen, mode, role] of cases) {
        const config = { screen, mode, role, ...size },
          name = `${screen}-${mode}-${role}-${size.width}${size.scale > 1 ? '-large' : ''}`;
        current = name;
        errors = [];
        await page.evaluate(() => window.__qaRoot?.unmount());
        await page.setViewportSize({ width: size.width, height: 844 });
        await page.setContent(
          `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:#F6F8FC;font-family:system-ui}#root{height:844px;display:flex;flex-direction:column;overflow:hidden}*:focus-visible{outline:3px solid #123FA0;outline-offset:2px}</style><div id="root"></div>`,
        );
        await page.evaluate((config) => {
          window.__qa = config;
          window.process = { env: { NODE_ENV: 'development' } };
          window.fetch = () => {
            throw new Error('Network forbidden');
          };
        }, config);
        await page.addScriptTag({ content: bundle });
        await page.waitForFunction(() => document.getElementById('root').textContent.length > 0);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(80);
        if (
          screen === 'profile' &&
          !['loading', 'empty', 'error', 'blocked', 'pending-member'].includes(mode)
        )
          await page.getByRole('heading', { name: 'Alexandra Jordan Taylor Nguyen' }).waitFor();
        if (screen === 'edit' && !['loading', 'empty', 'error'].includes(mode) && role !== 'active')
          await page.getByLabel('Title', { exact: true }).waitFor();
        let issues = await bounds();
        await shot(name, config, 'initial');
        if (['directory', 'jobs'].includes(screen)) {
          assert.equal(await page.getByRole('tab', { name: 'Network', exact: true }).count(), 1);
          assert.equal(await page.getByRole('tab', { name: 'People', exact: true }).count(), 0);
          assert.equal(await page.getByRole('tab').count(), 5);
          const fontSize = await page
            .getByRole('heading', { name: 'Network', exact: true })
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          assert(Math.abs(fontSize - 27 * size.scale) < 0.1, 'font scaling bypass');
        }
        if (screen === 'directory' && mode === 'loaded') {
          await page.getByRole('button', { name: 'Alumni', exact: true }).click();
          await page.getByRole('button', { name: 'Mentors', exact: true }).click();
          await page.getByRole('button', { name: 'Hiring', exact: true }).click();
          await page
            .getByLabel('Industry (exact match, optional)', { exact: true })
            .fill('Technology');
          await page.getByLabel('Search by name, company, city', { exact: true }).fill('Northline');
          await page.waitForTimeout(300);
          await page.getByText('1 member loaded', { exact: true }).waitFor();
          await page
            .getByText('6912 approved members · 1234 active · 5678 alumni', { exact: true })
            .waitFor();
          await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
          await page.waitForTimeout(300);
          await scrollEnd();
          await page.getByRole('button', { name: /Alexandra Jordan Taylor Nguyen/ }).click();
          assert(
            (await page.evaluate(() => window.__actions)).some(
              (a) => a.pathname === '/profile/[id]',
            ),
          );
          interactions.push({
            name,
            check: 'combined filters, clear, real total vs loaded result, profile route',
            passed: true,
          });
        }
        if (screen === 'directory' && mode === 'counts-error') {
          await page.getByRole('button', { name: 'Retry totals' }).click();
          await page
            .getByText('6912 approved members · 1234 active · 5678 alumni', { exact: true })
            .waitFor();
          interactions.push({ name, check: 'totals retry', passed: true });
        }
        if (screen === 'directory' && mode === 'error') {
          await page.getByRole('button', { name: 'Retry search' }).click();
          await page.getByText('1 member loaded', { exact: true }).waitFor();
          interactions.push({ name, check: 'directory retry', passed: true });
        }
        if (screen === 'directory' && mode === 'pagination') {
          await scrollEnd();
          const load = page.getByRole('button', { name: 'Load more members' });
          if (await load.count()) await load.click();
          await page.getByText('Christopher Morgan Rivera', { exact: true }).waitFor();
          interactions.push({ name, check: 'directory pagination control', passed: true });
        }
        if (screen === 'jobs' && ['error', 'retry'].includes(mode)) {
          await page.getByRole('button', { name: 'Retry jobs' }).click();
          await page.getByText('1 job shown', { exact: true }).waitFor();
          interactions.push({ name, check: 'jobs retry', passed: true });
        }
        if (screen === 'jobs' && mode === 'loaded') {
          await page.getByLabel('Search jobs by title, company', { exact: true }).fill('Northline');
          await page.getByRole('button', { name: 'Technology', exact: true }).click();
          await page
            .getByRole('button', {
              name: 'Santa Barbara, California — remote within the United States',
              exact: true,
            })
            .click();
          await page.getByText('1 job shown', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Clear job filters' }).click();
          interactions.push({ name, check: 'combined job filters and clear', passed: true });
        }
        if (screen === 'profile' && mode === 'error') {
          await page.getByRole('button', { name: 'Retry profile' }).click();
          await page.getByRole('heading', { name: 'Alexandra Jordan Taylor Nguyen' }).waitFor();
          interactions.push({ name, check: 'profile retry', passed: true });
        }
        if (screen === 'profile' && ['compose', 'save-error', 'sending'].includes(mode)) {
          await page.getByRole('button', { name: 'Request mentorship', exact: true }).click();
          await page
            .getByLabel('Intro message', { exact: true })
            .fill('I would value your guidance on my first internship.');
          if (mode !== 'compose') {
            await page.getByRole('button', { name: 'Send request', exact: true }).click();
            if (mode === 'save-error')
              await page
                .getByText('Couldn’t send your request. Please retry.', { exact: true })
                .waitFor();
          }
          issues.push(...(await bounds()));
          await shot(name + '-form', config, 'request form');
          interactions.push({
            name,
            check: 'synthetic request draft, pending/error feedback',
            passed: true,
          });
        }
        if (screen === 'profile' && ['accepted', 'pending'].includes(mode)) {
          await page
            .getByRole('button', {
              name: mode === 'accepted' ? 'Open conversation' : 'Request pending',
              exact: true,
            })
            .click();
          assert(
            (await page.evaluate(() => window.__actions)).some(
              (a) => a.params?.requestId === 'existing',
            ),
          );
          interactions.push({ name, check: 'existing request route', passed: true });
        }
        if (screen === 'detail' && ['closed', 'invalid'].includes(mode))
          assert.equal(await page.getByRole('button', { name: 'Apply', exact: true }).count(), 0);
        if (screen === 'detail' && mode === 'loaded')
          assert.equal(
            await page.getByRole('button', { name: 'Edit posting', exact: true }).count(),
            ['owner', 'admin'].includes(role) ? 1 : 0,
          );
        if (screen === 'edit' && ['error', 'retry'].includes(mode)) {
          await page.getByRole('button', { name: 'Retry posting', exact: true }).click();
          await page.getByLabel('Title', { exact: true }).waitFor();
          interactions.push({
            name,
            check: 'editor read recovery without draft clobber',
            passed: true,
          });
        }
        if (screen === 'detail' && mode === 'error') {
          await page.getByRole('button', { name: 'Retry', exact: true }).click();
          await page.getByRole('button', { name: 'Apply', exact: true }).waitFor();
          interactions.push({ name, check: 'posting retry', passed: true });
        }
        if (screen === 'detail' && mode === 'apply-error') {
          await page.getByRole('button', { name: 'Apply', exact: true }).click();
          await page
            .getByText('Couldn’t open the application link. Please try again.', { exact: true })
            .waitFor();
          interactions.push({ name, check: 'external open error', passed: true });
        }
        if (
          ['new', 'edit'].includes(screen) &&
          ['validation', 'save-error', 'pending'].includes(mode)
        ) {
          if (screen === 'new' && mode !== 'validation') {
            await page.getByLabel('Title', { exact: true }).fill('Product designer');
            await page.getByLabel('Company', { exact: true }).fill('Northline');
          }
          await scrollEnd();
          await page
            .getByRole('button', {
              name: screen === 'new' ? 'Post job' : 'Save changes',
              exact: true,
            })
            .click();
          if (mode === 'validation')
            await page.getByText('Title and company are required.', { exact: true }).waitFor();
          if (mode === 'save-error')
            await page
              .getByText('Couldn’t save this posting. Please try again.', { exact: true })
              .waitFor();
          interactions.push({
            name,
            check: 'form validation, synthetic save error/pending',
            passed: true,
          });
        }
        await scrollEnd();
        issues.push(...(await bounds()));
        await shot(name + '-end', config, 'scrolled end');
        results.push({ name, ...config, issues: [...new Set(issues)], pageErrors: errors });
        if (results.length % 20 === 0) console.log('Checked', results.length, 'cases');
      }
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(out, 'interrupted-case.png') });
      fs.writeFileSync(
        path.join(out, 'interrupted-debug.txt'),
        await page.locator('body').innerText(),
      );
    }
    fs.writeFileSync(
      path.join(out, 'interrupted-case.json'),
      JSON.stringify(
        { current, error: String(error), pageErrors: errors, results, interactions },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(out, 'visual-checks.json'),
    JSON.stringify({ results, interactions }, null, 2),
  );
  fs.writeFileSync(
    path.join(out, 'GALLERY.html'),
    `<!doctype html><meta charset="utf-8"><title>Slice D visual review</title><style>body{font:16px system-ui;color:#142743;background:#F6F8FC;padding:24px}h1{font:32px Georgia}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0}img{max-width:100%;border:1px solid #D8DEE8}figcaption{padding:12px}</style><h1>Slice D / Network, profiles and opportunities</h1><p>Actual native source mounted through React Native Web. Synthetic hooks and profile-read adapter; all network requests blocked. Tab scaffold consumes actual tab options but is not Expo Router runtime evidence. Scale 1.6 approximates native font scaling. Native keyboards, accessibility, safe areas and backend authorization/persistence remain untested.</p><div class="grid">${images.map((i) => `<figure><a href="${i.name}.png"><img loading="lazy" src="${i.name}.png" alt="${i.name}"></a><figcaption>${i.name} / ${i.position}</figcaption></figure>`).join('')}</div>`,
  );
  const failed = results.filter((r) => r.issues.length || r.pageErrors.length);
  console.log(
    `${results.length} cases; ${images.length} screenshots; ${interactions.length} synthetic interactions; ${failed.length} visual failures`,
  );
  assert.equal(failed.length, 0, JSON.stringify(failed, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
