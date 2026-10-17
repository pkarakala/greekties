/* Offline actual-source Home renderer. Synthetic reads, network forbidden.
 * Tab scaffold consumes actual Tabs options; this is not Expo Router E2E. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const root = process.env.SLICE_A_SOURCE || path.resolve(__dirname, '../..');
const out = process.env.SLICE_A_OUTPUT;
if (!out) throw new Error('SLICE_A_OUTPUT required');
fs.mkdirSync(out, { recursive: true });
global.fetch = () => {
  throw new Error('Network forbidden');
};
const noop = () => {};
let mode, width, large, role, selected;
const originalLoad = Module._load;
const load = (file) => originalLoad.call(Module, path.join(root, file), module, false);
const state = (data) => ({
  data: ['loading', 'error'].includes(mode) ? undefined : data,
  loading: mode === 'loading',
  error: ['error', 'retry'].includes(mode),
  reload: noop,
});
// Use the installed Ionicons font and its canonical glyph map, without Expo initialization.
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const font = fs
  .readFileSync(
    require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
  )
  .toString('base64');
const icons = ({ name, size, color }) =>
  React.createElement(
    RN.Text,
    { style: { fontFamily: 'Ionicons', fontSize: size, color }, 'aria-hidden': true },
    String.fromCodePoint(glyphs[name]),
  );
function Tabs({ children, screenOptions }) {
  const tabs = React.Children.toArray(children).filter((c) => c.props.options.href !== null);
  return React.createElement(
    RN.View,
    {
      accessibilityRole: 'tablist',
      style: [
        screenOptions.tabBarStyle,
        { flexDirection: 'row', minHeight: 64, borderTopWidth: 1 },
      ],
    },
    tabs.map((c) => {
      const active = c.props.name === selected;
      const color = active
        ? screenOptions.tabBarActiveTintColor
        : screenOptions.tabBarInactiveTintColor;
      return React.createElement(
        RN.Pressable,
        {
          key: c.props.name,
          accessibilityRole: 'tab',
          accessibilityState: { selected: active },
          'aria-selected': active,
          style: [
            { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 4 },
            screenOptions.tabBarItemStyle,
            active && { backgroundColor: screenOptions.tabBarActiveBackgroundColor },
          ],
        },
        c.props.options.tabBarIcon({ color, size: 22 }),
        React.createElement(
          RN.Text,
          { style: [screenOptions.tabBarLabelStyle, { color, textAlign: 'center' }] },
          c.props.options.title,
        ),
      );
    }),
  );
}
Tabs.Screen = () => null;
Module._load = function (name, parent, isMain) {
  if (name === 'react-native')
    return {
      ...RN,
      useWindowDimensions: () => ({ width, height: 844, fontScale: large ? 1.6 : 1, scale: 1 }),
    };
  if (name === 'expo-router')
    return { Tabs, useRouter: () => ({ push: noop }), useFocusEffect: noop };
  if (name === 'react-native-safe-area-context')
    return {
      SafeAreaView: RN.View,
      useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    };
  if (name === 'expo-haptics') return { selectionAsync: async () => {} };
  if (name === '@expo/vector-icons') return { Ionicons: icons };
  if (name === '@/lib/auth')
    return {
      useAuth: () => ({
        profile: {
          user_id: 'fixture',
          chapter_id: 'chapter',
          status: 'approved',
          membership_type: role === 'active' ? 'active' : 'alumni',
          admin_role: role === 'admin' ? 'owner' : null,
          name: 'Alexandra',
        },
        session: { user: { id: 'fixture' } },
        blockedIds: new Set(),
      }),
    };
  if (name === './supabase' || name === '@/lib/supabase')
    return {
      supabase: new Proxy(
        {},
        {
          get() {
            throw new Error('Backend forbidden');
          },
        },
      ),
    };
  if (name === '@/lib/home')
    return {
      ...load('lib/home.ts'),
      useChapterIdentity: () =>
        state({
          name:
            mode === 'long'
              ? 'Sigma Phi Epsilon — lifelong chapter connections'
              : 'Sigma Phi Epsilon',
          designation: 'California Gamma',
          university: 'University of California, Santa Barbara',
        }),
      useMembershipCounts: () =>
        state({
          active: mode === 'empty' ? 0 : mode === 'long' ? 1234567 : 84,
          alumni: mode === 'empty' ? 0 : mode === 'long' ? 9876543 : 216,
        }),
      useHomeOverview: () => ({
        event: state(
          mode === 'empty'
            ? null
            : {
                id: 'event',
                title:
                  mode === 'long'
                    ? 'An evening of shared stories, meaningful introductions and lifelong chapter connections'
                    : 'Back in Santa Barbara',
                category: 'alumni',
                location: 'Campus lawn, Santa Barbara',
                starts_at: '2099-11-07T00:00:00Z',
              },
        ),
        jobs: state(
          mode === 'empty'
            ? []
            : [
                {
                  id: 'job',
                  title: 'Product designer',
                  company: 'Example Studio',
                  location: 'Remote',
                },
              ],
        ),
        conversations: state(
          mode === 'empty'
            ? null
            : {
                channel_id: 'channel',
                content: 'See you on the lawn this Saturday. Looking forward to catching up!',
                channels: {
                  name:
                    mode === 'long'
                      ? 'Alumni weekend planning and chapter conversations'
                      : 'Chapter chat',
                },
                created_at: '2026-10-15T12:00:00Z',
              },
        ),
        reload: noop,
      }),
    };
  if (name.startsWith('@/')) name = path.join(root, name.slice(2));
  return originalLoad.call(this, name, parent, isMain);
};
for (const ext of ['.ts', '.tsx'])
  require.extensions[ext] = (mod, file) =>
    mod._compile(
      babel.transformFileSync(file, {
        configFile: false,
        babelrc: false,
        presets: ['@babel/preset-typescript'],
        plugins: [
          ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
          '@babel/plugin-transform-modules-commonjs',
        ],
      }).code,
      file,
    );
const Home = load('app/(tabs)/index.tsx').default;
const Layout = load('app/(tabs)/_layout.tsx').default;
const files = [];
for (width of [320, 375, 440])
  for (large of [false, true])
    for (mode of ['loaded', 'loading', 'empty', 'error', 'retry', 'long'])
      for (role of ['active', 'alumni', 'admin']) {
        selected = 'index';
        const body = renderToStaticMarkup(React.createElement(Home));
        const tabs = renderToStaticMarkup(React.createElement(Layout));
        const name = `home-${mode}-${role}-${width}${large ? '-large' : ''}`;
        const sheet = RN.StyleSheet.getSheet().textContent;
        // Scale each computed type size/line height, including inline declarations. This
        // is a web approximation of native fontScale, with actual responsive hook branches.
        const scale = (css) =>
          large
            ? css.replace(
                /(font-size|line-height):([\d.]+)px/g,
                (_, key, n) => `${key}:${Number(n) * 1.6}px`,
              )
            : css;
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'"><style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})} ${scale(sheet)} body{margin:0;background:#F6F8FC;font-family:system-ui}main{display:flex;flex-direction:column;min-height:100vh}footer{background:white}*:focus-visible{outline:3px solid #123FA0;outline-offset:-3px}</style></head><body><main>${scale(body)}</main><footer>${scale(tabs)}</footer></body></html>`;
        fs.writeFileSync(path.join(out, name + '.html'), html);
        files.push({ name, width, large, mode, role });
      }
// Each selected tab uses the real five-tab configuration; content beyond Home is outside Slice A.
for (selected of ['index', 'chats', 'events', 'people', 'me']) {
  const tabs = renderToStaticMarkup(React.createElement(Layout));
  fs.writeFileSync(
    path.join(out, `tabs-${selected}.html`),
    `<style>@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}${RN.StyleSheet.getSheet().textContent}body{margin:0;font-family:system-ui}</style>${tabs}`,
  );
}
fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify(files, null, 2));
console.log(`Rendered ${files.length} Home fixtures and five tab states from ${root}`);
