# Disclaimer

PekoPlayer is free, open-source software released under the [MIT License](LICENSE). By using it you accept the terms below.

## No warranty

PekoPlayer is provided "as is", without warranty of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, availability, accuracy and non-infringement. The authors and contributors are not liable for any claim, damage, data loss or other liability arising from the use of, or inability to use, the software. The full terms are in the [LICENSE](LICENSE).

## Your content

PekoPlayer plays files that you choose from your own device. It does not host, upload, stream, index or distribute media, and it has no way to see what you play.

- You are responsible for making sure you have the right to view, copy or otherwise use the media, subtitles and links you open.
- PekoPlayer does not bypass copy protection or DRM, and it is not designed to.
- Playback depends on the codecs your browser provides. Some files may not play, or may play without audio or video.

## Privacy and local data

PekoPlayer has no backend, accounts, analytics, telemetry or error reporting. Everything happens in your browser.

- Settings, resume positions, bookmarks, thumbnails and playlist details are stored in your browser's `localStorage` and IndexedDB on your device. Clearing your site data removes them. Anyone with access to your browser profile can read them.
- Two features contact third parties, and only when you use them. A YouTube tile in multi-view loads the YouTube player from `youtube-nocookie.com`. The subtitle search link opens opensubtitles.org in a new tab with the video's file name in the address. Those services have their own terms and privacy policies, and PekoPlayer has no control over them.
- Details are in the [Privacy](README.md#privacy) section of the README.

## Third-party services, software and trademarks

PekoPlayer is an independent project. It is not affiliated with, endorsed by or sponsored by Google, YouTube, OpenSubtitles or any other company. All product names, logos and trademarks belong to their respective owners and are used only to identify the services PekoPlayer can interact with.

PekoPlayer bundles third-party open-source components under their own licenses:

- Lucide icons (ISC): [src/icons/LICENSE](src/icons/LICENSE)
- The desktop build bundles Electron and Chromium (MIT and BSD-style licenses). Their license texts, `LICENSE.electron.txt` and `LICENSES.chromium.html`, ship inside the executable's folder.
- Inter, Lora, Nunito and IBM Plex Mono fonts (SIL Open Font License 1.1), via Fontsource: [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt)

## Desktop executable

The portable Windows executable is not code-signed, so Windows SmartScreen or antivirus software may warn about it. Check the SHA-256 checksum published with each release, or build it yourself from the source. It stores its data in a folder next to the executable without encryption. If you accept the first-run offer, it adds entries to your user registry (`HKEY_CURRENT_USER\Software\Classes`) so it appears in the "Open with" menu; `--unregister-file-types` removes them.

## Health and safety

Video effects, playback speed changes and the equalizer can alter how content looks and sounds, including brightness, contrast and loudness. If you are sensitive to flashing images or loud sound, adjust these settings with care and keep the volume at a safe level.

## Security

PekoPlayer opens files and links you provide. Treat media, subtitle and metadata files from untrusted sources with the same care as any downloaded file. To report a vulnerability, see the [security policy](SECURITY.md).

## Changes

This disclaimer may be updated as the project changes. The version in the repository's default branch is the current one.
