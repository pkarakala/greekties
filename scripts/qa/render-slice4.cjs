/* Local visual fixtures for actual app components. No Expo startup, credentials,
 * backend client, or external requests. Run: node scripts/qa/render-slice4.cjs
 * Output: /tmp/greekties-slice4-visual. This is static component rendering, not
 * end-to-end browser/device or real navigation evidence. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const root = path.resolve(__dirname, '../..');
const out = '/tmp/greekties-slice4-visual';
fs.mkdirSync(out, { recursive: true });
global.fetch = () => {
  throw new Error('Network is disabled in visual fixtures');
};
const noop = () => {};
const router = { push: noop, setParams: noop, back: noop };
let mode = 'loaded';
const base = {
  id: 'synthetic',
  user_id: 'fixture-user',
  chapter_id: 'fixture-chapter',
  status: 'approved',
  membership_type: 'alumni',
  admin_role: 'owner',
  name: 'Alexandra Morgan',
  class_year: 2018,
  city: 'Santa Barbara',
  map_sharing_enabled: false,
};
let profile = base;
const originalLoad = Module._load;
const loadSource = (file) => originalLoad.call(Module, path.join(root, file), module, false);
const state = (data) => ({
  data: mode === 'loading' || mode === 'error' ? undefined : data,
  loading: mode === 'loading',
  error: mode === 'error' || mode === 'retry',
  reload: noop,
});
const icons = {
  'notifications-outline': '♧',
  'shield-checkmark-outline': '◇',
  'lock-closed-outline': '◇',
  'remove-circle-outline': '⊖',
  'mail-outline': '✉',
  'document-text-outline': '▤',
  'trash-outline': '×',
  'chevron-forward': '›',
};
Module._load = function (name, parent, isMain) {
  if (name === 'react-native') return RN;
  if (name === 'expo-router')
    return {
      useRouter: () => router,
      useFocusEffect: noop,
      useLocalSearchParams: () => ({}),
      Link: ({ children }) => children,
    };
  if (name === 'react-native-safe-area-context') return { SafeAreaView: RN.View };
  if (name === 'expo-haptics') return { selectionAsync: async () => {} };
  if (name === 'expo-image') return { Image: RN.Image };
  if (name === '@expo/vector-icons')
    return {
      Ionicons: ({ name, size, color }) =>
        React.createElement(
          RN.Text,
          { style: { fontSize: size, color }, 'aria-hidden': true },
          icons[name] || '○',
        ),
    };
  if (name === '@/lib/auth')
    return {
      useAuth: () => ({
        profile,
        session: { user: { id: 'fixture-user' } },
        blockedIds: new Set(),
        signOut: async () => {},
      }),
    };
  if (name === '@/lib/chat')
    return {
      useChannels: () => ({
        loading: mode === 'loading',
        error: mode === 'error' ? 'Fixture error' : null,
        reload: noop,
        sections:
          mode === 'loaded'
            ? [
                {
                  title: 'CHANNELS',
                  data: [
                    {
                      channel: {
                        id: 'general',
                        name: 'general',
                        description: 'Chapter conversations',
                      },
                      lastMessage: {
                        content: 'Looking forward to seeing everyone at the alumni dinner.',
                      },
                      lastActivity: '2026-09-17T12:00:00Z',
                      unread: false,
                    },
                  ],
                },
              ]
            : [],
      }),
    };
  if (name === '@/lib/home') {
    const real = loadSource('lib/home.ts');
    return {
      ...real,
      useChapterIdentity: () =>
        state({
          name: 'Pi Beta Phi',
          designation: 'California Zeta',
          university: 'University of California, Santa Barbara',
        }),
      useHomeOverview: () => ({
        event: state(
          mode === 'empty'
            ? null
            : {
                id: 'event',
                title: 'An evening with our alumni',
                location: 'Santa Barbara · Courtyard room',
                starts_at: '2099-10-10T20:00:00Z',
              },
        ),
        jobs: state(
          mode === 'empty'
            ? []
            : [
                {
                  id: 'job-1',
                  title: 'Senior product designer',
                  company: 'Fieldwork Studio',
                  location: 'San Francisco',
                },
                {
                  id: 'job-2',
                  title: 'Software engineer, community platforms',
                  company: 'Example Company',
                  location: 'Remote',
                },
              ],
        ),
        conversations: state(
          mode === 'empty'
            ? null
            : {
                channel_id: 'general',
                created_at: '2026-09-17T12:00:00Z',
                channels: { name: 'general' },
              },
        ),
        reload: noop,
      }),
    };
  }
  if (name === './supabase' || name === '@/lib/supabase')
    return {
      supabase: new Proxy(
        {},
        {
          get() {
            throw new Error('Backend access forbidden in fixture renderer');
          },
        },
      ),
    };
  if (name === '@/lib/invite')
    return { readPendingInvite: noop, resolveChapterInvite: noop, storePendingInviteCode: noop };
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.tsx', '.ts']) {
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
}
const screens = {
  home: loadSource('app/(tabs)/index.tsx').default,
  me: loadSource('app/(tabs)/me.tsx').default,
  chats: loadSource('app/(tabs)/chats/index.tsx').default,
  login: loadSource('app/login.tsx').default,
};
const { MapConsentField } = loadSource('components/MapConsentField.tsx');
const { Button } = loadSource('components/Button.tsx');
const { TextField } = loadSource('components/TextField.tsx');
function controls() {
  return React.createElement(
    RN.View,
    { style: { padding: 24, gap: 16, backgroundColor: '#F6F1E7' } },
    React.createElement(TextField, { label: 'Optional city', value: 'Santa Barbara' }),
    React.createElement(MapConsentField, {
      enabled: false,
      available: true,
      disabled: false,
      onChange: noop,
    }),
    React.createElement(Button, { label: 'Save changes', onPress: noop }),
    React.createElement(Button, { label: 'Saving changes…', loading: true, onPress: noop }),
    React.createElement(Button, { label: 'Cancel', variant: 'secondary', onPress: noop }),
  );
}
screens.controls = controls;
const files = [];
for (const screen of Object.keys(screens)) {
  for (const fixture of ['home', 'me'].includes(screen)
    ? ['loaded', 'empty', 'loading', 'error', 'retry']
    : ['loaded']) {
    mode = fixture;
    profile =
      screen === 'me' && mode === 'empty'
        ? { ...base, admin_role: null }
        : {
            ...base,
            job_title: 'Product designer',
            company: 'Fieldwork Studio',
            industry: 'Design & technology',
            bio: 'Connecting thoughtful design with the communities that make it possible. Always happy to talk about a first role, a career change, or a new idea.',
            linkedin_url: 'linkedin.com/in/synthetic',
            open_to_mentor: true,
            is_hiring: true,
          };
    const body = renderToStaticMarkup(React.createElement(screens[screen]));
    const css = RN.StyleSheet.getSheet().textContent;
    const filename = `${screen}-${fixture}.html`;
    fs.writeFileSync(
      path.join(out, filename),
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'"><title>Actual ${screen} component · ${fixture} synthetic fixture</title><style>${css}\nhtml,body{margin:0;background:#F6F1E7}body>main{min-height:100vh;display:flex;flex-direction:column} .fixture-label{font:12px system-ui;padding:8px 16px;color:#4E5E77;background:#FFFCF5}</style></head><body><div class="fixture-label">LOCAL SYNTHETIC FIXTURE · ${screen} / ${fixture} · static actual components · icons substituted</div><main>${body}</main></body></html>`,
    );
    files.push(filename);
  }
}
fs.writeFileSync(
  path.join(out, 'index.html'),
  `<h1>Slice 4 — actual components, synthetic data</h1><p>No backend, runtime navigation or device claims. Icons are substituted in this static harness.</p>${files.map((file) => `<p><a href="${file}">${file}</a></p>`).join('')}`,
);
console.log(out, files.length, 'fixture pages');
