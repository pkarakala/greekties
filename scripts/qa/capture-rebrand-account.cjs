/* Actual RN Web components; synthetic hooks only. Network requests are blocked.
 * Native auth/storage/alerts/permissions and backend authorization are not inferred. */
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const {
  chromium,
} = require('/Users/pkarakala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.SLICE_E_OUTPUT;
if (!out) throw new Error('SLICE_E_OUTPUT required');
const bundle = fs.readFileSync(path.join(out, 'fixture.js'), 'utf8'),
  font = fs.readFileSync(path.join(out, 'Ionicons.ttf')).toString('base64');
const base = [
  ['me', 'loaded', 'owner'],
  ['edit', 'loaded', 'alumni'],
  ['blocked', 'loaded', 'alumni'],
  ['login', 'loaded', 'signed-out'],
  ['signup', 'loaded', 'signed-out'],
  ['forgot', 'loaded', 'signed-out'],
  ['reset', 'loaded', 'alumni'],
  ['join', 'loaded', 'signed-out'],
  ['membership', 'loaded', 'pending'],
  ['complete', 'loaded', 'alumni'],
  ['enter', 'loaded', 'signed-out'],
  ['create', 'loaded', 'new-member'],
  ...['admin', 'approvals', 'members', 'channels', 'reports', 'settings'].map((s) => [
    s,
    'loaded',
    'owner',
  ]),
];
const extra = [
  ...['legacy', 'loading', 'error', 'signout-error', 'link-error'].map((m) => ['me', m, 'alumni']),
  ['me', 'loaded', 'active'],
  ...['legacy', 'consent-on', 'save-error', 'save-pending', 'avatar-denied', 'avatar-pending'].map(
    (m) => ['edit', m, 'alumni'],
  ),
  ['edit', 'loaded', 'active'],
  ...['empty', 'error', 'loading', 'save-error'].map((m) => ['blocked', m, 'alumni']),
  ...['save-error', 'pending'].map((m) => ['login', m, 'signed-out']),
  ...['confirmed', 'save-error', 'pending'].map((m) => ['signup', m, 'signed-out']),
  ...['confirmed', 'save-error', 'pending'].map((m) => ['forgot', m, 'signed-out']),
  ...['expired', 'loading', 'save-error', 'pending'].map((m) => ['reset', m, 'alumni']),
  ['reset', 'loaded', 'signed-out'],
  ...['loading', 'error', 'invalid'].map((m) => ['join', m, 'signed-out']),
  ['join', 'loaded', 'pending'],
  ['join', 'loaded', 'removed'],
  ['join', 'loaded', 'owner'],
  ['join', 'wrong-chapter', 'alumni'],
  ['join', 'save-error', 'new-member'],
  ['join', 'save-pending', 'new-member'],
  ...['loading', 'error', 'missing'].map((m) => ['membership', m, 'new-member']),
  ['membership', 'loaded', 'removed'],
  ['membership', 'loaded', 'signed-out'],
  ['membership', 'loaded', 'owner'],
  ...['legacy', 'save-error', 'save-pending', 'avatar-denied'].map((m) => [
    'complete',
    m,
    'alumni',
  ]),
  ['complete', 'loaded', 'pending'],
  ['complete', 'missing', 'new-member'],
  ['enter', 'validation', 'signed-out'],
  ...['validation', 'save-error', 'save-pending'].map((m) => ['create', m, 'new-member']),
  ['admin', 'loaded', 'manager'],
  ['admin', 'loaded', 'active'],
  ['admin', 'error', 'owner'],
  ['admin', 'loading', 'owner'],
  ...['empty', 'error', 'loading', 'save-error', 'save-pending'].map((m) => [
    'approvals',
    m,
    'owner',
  ]),
  ['approvals', 'loaded', 'active'],
  ...['removed', 'empty', 'error', 'loading'].map((m) => ['members', m, 'owner']),
  ['members', 'loaded', 'manager'],
  ['members', 'loaded', 'active'],
  ...['empty', 'error', 'loading', 'save-error', 'save-pending'].map((m) => [
    'channels',
    m,
    'owner',
  ]),
  ['channels', 'loaded', 'active'],
  ...['empty', 'error', 'loading', 'save-error'].map((m) => ['reports', m, 'owner']),
  ['reports', 'loaded', 'active'],
  ...['loading', 'error', 'invite-error', 'save-error', 'save-pending'].map((m) => [
    'settings',
    m,
    'owner',
  ]),
  ['settings', 'loaded', 'active'],
];
const allSizes = [
  { width: 320, scale: 1 },
  { width: 375, scale: 1 },
  { width: 440, scale: 1 },
  { width: 820, scale: 1 },
  { width: 375, scale: 1.6 },
  { width: 440, scale: 1.6 },
];
const matrix = [
  ...allSizes.flatMap((size) =>
    base.map(([screen, mode, role]) => ({ screen, mode, role, ...size })),
  ),
  ...[
    { width: 375, scale: 1 },
    { width: 440, scale: 1.6 },
  ].flatMap((size) => extra.map(([screen, mode, role]) => ({ screen, mode, role, ...size }))),
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
    page.on('pageerror', (e) => errors.push(e.message));
    async function bounds() {
      return page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1)
          issues.push('horizontal page overflow');
        if (document.documentElement.scrollHeight > innerHeight + 1)
          issues.push('root vertical overflow');
        for (const el of document.querySelectorAll(
          '[role="button"],[role="tab"],[role="link"],input,textarea,[role="switch"]',
        )) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.width < 44 || r.height < 44)
            issues.push(
              `small target ${el.getAttribute('aria-label') || el.textContent}: ${r.width}x${r.height}`,
            );
          let parent = el.parentElement,
            rail = false;
          while (parent) {
            if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) rail = true;
            parent = parent.parentElement;
          }
          if (!rail && (r.left < -1 || r.right > innerWidth + 1))
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
        for (const e of document.querySelectorAll('div'))
          if (
            ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) &&
            e.scrollHeight > e.clientHeight
          )
            e.scrollTop = e.scrollHeight;
      });
      await page.waitForTimeout(50);
    }
    async function shot(name, config, position) {
      if (![375, 440].includes(config.width)) return;
      await page.screenshot({ path: path.join(out, name + '.png') });
      images.push({ name, ...config, position });
    }
    async function fillAuth(screen) {
      if (['login', 'signup', 'forgot'].includes(screen))
        await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
      if (screen === 'signup')
        await page.getByLabel('Full name', { exact: true }).fill('Synthetic Chapter Member');
      if (['login', 'signup'].includes(screen))
        await page.getByLabel('Password', { exact: true }).fill('synthetic-only-password');
      if (screen === 'reset') {
        await page.getByLabel('New password', { exact: true }).fill('synthetic-only-password');
        await page.getByLabel('Confirm password', { exact: true }).fill('synthetic-only-password');
      }
    }
    for (const config of matrix) {
      const { screen, mode, role, width, scale } = config;
      const name = `${screen}-${mode}-${role}-${width}${scale > 1 ? '-large' : ''}`;
      current = name;
      errors = [];
      await page.evaluate(() => window.__qaRoot?.unmount());
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}html,body{margin:0;background:#F6F8FC;font-family:system-ui}#root{height:844px;display:flex;flex-direction:column;overflow:hidden}*:focus-visible{outline:3px solid #123FA0;outline-offset:2px}</style><div id="root"></div>`,
      );
      await page.evaluate((c) => {
        window.__qa = c;
        window.process = { env: { NODE_ENV: 'development' } };
        window.fetch = () => {
          throw new Error('Network forbidden');
        };
      }, config);
      await page.addScriptTag({ content: bundle });
      await page.waitForFunction(() => document.getElementById('root').textContent.length > 0);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(50);
      if (screen === 'join' && mode !== 'loading')
        await page.getByRole('button', { name: 'Paste another invitation', exact: true }).waitFor();
      if (screen === 'settings' && role === 'owner' && !['loading', 'error'].includes(mode))
        await page.getByLabel('Chapter name', { exact: true }).waitFor();
      let issues = await bounds();
      await shot(name, config, 'initial');
      const adminScreens = ['admin', 'approvals', 'members', 'channels', 'reports', 'settings'];
      if (adminScreens.includes(screen) && role === 'active') {
        await page.getByText('Chapter admin access required.', { exact: true }).waitFor();
        assert.equal(
          await page.getByRole('button', { name: 'Create channel', exact: true }).count(),
          0,
        );
      }
      if (screen === 'me') {
        assert.equal(await page.getByRole('tab').count(), 5);
        assert.equal(await page.getByRole('tab', { name: 'Me', selected: true }).count(), 1);
        assert.equal(
          await page.getByRole('button', { name: 'Admin', exact: true }).count(),
          ['owner', 'manager'].includes(role) ? 1 : 0,
        );
        const px = await page
          .getByRole('heading', { name: 'Me', exact: true })
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        assert(Math.abs(px - 27 * scale) < 0.1);
        await scrollEnd();
        assert(
          await page
            .getByRole('button', { name: 'Account deletion unavailable', exact: true })
            .isDisabled(),
        );
        assert.equal(
          await page
            .getByRole('button', { name: 'Permanently delete account', exact: true })
            .count(),
          0,
        );
        if (mode === 'signout-error') {
          await page.getByRole('button', { name: 'Sign out', exact: true }).click();
          await page
            .getByText('Couldn’t sign out. Check your connection and try again.', { exact: true })
            .waitFor();
          interactions.push({ name, check: 'sign-out failure retains recovery', passed: true });
        }
        if (mode === 'link-error') {
          await page.getByRole('button', { name: 'Privacy Policy', exact: true }).click();
          await page
            .getByText('Couldn’t open this link. Please try again.', { exact: true })
            .waitFor();
          interactions.push({ name, check: 'legal-link open recovery', passed: true });
        }
      }
      if (['edit', 'complete'].includes(screen) && mode === 'legacy') {
        const control = page.getByRole('switch', {
          name: 'Share my city on the alumni map',
          exact: true,
        });
        assert(await control.isDisabled());
        assert.equal(await control.isChecked(), false);
        interactions.push({ name, check: 'legacy consent off and disabled', passed: true });
      }
      if (['edit', 'complete'].includes(screen) && mode === 'avatar-denied') {
        await page
          .getByRole('button', {
            name: screen === 'edit' ? 'Change photo' : 'Add a photo',
            exact: true,
          })
          .click();
        await page.getByText(/Allow photo access in Settings/).waitFor();
        interactions.push({ name, check: 'synthetic media permission denied', passed: true });
      }
      if (screen === 'edit' && mode === 'avatar-pending') {
        await page.getByRole('button', { name: 'Change photo', exact: true }).click();
        assert((await page.evaluate(() => window.__actions)).includes('avatar-upload'));
      }
      if (
        ['login', 'signup', 'forgot', 'reset'].includes(screen) &&
        ['save-error', 'pending', 'confirmed'].includes(mode)
      ) {
        await fillAuth(screen);
        const labels = {
          login: 'Log in',
          signup: 'Sign up',
          forgot: 'Send reset link',
          reset: 'Update password',
        };
        await page.getByRole('button', { name: labels[screen], exact: true }).click();
        if (mode === 'pending')
          assert(
            await page.getByRole('button', { name: labels[screen], exact: true }).isDisabled(),
          );
        if (mode === 'save-error')
          await page
            .getByText(
              screen === 'login'
                ? 'Wrong email or password.'
                : 'Synthetic request failed. Please retry.',
              { exact: true },
            )
            .waitFor();
        if (mode === 'confirmed')
          await page
            .getByText(
              screen === 'signup'
                ? /Check your email to confirm/
                : /Check your email for a reset link/,
            )
            .waitFor();
        interactions.push({
          name,
          check: 'synthetic auth submission state; no email sent',
          passed: true,
        });
        await shot(name + '-submission', config, 'submission state');
      }
      if (screen === 'reset' && (mode === 'expired' || role === 'signed-out'))
        assert(
          await page.getByRole('button', { name: 'Update password', exact: true }).isDisabled(),
        );
      if (screen === 'join' && ['pending', 'removed'].includes(role))
        assert.equal(
          await page.getByRole('button', { name: 'Join chapter', exact: true }).count(),
          0,
        );
      if (screen === 'join' && ['save-error', 'save-pending'].includes(mode)) {
        await page.getByRole('button', { name: 'Join chapter', exact: true }).click();
        if (mode === 'save-error')
          await page.getByText('Couldn’t join. Please retry.', { exact: true }).waitFor();
        interactions.push({
          name,
          check: 'join is explicit; synthetic submission state',
          passed: true,
        });
        await shot(name + '-submission', config, 'submission state');
      }
      if (screen === 'join' && mode === 'error') {
        await page.getByRole('button', { name: 'Retry invitation', exact: true }).click();
        await page.getByRole('heading', { name: 'Sigma Phi Epsilon', exact: true }).waitFor();
        interactions.push({ name, check: 'temporary invitation failure Retry', passed: true });
      }
      if (screen === 'enter' && mode === 'validation') {
        await page.getByRole('button', { name: 'Join', exact: true }).click();
        await page
          .getByText('Enter a valid code or the complete Greek Ties invitation link.', {
            exact: true,
          })
          .waitFor();
      }
      if (screen === 'create' && ['validation', 'save-error', 'save-pending'].includes(mode)) {
        if (mode !== 'validation')
          await page.getByLabel('Chapter name', { exact: true }).fill('Synthetic Chapter');
        await page.getByRole('button', { name: 'Create chapter', exact: true }).click();
        if (mode === 'validation')
          await page.getByText('Chapter name is required.', { exact: true }).waitFor();
        if (mode === 'save-error')
          await page
            .getByText('Couldn’t create the chapter. Please retry.', { exact: true })
            .waitFor();
        interactions.push({ name, check: 'create validation/synthetic submit', passed: true });
      }
      if (['edit', 'complete'].includes(screen) && ['save-error', 'save-pending'].includes(mode)) {
        await scrollEnd();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        if (mode === 'save-error')
          await page
            .getByText('Couldn’t save your profile. Please retry.', { exact: true })
            .waitFor();
        else assert(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled());
        interactions.push({ name, check: 'profile draft and synthetic save state', passed: true });
      }
      if (
        ['approvals', 'channels', 'settings'].includes(screen) &&
        ['save-error', 'save-pending'].includes(mode)
      ) {
        const labels = {
          approvals: 'Approve',
          channels: 'Create channel',
          settings: 'Save changes',
        };
        if (screen === 'channels')
          await page.getByLabel('Name', { exact: true }).fill('Synthetic chapter group');
        await page.getByRole('button', { name: labels[screen], exact: true }).click();
        if (screen === 'channels' && mode === 'save-error')
          await page.getByText('Synthetic change failed. Please retry.', { exact: true }).waitFor();
        if (screen === 'settings' && mode === 'save-error')
          await page.getByText('Synthetic change failed. Please retry.', { exact: true }).waitFor();
        interactions.push({
          name,
          check: 'synthetic authorized management submission',
          passed: true,
        });
        await shot(name + '-submission', config, 'submission state');
      }
      if (screen === 'reports' && mode === 'save-error') {
        await page.getByRole('button', { name: 'Resolve', exact: true }).click();
        await page.getByRole('button', { name: 'Resolve', exact: true }).waitFor();
        interactions.push({
          name,
          check: 'report status rollback after synthetic failure',
          passed: true,
        });
      }
      if (screen === 'blocked' && mode === 'save-error') {
        await page.getByRole('button', { name: 'Unblock', exact: true }).click();
        await page.evaluate(() =>
          window.__alertButtons.find((b) => b.text === 'Unblock').onPress(),
        );
        await page.getByText('Christopher Morgan Rivera Hernandez', { exact: true }).waitFor();
        interactions.push({
          name,
          check: 'unblock confirmation and rollback; alert adapter',
          passed: true,
        });
      }
      if (screen === 'members' && mode === 'removed') {
        await page
          .getByRole('button', { name: 'View removed / declined members', exact: true })
          .click();
        await page.getByRole('button', { name: 'Reinstate', exact: true }).click();
        await page.getByRole('button', { name: 'Confirm reinstatement', exact: true }).waitFor();
        interactions.push({
          name,
          check: 'existing explicit reinstatement confirmation',
          passed: true,
        });
      }
      const retries = {
        me: 'Retry chapter identity',
        blocked: 'Retry blocked members',
        admin: 'Retry member approvals',
        approvals: 'Retry member approvals',
        members: 'Retry chapter members',
        channels: 'Retry channels',
        reports: 'Retry reports',
        settings: 'Retry chapter settings',
      };
      if (mode === 'error' && retries[screen]) {
        await page.getByRole('button', { name: retries[screen], exact: true }).click();
        interactions.push({ name, check: 'existing read Retry', passed: true });
      }
      await scrollEnd();
      issues.push(...(await bounds()));
      await shot(name + '-end', config, 'scrolled/recovered end');
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
    `<!doctype html><meta charset="utf-8"><title>Slice E visual gallery</title><style>body{font:16px system-ui;background:#F6F8FC;color:#142743;padding:24px}h1{font:32px Georgia}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0}img{max-width:100%;border:1px solid #D8DEE8}figcaption{padding:12px}</style><h1>Slice E / Account, onboarding and management</h1><p>Actual native source mounted through RN Web with synthetic hooks and adapters. All browser requests blocked. No email, SMS, credentials, uploads or backend writes. Native alerts, OS keyboard, secure storage, recovery callbacks and device permissions are not established. Font scale 1.6 approximates native scaling; tabs consume actual options in a scaffold.</p><div class="grid">${images.map((i) => `<figure><a href="${i.name}.png"><img loading="lazy" src="${i.name}.png" alt="${i.name}"></a><figcaption>${i.name} / ${i.position}</figcaption></figure>`).join('')}</div>`,
  );
  const failed = results.filter((r) => r.issues.length || r.pageErrors.length);
  console.log(
    `${results.length} cases; ${images.length} screenshots; ${interactions.length} interactions; ${failed.length} visual failures`,
  );
  assert.equal(failed.length, 0, JSON.stringify(failed, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
