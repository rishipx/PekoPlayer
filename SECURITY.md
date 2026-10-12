# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting instead: open the repository's **Security** tab and choose **Report a vulnerability**.

Include the steps to reproduce, the browser and version, and what an attacker could do. You will get a reply as soon as the maintainers can read the report.

## Scope

PekoPlayer runs entirely in the browser and has no server component. Files you open stay on your device. Relevant reports include cross-site scripting through file names, subtitles or metadata, bypasses of the Content-Security-Policy, and problems in the service worker. The only third-party requests the app makes are YouTube embeds in multi-view and the opensubtitles.org link, both on user action.

## Supported versions

Only the latest release receives fixes.
