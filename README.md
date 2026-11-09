<p align="center">
  <img src="docs/images/pekoplayer.png" alt="PekoPlayer" width="720">
</p>

<p align="center">
  <a href="https://pekoplayer.neverask.me"><img src="https://img.shields.io/badge/Web_App-FF6A00?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Web app"></a>
<a href="https://github.com/rishipx/PekoPlayer/releases/latest"><img src="https://img.shields.io/badge/Windows_Download-0078D4?style=for-the-badge&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yIDMuNSAxMC41IDIuM3Y4LjJIMnpNMTEuNSAyLjIgMjIgLjd2OS44SDExLjV6TTIgMTEuNWg4LjV2OC4yTDIgMTguNXpNMTEuNSAxMS41SDIydjkuOGwtMTAuNS0xLjV6Ii8%2BPC9zdmc%2B" alt="Windows download"></a>
  <a href="docs/"><img src="https://img.shields.io/badge/Docs-24292F?style=for-the-badge&logo=readthedocs&logoColor=white" alt="Docs"></a>
  <a href="https://github.com/rishipx/PekoPlayer/actions"></a>
</p>

PekoPlayer plays video files from your own device, in the browser or as a portable Windows app. It has no backend: nothing is uploaded, and there are no accounts, analytics or error reports.

<p align="center">
  <img src="docs/images/capsule-control-bar.png" alt="PekoPlayer playing a video" width="860">
</p>
<p align="center">
  <img src="docs/images/multi-view-grid.png" alt="PekoPlayer playing a video" width="860">
</p>

---

### Features

- **Playback.** Files, folders and drag and drop (MP4, WebM, OGG, MOV, MKV, 3GP, as far as your browser can decode them). Speed control, frame stepping, A-B loop, silence skipping, sleep timer, Picture-in-Picture, resume position, bookmarks.
- **Transcript search.** `.srt` and `.vtt` subtitles become a searchable transcript. Every match links to that moment, and small typos still match. Chapters from yt-dlp `.info.json` files or detected from pauses in the dialogue.
- **Picture.** WebGL2 effects with 7 presets and sliders for exposure, contrast, saturation, temperature, tint, sharpness and vignette. Brightness, fit and aspect ratio, rotate, zoom, screenshots that include the effects.
- **Sound.** Equalizer with presets, skip silence, volume and speed control.
- **Playlists.** Sidebar or carousel, shuffle, sorting, loop modes, thumbnail previews.
- **Multi-view.** Local files and YouTube links side by side in a grid, split or free canvas layout.
- **Interface.** Three control bar layouts, three looks, eight accent colors plus a custom one, elapsed or remaining time.

---

### Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/images/player-empty-state.png" alt="Empty state"><br><sub><b>Empty state</b></sub></td>
    <td width="50%"><img src="docs/images/player.png" alt="Player"><br><sub><b>Main Player</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/playlist-sidebar.png" alt="Playlist sidebar"><br><sub><b>Playlist sidebar</b></sub></td>
    <td width="50%"><img src="docs/images/playlist-carousel.png" alt="Playlist carousel"><br><sub><b>Playlist carousel</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/transcript-search.png" alt="Transcript search"><br><sub><b>Transcript search</b></sub></td>
    <td width="50%"><img src="docs/images/video-effects.png" alt="Video effects panel"><br><sub><b>Video effects</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/player-settings.png" alt="Player settings menu"><br><sub><b>Playback settings</b></sub></td>
    <td width="50%"><img src="docs/images/player-interface-settings.png" alt="Interface settings"><br><sub><b>Interface settings</b></sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/images/time-remaining-modes.webp" alt="Elapsed and total, or elapsed and remaining" width="640"><br><sub><b>Time display.</b> Click it to switch between elapsed and remaining time.</sub></td>
  </tr>
</table>

#### Control bar

Pick a layout and a look under **Settings → Interface**.

| Classic | Compact | Capsule |
|---|---|---|
| <img src="docs/images/classic-control-bar.png" alt="Classic control bar"> | <img src="docs/images/compact-control-bar.png" alt="Compact control bar"> | <img src="docs/images/capsule-control-bar.png" alt="Capsule control bar"> |

| Frost | Glass | Solid |
|---|---|---|
| <img src="docs/images/control-bar-pink-accent-frost-look.png" alt="Frost look"> | <img src="docs/images/control-bar-pink-accent-glass-look.png" alt="Glass look"> | <img src="docs/images/control-bar-pink-accent-solid-look.png" alt="Solid look"> |

---

### Keyboard Shortcuts

<p align="center"><img src="docs/images/keyboard-shortcuts.png" alt="Keyboard shortcuts panel" width="360"></p>

---

### Install

<table>
<tr>
  <td><b>Web app</b></td>
  <td>Open the <a href="https://pekoplayer.neverask.me">site</a> and use your browser's install button, or <b>Install web app</b> in the shortcuts panel (<code>?</code>). After the first visit it works offline.</td>
</tr>
  </tr>
  <tr>
    <td><b>Windows</b></td>
    <td>Download <code>PekoPlayer-&lt;version&gt;-portable.exe</code> from the <a href="https://github.com/rishipx/PekoPlayer/releases/latest">latest release</a> and run it. No installer, no administrator rights. The file is unsigned, so SmartScreen may warn: choose <b>More info → Run anyway</b>.</td>
  </tr>
  <tr>
    <td><b>Source</b></td>
    <td>See <a href="#run-from-source">Run from source</a>.</td>
  </tr>
</table>

The installed web app and the Windows app both appear in **Open with** for video files.

---

### Run from source

Requires [Node.js](https://nodejs.org) 22.

```bash
npm ci
npm run build
npm run serve          # http://localhost:8080
```

Use the served URL rather than opening `dist/index.html`; offline mode and the install prompt need `localhost` or HTTPS.

```bash
npm run desktop:start  # run the desktop app
npm run desktop:dist   # build release/PekoPlayer-<version>-portable.exe
```

---

### Browser support

Developed and tested in Chromium. Effects use WebGL2 in a worker (`OffscreenCanvas`); browsers without it hide the feature. Firefox and WebKit get a startup check in CI. Playable formats depend on your browser's codecs.

---

### Development

```bash
npm test               # lint, format check, static checks, unit tests, build, smoke tests
npm run test:unit      # fast tests for the pure logic
```

```
src/        App source: HTML, CSS, scripts, workers, icons
public/     Files copied to the build unchanged
desktop/    Electron shell for the Windows build
tools/      Build, check and dev-server scripts
tests/      Unit and smoke tests
docs/       Guides and screenshots
```

---

### Privacy

- No analytics, telemetry, cookies or accounts. `npm run check` fails the build if a telemetry API or an unapproved host appears in the source, and a smoke test confirms startup makes no third-party request.
- Fonts, icons and code are served from the same origin. Nothing loads from a CDN.
- Settings, resume positions, bookmarks and thumbnails stay in your browser's `localStorage` and IndexedDB. The Windows app keeps them in a `PekoPlayer-data` folder next to the executable.
- Two features contact third parties, only when you use them: YouTube tiles in multi-view (`youtube-nocookie.com`) and the subtitle search (opensubtitles.org).

---

### Documentation

[Architecture](docs/architecture.md) · [Multi-view](docs/multi-view.md) · [Desktop build](docs/desktop.md) · [Deployment](docs/deployment.md) · [Publishing](docs/publishing.md) · [Testing](docs/testing.md) · [Debug panel](docs/debugging.md)

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Disclaimer](DISCLAIMER.md)

---

### License

[MIT](LICENSE). Bundled Lucide icons are ISC ([license](src/icons/LICENSE)); bundled fonts use the SIL Open Font License ([license](public/fonts/LICENSE.txt)).
