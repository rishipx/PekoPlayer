# Publishing

How to put the project on GitHub, set the repository up properly, and ship a release. Replace `<you>` with your GitHub username.

## 1. Before the first push

1. **Replace the placeholder.** `OWNER` appears in `README.md` and `package.json`. Replace it with your username:
   ```powershell
   (Get-Content README.md) -replace 'OWNER','<you>' | Set-Content README.md
   (Get-Content package.json) -replace 'OWNER','<you>' | Set-Content package.json
   ```
2. Put your name (or username) after the year in `LICENSE`.
3. Make sure you have the right to publish the icon in `branding/`.
4. Set your git identity, using the no-reply address from GitHub → Settings → Emails so your real address stays private:
   ```powershell
   git config --global user.name "<you>"
   git config --global user.email "<id>+<you>@users.noreply.github.com"
   ```
5. Run `npm ci` and `npm test` once. CI repeats this on every push, so a green local run saves a red first build.

Start from a clean copy of the project (a fresh unzip or a fresh clone), not a folder you have been building in. `.gitignore` keeps `node_modules`, `dist`, `release`, `desktop/web` and the generated test videos out of git, but a clean folder removes any doubt.

## 2. Create the repository and push

On github.com choose **New repository**, name it `PekoPlayer`, make it public, and leave "Add a README", ".gitignore" and "license" **unchecked**. Then:

```powershell
git init -b main
git add .
git status
```

The list must not contain `node_modules`, `dist`, `release`, `.webm` files, `.env` files or `build.log`. Then:

```powershell
git commit -m "Initial release v1.0.0"
git remote add origin https://github.com/<you>/PekoPlayer.git
git push -u origin main
```

Sign in through the browser window if Git asks. GitHub no longer accepts account passwords on the command line.

Open the **Actions** tab and wait for **CI** to finish. Fix anything red before continuing.

## 3. Repository settings

**About** (the gear next to it on the repository home page):
- Description: `A private video player for your browser and desktop. Local files, searchable subtitles, WebGL2 effects and multi-view. No telemetry.`
- Website: your live site (GitHub Pages or your own domain).
- Topics: `video-player`, `pwa`, `electron`, `privacy`, `webgl`, `subtitles`, `offline-first`, `vanilla-js`.

**Settings → General → Social preview:** upload `branding/social-preview.png`. This is the image shown when the link is shared.

**Features:** keep Issues on. Turn Wikis and Projects off unless you will use them, and enable Discussions if you want a place for questions.

**Settings → Code security:**
- Enable **Private vulnerability reporting**, which `SECURITY.md` points to.
- Leave **Dependabot alerts** on. Updates are already configured in `.github/dependabot.yml`.

**Settings → Branches → Add rule** for `main`: require a pull request, and require the **CI / verify** check to pass.

## 4. Publish the website

**GitHub Pages:** Settings → Pages → Source → **GitHub Actions**. The **Deploy to GitHub Pages** workflow publishes on every push to `main`, at `https://<you>.github.io/PekoPlayer/`.

**Cloudflare Pages** (for your own domain and full security headers): create a Pages project from the repository with build command `npm run build`, output directory `dist` and the variable `NODE_VERSION=22`, then add the domain. `dist/_headers` is applied automatically.

Check the live site: DevTools → Network shows only requests to your own address, the manifest and service worker are listed under Application, and reloading with **Offline** ticked still works. See [Deployment](deployment.md).

## 5. Release the Windows app

1. **Dry run.** Actions → **Release** → **Run workflow**. Download the artifact and test the exe.
2. **Publish.** Make sure `version` is the same in `package.json` and `desktop/package.json` (`npm run check` fails if not), then:
   ```powershell
   git tag v1.0.0
   git push origin v1.0.0
   ```
   The workflow builds the exe on a Windows runner and creates a GitHub Release with the exe and a `.sha256` file.
3. **Edit the release notes.** Say what is new, and add the SmartScreen note: the exe is not code-signed, so Windows shows "Windows protected your PC"; choose **More info → Run anyway** and compare the file with the `.sha256`.
4. **Verify.** Download the exe from the Releases page and check it:
   ```powershell
   Get-FileHash .\PekoPlayer-1.0.0-portable.exe -Algorithm SHA256
   ```

## 6. Keeping it healthy

- Work on branches and open pull requests; CI runs the full suite on each.
- Bump the version in both `package.json` files, then tag, for every release. The release notes on GitHub are the changelog.
- When the interface changes, regenerate the screenshots with `npm run docs:screenshots` (needs ffmpeg and `npx playwright install chromium`) and commit the new images.
- The Windows executable is not code-signed. Signing needs a paid certificate; until then, publish the checksum with every release.
