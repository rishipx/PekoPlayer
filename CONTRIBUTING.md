# Contributing

## Setup

```bash
npm ci
npx playwright install chromium
npm run test:fixtures      # needs ffmpeg
```

Node 20 or newer (`.nvmrc` pins 22).

## Workflow

1. Edit files under `src/`.
2. `npm run format` to format the code with Prettier, and `npm run lint` to run ESLint.
3. `npm run check` for the project checks (leftover markers, the privacy guard, version match).
4. `npm run test:unit` for the fast Node tests, and `npm test` for everything (lint, format check, check, unit tests, build and the smoke suite).
5. `BROWSER=firefox npm run test:browsers` (or `webkit`) for a startup check in another engine.

How the code is organized is in [docs/architecture.md](docs/architecture.md); the test suites are in [docs/testing.md](docs/testing.md).

## Code style

- Prettier formats JavaScript, CSS, JSON and YAML (`.prettierrc.json`), and ESLint enforces the rules in `eslint.config.js`. Both run in CI.
- Give every non-trivial method a one-line `/** ... */` comment that says what it does, not how.
- A `catch` block is never empty. Either handle the error or say in a comment why ignoring it is safe (storage unavailable, player not ready, resource already released).
- Keep shared state in the class constructor and behavior in the feature files.

## Rules that keep the player stable

- **Browser scripts are classic scripts, not modules.** Files in `src/scripts/<bundle>/` share one global scope and run in filename order. Keep the two-digit prefix. The build concatenates each directory into one bundle.
- **Class methods live in feature files.** To add a method to `PekoPlayer` or `MultiView`, put it in the matching feature file inside the object passed to `PekoClassParts.install`. `install` throws on a duplicate name. Keep the constructor and instance fields in the class file.
- **CSS order is the cascade.** `src/styles/` files are concatenated in filename order.
- **Shared values go in one place.** Storage keys and delays belong in `PekoConfig`, and multi-view tile parts in `PekoSelectors`. Do not write the same string or number in two files.
- **Code used by a page and a worker goes in `src/shared/`.** List it under `shared` for the bundle and the worker in `tools/build.mjs`; do not copy it.
- **Workers are inlined.** `src/workers/*.js` are embedded as `<script type="text/worker">` blocks.
- **No inline event handlers, no remote scripts.** The Content-Security-Policy allows scripts only from the site itself and `www.youtube.com`.
- **The app icon** is generated: replace `branding/icon.png` (transparent PNG) and run `npm run icons`.
- **UI icons are inline SVG.** Use `{{icon:name}}` placeholders backed by `src/icons/lucide/`; see the architecture guide.
- **Tooling and tests are ES modules** (`.mjs`). Browser files are `.js`.

## Tests

Add a smoke test in `tests/smoke/smoke.mjs` for every user-visible change or fix.

## Pull requests

Keep changes focused, and say in the description which checks you ran. The pull request template has the checklist.
