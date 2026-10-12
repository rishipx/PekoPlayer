# Testing

```
npm ci
npx playwright install chromium
npm run test:fixtures      # generates test clips, needs ffmpeg
npm test                   # check, build, smoke tests
```

| Command | What it covers |
|---|---|
| `npm run lint` | ESLint over the sources, tools, tests and desktop shell |
| `npm run format:check` | Prettier formatting check (`npm run format` fixes it) |
| `npm run check` | JavaScript syntax (browser scripts as scripts, tooling as modules), CSS brace balance, file naming, leftover markers (`TODO`, `FIXME`, `console.log` in `src`), and the privacy guard (unapproved hosts and telemetry-style APIs in `src`) |
| `npm run test:unit` | Node tests for the pure logic: transcript index (also through the built worker), chapter and subtitle parsers, desktop file handling and folder scanning, the Windows registry commands, the layout math used by multi-view, and checks that selectors and storage keys are defined once |
| `npm run test:smoke` | Behavior of the built app; see below |
| `BROWSER=firefox npm run test:browsers` | Startup check in another engine (`firefox` or `webkit`; run `npm run build` first) |

## Smoke tests (`tests/smoke/smoke.mjs`)

Each check builds the app into a temporary directory and drives it with Playwright.

- Service worker registration, precaching, offline reload and installability
- Debug panel: opens with Ctrl+Shift+D and copies diagnostics, tokens and the selector check
- Opening files from the system: the manifest file handlers and the launch queue
- Desktop server: headers, path traversal, Host and method checks
- Privacy: no third-party request at startup, no beacons, strict policy, fonts served by the site
- The `--csp-meta` build
- Search highlighting, including the `&amp;` / `&lt;` entity cases
- YouTube loading under the CSP, against local stubs
- Picture-in-Picture button, focus after closing search, bookmark removal, top bar hide and show, shortcut menu icons, install button placement, multi-view arrow
- Icon tooling: vendoring and build-time inlining

## Fixtures

`tests/fixtures/make-fixtures.mjs` generates two short WebM clips with `ffmpeg`. They are not committed. The subtitle and info files in the same directory are.
