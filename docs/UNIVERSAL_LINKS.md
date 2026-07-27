# Invite Links & Universal Links

*How invite links work today, and what it takes to upgrade to true
iOS Universal Links / Android App Links later.*

## Current model (works for everyone, no app required)

Invite links are plain HTTPS links to the Expo **web build** on GitHub Pages:

```
https://pkarakala.github.io/greekties/join/<code>
```

- `lib/links.ts` is the single source of truth (`WEB_BASE_URL`, `joinLink()`,
  `joinMessage()`). `InviteCard` and Chapter settings both use it.
- The web app resolves `/join/<code>` with expo-router — the **same route file**
  (`app/join/[code].tsx`) that handles the native deep link. `baseUrl:
  '/greekties'` in `app.config.ts` makes the router path-aware under the Pages
  subpath, and the workflow copies `index.html` → `404.html` so Pages serves the
  SPA for unknown deep paths.
- The custom scheme `greekties://join/<code>` still works as a **secondary**
  path for people who already have the app; `joinMessage()` includes it as a
  hint ("Have the app? Open greekties://join/<code>"). Custom schemes do
  nothing for people without the app — that's why the web link comes first.

Recipient without the app → lands on the web app, can sign up and join there.
Recipient with the app → taps the scheme link (or pastes the code into
Onboarding → "Enter a code", which accepts full links too).

## Upgrade path: true Universal Links / App Links

True universal links make the **HTTPS link itself** open the native app when
installed (no scheme needed). Requirements:

1. **Custom domain** (e.g. `greekties.app`) serving the web build. Apple and
   Google both associate links with a *domain*, not a subpath — you cannot
   register `pkarakala.github.io/greekties` because the association applies to
   all of `pkarakala.github.io`.

2. **iOS — apple-app-site-association (AASA)** hosted at
   `https://<domain>/.well-known/apple-app-site-association`:
   - Served with `Content-Type: application/json`
   - No redirects on that URL (Apple's CDN won't follow them)
   - No file extension; valid JSON with your `appID`
     (`<TeamID>.com.greekties.app`) and paths like `"/join/*"`
   - Apple's CDN fetches and caches it — changes take up to a day.

3. **iOS — app config**: add to `app.config.ts`:
   ```ts
   ios: { associatedDomains: ['applinks:greekties.app'] }
   ```
   Requires the Associated Domains capability on the App ID (EAS handles this
   during the build when `associatedDomains` is set).

4. **Android — assetlinks.json** at
   `https://<domain>/.well-known/assetlinks.json` (also `application/json`,
   no redirect) with the app's package name + release signing cert SHA-256,
   and intent filters in `app.config.ts`:
   ```ts
   android: {
     intentFilters: [
       {
         action: 'VIEW',
         autoVerify: true,
         data: [{ scheme: 'https', host: 'greekties.app', pathPrefix: '/join' }],
         category: ['BROWSABLE', 'DEFAULT'],
       },
     ],
   }
   ```

5. Keep the web build deployed at the same domain so the link still works for
   people without the app — universal links silently fall back to the browser.

### Why GitHub Pages is a shaky AASA host

- **Content-Type**: Pages serves extensionless files as `application/octet-stream`,
  not `application/json`. Apple's requirements say AASA must be JSON with the
  right content type; octet-stream *sometimes* works but is not guaranteed and
  has broken across iOS versions. Don't build on it.
- **Domain scope**: on the default `pkarakala.github.io` host, the association
  would cover the whole user site, and you can't scope it to `/greekties`.
- A custom domain on Pages fixes the scope problem but not the content-type
  one. When it's time, host the web build (or at least `/.well-known/`) on
  something that controls headers: Cloudflare Pages, Netlify, Vercel, or
  S3+CloudFront all work.

### Checklist when upgrading

- [ ] Buy domain, point it at the web build host
- [ ] Update `WEB_BASE_URL` in `lib/links.ts`
- [ ] Host AASA + assetlinks.json under `/.well-known/` with correct headers
- [ ] Add `associatedDomains` (iOS) + `intentFilters` (Android) to `app.config.ts`
- [ ] Rebuild via EAS (associations are baked in at build time)
- [ ] Validate: `curl -sI https://<domain>/.well-known/apple-app-site-association`
      (expect `content-type: application/json`, HTTP 200, no redirect)
