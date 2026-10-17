/* Actual mounted component/browser evidence with synthetic hooks. All page
 * requests blocked. Authorization and persistence are established only by the
 * separate real-code synthetic unit tests, never by these mock services. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const {
  chromium,
} = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.SLICE_C_OUTPUT;
if (!out) throw new Error('SLICE_C_OUTPUT required');
const bundle = fs.readFileSync(path.join(out, 'fixture.js'), 'utf8');
const font = fs.readFileSync(path.join(out, 'Ionicons.ttf')).toString('base64');
const cases = [
  ...['loaded', 'loading', 'empty', 'error', 'retry', 'revoked'].map((mode) => ['inbox', mode]),
  ...[
    'loaded',
    'long',
    'empty',
    'pending',
    'failed',
    'uncertain',
    'error',
    'retry',
    'revoked',
    'draft',
    'loading',
  ].map((mode) => ['group', mode]),
  ...[
    'loaded',
    'long',
    'incoming',
    'outgoing',
    'declined',
    'loading',
    'error',
    'retry',
    'revoked',
    'pending',
    'failed',
    'uncertain',
  ].map((mode) => ['mentor', mode]),
  ...['loaded', 'loading', 'empty', 'error'].map((mode) => ['requests', mode]),
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
  let current,
    page,
    errors = [];
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      timezoneId: 'America/Los_Angeles',
    });
    await context.route('**/*', (r) => r.abort());
    page = await context.newPage();
    errors = [];
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
          if (r.left < -1 || r.right > innerWidth + 1)
            issues.push('horizontal control outside viewport ' + el.textContent);
        }
        for (const row of document.querySelectorAll(
          '[role="button"][aria-label*="mentorship request"]',
        ))
          if (getComputedStyle(row).flexDirection === 'column') {
            const children = row.children;
            if (children.length >= 3) {
              const body = children[1].getBoundingClientRect(),
                status = children[2].getBoundingClientRect();
              if (body.height < 1 || status.top < body.bottom - 1)
                issues.push('request status overlaps its text');
            }
          }
        const input = document.querySelector('[aria-label="Message draft"]');
        if (input) {
          const r = input.getBoundingClientRect();
          if (r.bottom > innerHeight + 1) issues.push('composer below viewport');
          const list = document.querySelector('[data-testid="conversation-messages"]');
          if (list && list.getBoundingClientRect().height < 150)
            issues.push('composer leaves insufficient thread space');
        }
        return issues;
      });
    }
    for (const size of sizes)
      for (const [screen, mode] of cases) {
        const config = { screen, mode, role: 'alumni', ...size },
          name = `${screen}-${mode}-${size.width}${size.scale > 1 ? '-large' : ''}`;
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
        if (
          ['group', 'mentor'].includes(screen) &&
          !['loading', 'error', 'revoked', 'incoming', 'outgoing', 'declined', 'empty'].includes(
            mode,
          )
        ) {
          await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="conversation-messages"]');
            return el && el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          });
          await page
            .getByText('Latest message: see you on the lawn this Saturday.', { exact: true })
            .waitFor();
        }
        if (screen === 'inbox') {
          const sizePx = await page
            .getByRole('heading', { name: 'Chats', exact: true })
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          assert(Math.abs(sizePx - 27 * size.scale) < 0.1, 'font scaling bypass');
        }
        const issues = await bounds();
        if ([375, 440].includes(size.width)) {
          await page.screenshot({ path: path.join(out, name + '.png') });
          images.push({ name, ...config, position: 'initial' });
        }
        if (screen === 'inbox' && mode === 'loaded') {
          await page.getByRole('tab', { name: 'Groups', exact: true }).click();
          assert.equal(
            await page
              .getByRole('button', { name: /Alexandra Jordan Taylor Nguyen, accepted mentorship/ })
              .count(),
            0,
          );
          await page.getByRole('tab', { name: 'All', exact: true }).click();
          await page.getByLabel('Search conversations', { exact: true }).fill('portfolio');
          assert.equal(
            await page
              .getByRole('button', { name: /Chapter chat and alumni weekend planning, group/ })
              .count(),
            0,
          );
          await page.getByRole('button', { name: 'Clear search' }).click();
          await page.getByRole('button', { name: 'Requests, review mentorship requests' }).click();
          assert((await page.evaluate(() => window.__actions)).includes('/inbox'));
          interactions.push({
            name,
            check: 'existing filter/search/Requests routes',
            passed: true,
          });
        }
        if (['group', 'mentor'].includes(screen) && mode === 'long') {
          const list = page.getByTestId('conversation-messages');
          // Real RN Web FlatList, no substituted list/positioning implementation.
          await list.hover();
          await page.mouse.wheel(0, -700);
          await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="conversation-messages"]');
            return el.scrollHeight - el.scrollTop - el.clientHeight > 200;
          });
          await page.evaluate(() => window.__appendMessage());
          await page.getByRole('button', { name: 'Jump to latest messages' }).waitFor();
          const away = await list.evaluate(
            (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
          );
          assert(away > 150, 'arrival stole reader position');
          if ([375, 440].includes(size.width)) {
            await page.screenshot({ path: path.join(out, name + '-reading.png') });
            images.push({
              name: name + '-reading',
              ...config,
              position: 'reading earlier history',
            });
          }
          await page.getByRole('button', { name: 'Jump to latest messages' }).click();
          await page.waitForFunction(() => {
            const el = document.querySelector('[data-testid="conversation-messages"]');
            return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          });
          interactions.push({
            name,
            check:
              '160-message settled initial position, reader control, arrival and explicit jump',
            passed: true,
          });
        }
        if (['group', 'mentor'].includes(screen) && mode === 'loaded') {
          const input = page.getByLabel('Message draft', { exact: true });
          await input.fill('Synthetic message from the existing composer.');
          await page.getByRole('button', { name: 'Send message' }).click();
          await page
            .getByText('Synthetic message from the existing composer.', { exact: true })
            .waitFor();
          assert((await page.evaluate(() => window.__actions)).some((a) => a.send));
          interactions.push({ name, check: 'synthetic send from actual composer', passed: true });
          if (screen === 'mentor') {
            await page.getByRole('button', { name: 'Refresh conversation' }).click();
            assert(
              (await page.evaluate(() => window.__actions)).some((a) => a.refresh === 'mentorship'),
            );
            interactions.push({ name, check: 'healthy mentorship refresh', passed: true });
          }
        }
        if (['group', 'mentor'].includes(screen) && ['failed', 'uncertain'].includes(mode)) {
          await page.getByRole('button', { name: 'Discard saved message', exact: true }).click();
          await page.getByRole('button', { name: 'Cancel discard saved message' }).click();
          assert.equal(await page.getByRole('button', { name: 'Retry message' }).count(), 1);
          await page.getByRole('button', { name: 'Retry message' }).click();
          assert((await page.evaluate(() => window.__actions)).some((a) => a.retry));
          interactions.push({
            name,
            check: 'synthetic saved-attempt cancel/Retry controls',
            passed: true,
          });
        }
        if (['group', 'mentor'].includes(screen) && mode === 'pending')
          assert(await page.getByRole('button', { name: 'Send message' }).isDisabled());
        if (screen === 'mentor' && ['incoming', 'outgoing', 'declined', 'revoked'].includes(mode)) {
          assert.equal(await page.getByLabel('Message draft', { exact: true }).count(), 0);
          assert.equal(
            await page.getByRole('button', { name: 'Accept', exact: true }).count(),
            mode === 'incoming' ? 1 : 0,
          );
          interactions.push({
            name,
            check: 'existing pending/declined/revoked composer gate',
            passed: true,
          });
        }
        if (mode === 'error') {
          const label =
            screen === 'inbox'
              ? 'Retry groups'
              : screen === 'requests'
                ? 'Retry requests'
                : screen === 'group'
                  ? 'Reload messages'
                  : 'Reload conversation';
          await page.getByRole('button', { name: label, exact: true }).click();
          interactions.push({ name, check: 'synthetic read recovery control', passed: true });
        }
        if (screen === 'requests' && mode === 'loaded') {
          assert.equal(await page.getByText('pending', { exact: true }).count(), 1);
          assert.equal(await page.getByText('accepted', { exact: true }).count(), 1);
          assert.equal(await page.getByText('declined', { exact: true }).count(), 1);
        }
        results.push({ name, ...config, issues: [...new Set(issues)], pageErrors: errors });
        if (results.length % 20 === 0) console.log('Checked', results.length, 'cases');
      }
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(out, 'interrupted-case.png') });
      const debug = await page.evaluate(() => ({
        text: document.body.innerText,
        scrolls: [...document.querySelectorAll('div')]
          .filter(
            (el) => el.getAttribute('data-testid') || getComputedStyle(el).overflowY === 'auto',
          )
          .map((el) => ({
            testID: el.getAttribute('data-testid'),
            top: el.scrollTop,
            height: el.clientHeight,
            scrollHeight: el.scrollHeight,
            box: el.getBoundingClientRect().toJSON(),
            overflow: getComputedStyle(el).overflowY,
          })),
      }));
      fs.writeFileSync(path.join(out, 'interrupted-debug.json'), JSON.stringify(debug, null, 2));
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
    `<!doctype html><meta charset="utf-8"><title>Slice C / Chats visual review</title><style>body{font:16px system-ui;color:#142743;background:#F6F8FC;padding:24px}h1{font:32px Georgia}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0}img{max-width:100%;border:1px solid #D8DEE8}figcaption{padding:12px}</style><h1>Slice C / Chats</h1><p>Actual components mounted through RN Web, including the actual virtualized conversation list. Synthetic service/recovery hooks; network requests blocked. Long history has 160 messages. Native keyboards, safe areas, screen readers and backend persistence are not established. Font scale 1.6 approximates native scaling and exercises actual responsive branches. Tabs use actual option values in a scaffold, not the Expo Router runtime.</p><div class="grid">${images.map((i) => `<figure><a href="${i.name}.png"><img loading="lazy" src="${i.name}.png" alt="${i.name}"></a><figcaption>${i.name} / ${i.position}</figcaption></figure>`).join('')}</div>`,
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
