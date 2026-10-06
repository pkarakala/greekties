/* Actual components with synthetic services. No Expo startup or credentials.
 * No backend or network allowed. Static output is layout evidence only. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const root = path.resolve(__dirname, '../..');
const out = '/tmp/greekties-slice5-visual';
fs.mkdirSync(out, { recursive: true });
global.fetch = () => {
  throw new Error('Network disabled in fixtures');
};
const noop = () => {};
let mode = 'loaded';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const profile = {
  user_id: 'fixture-user',
  chapter_id: 'fixture-chapter',
  status: 'approved',
  admin_role: 'owner',
};
const event = {
  id,
  chapter_id: profile.chapter_id,
  created_by: profile.user_id,
  title: 'Alumni dinner and an evening of career conversations',
  category: 'alumni',
  starts_at: '2026-10-01T01:30:00Z',
  ends_at: '2026-10-01T03:30:00Z',
  location: 'Santa Barbara · Chapter house',
  description:
    'Join chapter members for a relaxed evening of conversation, shared experiences, and introductions.',
};
const people = ['Alexandra Morgan', 'Christopher Nguyen', 'Taylor Wilson', 'Jordan Bennett'].map(
  (name, i) => ({
    id: `profile-${i}`,
    user_id: `user-${i}`,
    name,
    avatar_url: null,
    company: 'Fieldwork Studio',
    role: 'Product designer',
    industry: 'Design & technology',
    open_to_mentor: true,
    is_hiring: true,
  }),
);
const job = {
  id,
  chapter_id: profile.chapter_id,
  posted_by: profile.user_id,
  title: 'Senior software engineer, community platforms and developer tools',
  company: 'Fieldwork Studio',
  location: 'Remote',
  industry: 'Technology',
  description: 'Help build useful tools for close-knit communities.',
  created_at: '2026-09-17',
  apply_url: 'https://example.invalid/apply',
};
const originalLoad = Module._load;
const loadSource = (file) => originalLoad.call(Module, path.join(root, file), module, false);
const empty = () => mode === 'loading' || mode === 'error' || mode === 'empty';
const failure = () => mode === 'error' || mode === 'retry';
const share = {
  id: 'share',
  text: `Alumni dinner\n/events/${id}`,
  state: 'ready',
  entry: {
    state: { draft: 'Existing draft', attempt: mode === 'retry' ? { status: 'failed' } : null },
  },
};
Module._load = function (name, parent, isMain) {
  if (name === 'react-native') return RN;
  if (name === 'expo-router')
    return {
      useRouter: () => ({ push: noop, back: noop, setParams: noop }),
      useLocalSearchParams: () => ({ id }),
      useFocusEffect: noop,
      Link: ({ children }) => children,
    };
  if (name === 'react-native-safe-area-context') return { SafeAreaView: RN.View };
  if (name === 'expo-image') return { Image: RN.Image };
  if (name === 'expo-haptics') return { selectionAsync: async () => {} };
  if (name === 'expo-modules-core') return { uuid: { v4: () => 'fixture-id' } };
  if (name === '@expo/vector-icons')
    return {
      Ionicons: ({ name, size, color }) =>
        React.createElement(
          RN.Text,
          { style: { fontSize: size, color }, 'aria-hidden': true },
          {
            'arrow-back': '‹',
            'time-outline': '◷',
            'location-outline': '⌖',
            'people-outline': '♧',
            add: '+',
          }[name] || '○',
        ),
    };
  if (name === '@/lib/auth' || name === './auth')
    return {
      useAuth: () => ({
        profile,
        session: { user: { id: profile.user_id } },
        blockedIds: new Set(),
      }),
    };
  if (name === './supabase' || name === '@/lib/supabase')
    return {
      supabase: new Proxy(
        {},
        {
          get() {
            throw new Error('Backend forbidden in fixture renderer');
          },
        },
      ),
    };
  if (name === '@/lib/events') {
    const actual = loadSource('lib/events.ts');
    const meta = {
      goingCount: mode === 'unknown' ? null : 4,
      maybeCount: mode === 'unknown' ? null : 2,
      myStatus: mode === 'unknown' ? undefined : 'maybe',
      attendees: people,
      metaError:
        mode === 'unknown' || mode === 'retry' ? 'Attendance unavailable. Retry to refresh.' : null,
    };
    return {
      ...actual,
      useEvent: () => ({
        loading: mode === 'loading',
        error: failure() ? 'Couldn’t load this event. Please retry.' : null,
        event: empty() ? null : event,
        creator: people[0],
        ...meta,
        reload: noop,
        saveRsvp: noop,
        saving: false,
        saveError: null,
      }),
      useEvents: () => ({
        events: empty() ? [] : [{ ...event, ...meta }],
        loading: mode === 'loading',
        error: failure() ? 'Couldn’t refresh attendance.' : null,
        reload: noop,
      }),
      useEventClock: () => Date.parse('2026-09-17'),
    };
  }
  if (name === '@/lib/jobs')
    return {
      useJob: () => ({
        job: empty()
          ? null
          : {
              ...job,
              is_open: mode !== 'closed',
              apply_url: mode === 'no-link' ? null : job.apply_url,
            },
        loading: mode === 'loading',
        error: failure() ? 'Couldn’t load this posting. Please retry.' : null,
        reload: noop,
      }),
      useJobs: () => ({
        jobs: [],
        loading: false,
        error: null,
        reload: noop,
        loadMore: noop,
        hasMore: false,
      }),
    };
  if (name === '@/lib/queries')
    return {
      useChapterMembers: () => ({
        members: empty() ? [] : people,
        loading: mode === 'loading',
        error: failure() ? 'Couldn’t search members. Please retry.' : null,
        reload: noop,
        loadMore: noop,
        hasMore: false,
      }),
    };
  if (name === '@/lib/chat-share')
    return { getChatShare: () => share, appendChatShare: noop, cancelChatShare: noop };
  if (name === '@/components/EventDateInput')
    return loadSource('components/EventDateInput.web.tsx');
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.tsx', '.ts'])
  require.extensions[extension] = (mod, filename) => {
    const result = babel.transformFileSync(filename, {
      configFile: false,
      babelrc: false,
      presets: ['@babel/preset-typescript'],
      plugins: [
        ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
        '@babel/plugin-transform-modules-commonjs',
      ],
    });
    mod._compile(result.code, filename);
  };
const screens = {
  events: loadSource('app/(tabs)/events.tsx').default,
  event: loadSource('app/events/[id].tsx').default,
  job: loadSource('app/jobs/[id].tsx').default,
  people: loadSource('app/(tabs)/people.tsx').default,
  newEvent: loadSource('app/events/new.tsx').default,
};
const { ChatShareReview } = loadSource('components/ChatShareReview.tsx');
screens.share = () =>
  React.createElement(ChatShareReview, { entry: share.entry, shareId: 'share' });
const files = [];
for (const [screen, Component] of Object.entries(screens)) {
  const modes =
    screen === 'newEvent'
      ? ['loaded']
      : screen === 'share'
        ? ['loaded', 'retry']
        : [
            'loaded',
            'loading',
            'empty',
            'error',
            'retry',
            ...(screen === 'event' ? ['unknown'] : screen === 'job' ? ['closed', 'no-link'] : []),
          ];
  for (const fixture of modes)
    for (const width of [360, 820]) {
      mode = fixture;
      const body = renderToStaticMarkup(React.createElement(Component));
      const css = RN.StyleSheet.getSheet().textContent;
      const filename = `${screen}-${fixture}-${width}.html`;
      fs.writeFileSync(
        path.join(out, filename),
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'"><title>Slice 5 · ${screen}/${fixture}/${width}</title><style>${css}\nbody{margin:0;background:#EDE5D4;font-family:system-ui}main{width:${width}px;max-width:100%;margin:auto;min-height:100vh;display:flex;flex-direction:column;background:#F6F1E7}label{color:#16294A;font-size:16px;display:flex;flex-direction:column;gap:8px}.label{font:12px system-ui;padding:8px;color:#4E5E77}a{color:#245EB9}</style></head><body><div class="label">SYNTHETIC · actual components · ${screen}/${fixture} · width ${width} · icons substituted</div><main>${body}</main></body></html>`,
      );
      files.push(filename);
    }
}
fs.writeFileSync(
  path.join(out, 'index.html'),
  `<h1>Slice 5 local fixtures</h1><p>Actual components; synthetic data; no backend; icons substituted; static controls.</p>${files.map((file) => `<p><a href="${file}">${file}</a></p>`).join('')}`,
);
console.log(out, files.length, 'pages');
