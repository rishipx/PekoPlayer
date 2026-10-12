import js from '@eslint/js';
import globals from 'globals';

// Top-level declarations shared between the files of one script bundle (player or multiview).
const bundleGlobals = Object.fromEntries(
  [
    'PekoClassParts',
    'PekoUtils',
    'PekoPlayer',
    'PekoDB',
    'PekoEq',
    'MultiView',
    'WorkerRpc',
    'WorkerTranscriptClient',
    'TranscriptIndex',
    'PekoLayout',
    'PekoConfig',
    'PekoSelectors',
    'detectChapters',
    'createPekoWorker',
    'createFocusTrap',
    'createShaderRenderer',
    'parseYtDlpInfoJson',
    'parseChaptersTxt',
    'timecodeToSeconds',
    'baseName',
    'SPEED_STEPS',
    'EFFECTS_PRESETS',
    'EFFECTS_CYCLE_ORDER',
    'EFFECTS_FRIENDLY_NAMES',
    'CAPTION_FONTS',
    'ICON_FS_ENTER',
    'ICON_FS_EXIT',
    'BADGE_ICON_OFF',
    'BADGE_ICON_LOOP',
    'BADGE_ICON_EFFECTS',
    'MV_ICON_PLAY',
    'MV_ICON_PAUSE',
    'MV_ICON_VOL',
    'MV_ICON_MUTE',
    'MV_ICON_EXPAND',
    'MV_ICON_COMPRESS',
    'MV_ICON_CLOSE',
    'MV_ICON_LOOP',
    'MV_ICON_ABLOOP',
    'MV_ICON_PIP',
    'MV_ICON_REWIND',
    'MV_ICON_FORWARD',
    'MV_ICON_RESIZE',
    'MV_TOOLBAR_VOL',
    'MV_TOOLBAR_MUTE',
  ].map((name) => [name, 'readonly']),
);

const common = {
  'no-var': 'error',
  'prefer-const': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', vars: 'local' }],
  'no-redeclare': ['error', { builtinGlobals: false }],
  'no-empty': ['error', { allowEmptyCatch: false }],
  'no-console': 'off',
};

export default [
  { ignores: ['dist/', 'release/', 'node_modules/', 'desktop/node_modules/', 'desktop/web/', 'public/fonts/'] },
  js.configs.recommended,
  { rules: common },
  {
    // Browser scripts are concatenated per bundle (see docs/architecture.md), so they share one global scope.
    files: ['src/scripts/**/*.js', 'src/workers/**/*.js', 'src/shared/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...bundleGlobals, YT: 'readonly' } },
  },
  {
    files: ['src/workers/**/*.js', 'src/shared/**/*.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  {
    files: ['src/sw.template.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker, __PRECACHE__: 'readonly' } },
  },
  {
    files: ['desktop/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['tools/**/*.mjs', 'desktop/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // These scripts pass functions to page.evaluate(), which run in the browser.
    files: ['tests/**/*.mjs', 'tools/screenshots.mjs'],
    languageOptions: { globals: { ...globals.browser } },
  },
];
