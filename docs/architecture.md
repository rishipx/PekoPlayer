# Architecture

PekoPlayer is a static web app with no runtime dependencies and no backend. The source is plain HTML, CSS and classic (non-module) JavaScript. `tools/build.mjs` assembles it into `dist/`.

## Repository layout

```
.
├── src/                      Application source
│   ├── index.html            Markup with build placeholders
│   ├── styles/               CSS in cascade order (01 → 10)
│   ├── scripts/              Browser scripts, one directory per bundle
│   │   ├── player/           Shared helpers, then the PekoPlayer class split by feature
│   │   ├── multiview/        Icons, then the MultiView class split by feature
│   │   └── pwa/              Install prompt and service worker registration
│   ├── shared/               Code and constants used by more than one bundle or worker (config, transcript index, layout math)
│   ├── workers/              Transcript, thumbnail and shader worker sources
│   ├── icons/lucide/         Vendored Lucide icons, inlined at build time
│   └── sw.template.js        Service worker template
├── public/                   Files copied to dist/ unchanged (manifest, app icons, fonts, robots.txt)
├── desktop/                  Electron shell for the portable Windows executable (own package.json)
├── branding/                 Transparent master of the app icon (source for npm run icons)
├── tools/                    Node tooling: build, check, font and icon helpers, dev server
├── tests/
│   ├── unit/                 Node tests for the parsers, the search index and the desktop file handling
│   ├── smoke/                Behavior checks (service worker, offline, privacy, CSP, UI)
│   └── fixtures/             Subtitle and info files, media generator
├── docs/                     This documentation
└── .github/                  CI, Pages deployment, issue and pull request templates
```

`src/scripts` holds code that runs in the browser. `tools` holds code that runs in Node.

## Scripts are classic scripts

Files under `src/scripts/<bundle>/` share one global scope and run in filename order. The two-digit prefix is the order. The build concatenates each directory into one fingerprinted file, so the page loads four scripts: `player`, `multiview`, `pwa` and `debug`. Each bundle is a separate script, so an exception in one does not stop the next.

Workers are different: `src/workers/*.js` are embedded in the page as `<script type="text/worker">` blocks, because the player creates its workers from those elements through Blob URLs.

## Large classes are split by feature

`PekoPlayer` (about 250 methods) and `MultiView` (about 95) are each one class written as several files:

- `player/10-player.js` and `multiview/10-multiview.js` contain the class with its constructor and instance field.
- Every other method lives in a per-feature file (`player/18-playlist.js`, `player/22-events.js`, …) inside an object passed to `PekoClassParts.install(PekoPlayer, {...})` (`player/00-class-parts.js`). This keeps each file focused on one feature (the largest are the event wiring in `22-events.js` and the playlist in `18-playlist.js`) without introducing a module system, so the app stays a set of classic scripts that need no bundler. `install` copies the methods onto the prototype exactly as a class body would, and refuses duplicate names.
- `install` defines each method exactly like a class method: non-enumerable, writable, configurable, in strict mode. It throws if a name is defined twice.
- `90-start.js` creates the instance after every method is installed.

To add a method, put it in the feature file it belongs to. Do not put it in the class file.

`bindEvents` is a thin method that calls the `_bind*` section methods in a fixed order, which keeps listener registration order stable.

## Build pipeline (`tools/build.mjs`)

1. Concatenates `src/styles/*.css` into `assets/app.<hash>.css` and each script directory into `assets/<bundle>.<hash>.js`.
2. Replaces `{{icon:name}}` placeholders in `index.html` with the inline SVG from `src/icons/lucide/`. An unknown icon fails the build.
3. Embeds the worker sources, links the fingerprinted assets, and the stylesheet into `index.html`.
4. Copies `public/` to `dist/`.
5. Writes `sw.js` from the template with the list of files to precache.
6. Writes `_headers` with the Content-Security-Policy, cache rules and security headers. With `--csp-meta` the policy is also embedded as a `<meta>` tag, for hosts that cannot send headers.
7. Precaches the self-hosted font files from `public/fonts/`.

The build is deterministic: the same source produces the same release id.

## Content-Security-Policy

Scripts load only from the site itself and `www.youtube.com` (the YouTube IFrame API). Frames are limited to YouTube. Styles allow inline `style` attributes because the player sets them at runtime. Blob URLs are allowed for media and workers because the player plays local files and builds workers from blobs.

## Service worker

`sw.js` precaches the app shell. Navigations are network-first, so a deploy is picked up on the next load. Fingerprinted assets are cache-first. Old caches are deleted on activation. Cross-origin requests (YouTube) are never intercepted.

## Icons

All icons are inline SVG, so the page makes no icon requests. Icons for the shortcut menu, top bar and multi-view arrow come from `src/icons/lucide/`, copied from [Lucide](https://lucide.dev) (ISC license, `src/icons/LICENSE`). To add one, put its name in `src/icons/lucide/manifest.json`, run `npm run icons:lucide`, and use `{{icon:name}}` or `{{icon:name:size}}` in `src/index.html`.

## Fonts

Inter, IBM Plex Mono, Lora and Nunito are self-hosted. `npm run fonts:vendor` copies the Latin, Latin Extended, Cyrillic, Greek and Vietnamese subsets from their Fontsource npm packages into `public/fonts/` and writes `src/styles/00-fonts.css`. Both outputs are committed, so a build needs no network access. The font licenses (SIL OFL) are in `public/fonts/LICENSE.txt`.

## Shared code

Files in `src/shared/` are plain scripts with no DOM access. `tools/build.mjs` adds them in front of the bundle or worker that lists them (`shared: [...]` in the bundle and worker tables), so one source file serves both. The transcript search index lives there: the page uses it as a fallback, and the transcript worker runs the same class.

## Constants and selectors

Values that several files depend on are defined once:

- `src/shared/config.js` holds `PekoConfig`: every storage key (`STORAGE`) and the shared delays (`TIMING`). A unit test fails if a key is written out again in a script.
- `src/scripts/multiview/02-selectors.js` holds `PekoSelectors.tile`: the parts of a multi-view tile. A unit test checks that each one exists in the tile template and that no script spells one out again. A markup change is a change to the template and this file.
- `src/shared/layout-math.js` holds `PekoLayout`: the grid packing, pane resizing and reordering math, as pure functions with unit tests.

The desktop shell has its own small surface: `desktop/preload.cjs` is the only bridge to the page (folder dialog and the "Open with" entries), and `desktop/main.cjs` checks the sender of every request.

