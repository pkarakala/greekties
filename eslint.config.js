// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'assets/**',
      'scripts/**',
      'supabase/functions/**', // Deno runtime — not lintable with this config
      'build/**',
      'dist/**',
    ],
  },
  {
    // eslint-plugin-react-native isn't installed, but AnimatedNumber.tsx carries a
    // pre-existing `eslint-disable-next-line react-native/no-inline-styles` comment.
    // Register a no-op stub so that directive doesn't error ("rule not found").
    plugins: {
      'react-native': {
        rules: {
          'no-inline-styles': { create: () => ({}) },
        },
      },
    },
    rules: {
      // Pre-existing patterns across lib/ data hooks and several screens
      // (setLoading(false) inside effects, chat scroll refs). Downgraded to
      // warnings so lint can gate CI now; burn these down over time.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]);
