# Desktop build (portable Windows executable)

The desktop build wraps the web app in [Electron](https://www.electronjs.org/) and produces one `PekoPlayer-<version>-portable.exe`. It needs no installer and no administrator rights. Everything lives in `desktop/`, and its dependencies are separate from the web app, so a normal `npm ci` never downloads Electron.

## Build it

On Windows, from the project root:

```bash
npm ci
npm run desktop:dist
```

The executable is written to `release/`. The command builds the web app, copies it to `desktop/web/`, installs the desktop dependencies and packages them.

To try the app without packaging:

```bash
npm run desktop:start
```

## Publish it

Pushing a tag such as `v1.0.0` runs `.github/workflows/release.yml`. It builds the executable on GitHub's Windows runners and attaches it, with a SHA-256 checksum, to a GitHub release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow can also be started manually from the Actions tab, which keeps the files as a build artifact for 14 days.

## How it works

- `main.cjs` starts a static server on `127.0.0.1:47831` (a free port if that one is taken) and opens it in a window. A fixed port keeps the page origin the same on every launch, because settings, bookmarks and resume positions are stored per origin.
- `server.cjs` serves `web/` with the security headers from the web build (`_headers`), accepts only `GET` and `HEAD`, rejects path traversal and rejects other `Host` headers.
- The window uses context isolation and the Chromium sandbox, has Node.js disabled, and has developer tools off in packaged builds. It stays on its own origin, and web links open in the default browser.
- Permissions are limited to fullscreen, file access and clipboard writes from the app's own origin.
- Chromium's background networking, component updates and spellcheck downloads are off. There is no auto-update, crash reporter or telemetry. As on the web, the only third-party contacts are a YouTube tile and the subtitle search link, on user action.

## Opening videos from File Explorer

The first time you start the portable executable it asks whether to add PekoPlayer to the Windows "Open with" menu for video files (`.mp4 .m4v .mkv .mov .webm .ogv .ogg .3gp`).

- **Add** writes a few entries under `HKEY_CURRENT_USER\Software\Classes`. They affect only your account and need no administrator rights. Afterwards, right-click a video, choose **Open with**, then **PekoPlayer**. To make it the default, use **Open with → Choose another app → Always**, or Settings → Apps → Default apps.
- **No thanks** changes nothing, and the question is not asked again.
- If you move or rename the executable, the entries are updated to the new location the next time it starts.
- **Second chance:** if you said no, or want to do it later, open the keyboard shortcuts panel (press `?`). While PekoPlayer is not yet in "Open with", it shows an **Add to "Open with"** button at the bottom, next to the install button. It disappears once PekoPlayer has been added.

Adding PekoPlayer to "Open with" does **not** make it the default player and does not remove your current one. It only adds it as a choice. To make it the default for a file type, right-click a video, choose **Open with → Choose another app**, pick PekoPlayer and select **Always**.

You can also change this later by starting the executable with a flag:

```powershell
.\PekoPlayer-1.0.0-portable.exe --register-file-types
.\PekoPlayer-1.0.0-portable.exe --unregister-file-types
```

Without registering, you can still use **Open with → Choose another app → Browse** and pick the executable once; Windows remembers it.

A video opened this way starts playing in the running window if PekoPlayer is already open, and is added to the playlist. A subtitle file with the same name next to the video (`movie.srt` or `movie.vtt` beside `movie.mp4`) is attached automatically.

## Opening folders

The **Folder** buttons use the operating system's own dialog. PekoPlayer opens every video in the chosen folder and its subfolders (hidden folders and symbolic links are skipped) and attaches subtitle, chapter and info files that share a video's name.

## Offline use

The desktop app contains everything it needs and never has to reach the internet. Playback, transcript search, effects and multi-view of local files all work with no connection. Only YouTube tiles and the subtitle search link need one.

## Where data is stored

Settings, bookmarks, resume positions and thumbnails are kept in a `PekoPlayer-data` folder next to the `.exe`. Move the executable and that folder together to carry your data along, or delete the folder to reset the app. These files are not encrypted.

## Things to know

- **SmartScreen:** the executable is not code-signed, so Windows may show "Windows protected your PC" on first launch. Choose "More info", then "Run anyway". Verify the file against the published `.sha256` first.
- **Startup time:** a portable executable unpacks itself to a temporary folder on every launch, which adds a couple of seconds.
- **Size:** around 80 to 100 MB, because it includes Chromium.
- **Controlled folder access:** if the build fails with "Protected folder access blocked", move the project out of folders such as Videos or Documents.
- **Updates:** download the new executable. There is no built-in updater, by design.

## Known build-tool advisory

`npm audit` in `desktop/` reports moderate findings that all come from one package, `sprintf-js` (denial of service through unbounded precision specifiers), pulled in by electron-builder's download helper. No patched `sprintf-js` exists yet, and the suggested `npm audit fix --force` would downgrade electron-builder, so it is left alone. The package only runs on the machine that builds the executable. It is not part of the packaged app, which contains just the shell scripts and the web build. Re-check with `npm audit` after upgrading electron-builder.

## Changing the app icon

Replace `branding/icon.png` and run `npm run icons`. It regenerates `desktop/build/icon.ico` together with the web icons.
