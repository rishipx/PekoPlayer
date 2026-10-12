# Deployment

`npm run build` writes a static site to `dist/`. It needs HTTPS (or `http://localhost`): the service worker, install prompt, Picture-in-Picture and Wake Lock require a secure context.

The site works from any path, so it can live at a domain root or under a sub-path such as `https://user.github.io/PekoPlayer/`. All URLs are relative, and the service worker scope follows the page location.

## GitHub Pages

1. Push the repository to GitHub.
2. In Settings → Pages, set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml`, which builds with `--csp-meta`, and deploys `dist/`.

Pages cannot send custom headers, so the Content-Security-Policy is embedded as a `<meta>` tag. `frame-ancestors`, the cache rules and the other security headers do not apply there. Use Cloudflare Pages or Netlify if you need them.

## Cloudflare Pages or Netlify

Build command `npm run build`, output directory `dist`. Both read `dist/_headers`, which sets the Content-Security-Policy, cache rules and security headers.

## Any other host

Serve `dist/` and translate `dist/_headers` into the host's configuration. The essentials:

| Path | Header |
|---|---|
| `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/` | `Cache-Control: no-cache` |
| `/assets/*`, `/fonts/*` | `Cache-Control: public, max-age=31536000, immutable` |
| everything | `Content-Security-Policy` from `_headers`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |

Serve `.webmanifest` as `application/manifest+json` and enable Brotli or gzip. Assets are not minified, which keeps stack traces readable; compression removes most of the size difference.

## Fonts

The fonts are bundled in `public/fonts/` and need no setup. To regenerate them, run `npm run fonts:vendor` (see [architecture](architecture.md#fonts)).

## Offline use and updates

The first visit caches the whole app shell (page, scripts, styles, fonts and icons) in the service worker, so later visits work without a connection, including after the browser is restarted. Playback, transcript search, effects and multi-view of local files need no network. Only YouTube tiles and the subtitle search link do.

A new deploy is picked up on the next page load: navigations go to the network first and fall back to the cache when offline, and fingerprinted assets change name. Old caches are removed when the new service worker activates. Keep the `no-cache` rule for `/sw.js` (it is in `_headers`), because a long-lived cached service worker would delay updates.

## Installed app: Open with

When a user installs the site as an app in Chrome or Edge on Windows, macOS or Linux, the manifest registers PekoPlayer as a handler for video files (`file_handlers`). The app then appears in the operating system's **Open with** menu, and opening a video from the file manager plays it in the existing app window (`launch_handler`). The browser asks for permission the first time. This needs the installed app: a normal browser tab does not appear in **Open with**.
