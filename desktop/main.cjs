'use strict';
// Electron shell for the portable Windows build. It serves the bundled web app from a loopback-only server and opens it
// in a hardened window. There is no telemetry, crash reporting or auto-update.
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./server.cjs');
const {
  filesFromArguments,
  collectFolderFiles,
  isRegistered,
  registerFileTypes,
  unregisterFileTypes,
} = require('./file-types.cjs');

// A fixed port keeps the page origin stable, because browser storage (settings, bookmarks, resume positions) is per origin.
const PREFERRED_PORT = 47831;
const APP_ID = 'app.pekoplayer.desktop';
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'fileSystem', 'clipboard-sanitized-write']);

// The electron-builder portable launcher exports its own location: keep all user data next to the .exe, and use that
// path (not the temporary folder the app is unpacked to) when registering file types.
const portableExe = process.env.PORTABLE_EXECUTABLE_FILE;
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'PekoPlayer-data'));
}

// Keep Chromium from making background requests of its own.
for (const flag of [
  'disable-background-networking',
  'disable-component-update',
  'disable-domain-reliability',
  'no-pings',
]) {
  app.commandLine.appendSwitch(flag);
}
app.setAppUserModelId(APP_ID);

/** Command-line arguments meant for the app: after the executable, or after `electron .` when running unpackaged. */
const userArguments = (argv) => argv.slice(app.isPackaged ? 1 : 2);

const settingsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    // No settings yet, or the file is damaged: start from the defaults.
    return {};
  }
}

function writeSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {
    // The folder is read-only: the choice simply is not remembered.
  }
}

/** `--register-file-types` and `--unregister-file-types`: change the Windows "Open with" entries, then exit. */
async function handleRegistrationFlag(args) {
  const register = args.includes('--register-file-types');
  if (!register && !args.includes('--unregister-file-types')) return false;
  await app.whenReady();
  try {
    if (register) {
      if (!portableExe) throw new Error('Registration is only available in the portable executable.');
      await registerFileTypes(portableExe);
      writeSettings({ ...readSettings(), fileTypes: 'registered', exePath: portableExe });
    } else {
      await unregisterFileTypes();
      writeSettings({ ...readSettings(), fileTypes: 'declined', exePath: undefined });
    }
    await dialog.showMessageBox({
      type: 'info',
      message: register ? 'PekoPlayer was added to "Open with".' : 'PekoPlayer was removed from "Open with".',
    });
  } catch (error) {
    dialog.showErrorBox('PekoPlayer', String(error.message || error));
  }
  app.quit();
  return true;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  let httpServer = null;
  let origin = '';
  let openQueue = Promise.resolve();

  /** Resolves when the page has created its player, so files can be handed to it. */
  async function waitForPlayer(contents) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (contents.isDestroyed()) return false;
      const ready = await contents.executeJavaScript('Boolean(window.pekoPlayer)').catch(() => false);
      if (ready) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }

  /**
   * Hands local files to the page by filling one of its hidden file inputs through the DevTools protocol, exactly as if they
   * had been picked in the file dialog. The page reads them from disk itself, so large videos are never copied around.
   */
  function openFiles(files, input = '#fileInput') {
    if (!files.length) return openQueue;
    openQueue = openQueue.then(async () => {
      if (!win || win.isDestroyed() || !(await waitForPlayer(win.webContents))) return;
      const contents = win.webContents;
      try {
        contents.debugger.attach('1.3');
        const { root } = await contents.debugger.sendCommand('DOM.getDocument', { depth: 0 });
        const { nodeId } = await contents.debugger.sendCommand('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: input,
        });
        if (input === '#fileInput') await contents.executeJavaScript("window.pekoPlayer._fileInputIntent = 'play'");
        await contents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files });
      } catch (error) {
        console.error('Could not open files:', error);
      } finally {
        if (contents.debugger.isAttached()) contents.debugger.detach();
      }
      if (win.isMinimized()) win.restore();
      win.focus();
    });
    return openQueue;
  }

  /** The "Open with" menu can be managed only from the portable Windows build. */
  const canManageOpenWith = () => process.platform === 'win32' && Boolean(portableExe);

  /** Only the app's own page may use the desktop bridge. */
  function assertTrusted(event) {
    const url = event.senderFrame?.url;
    if (!url || new URL(url).origin !== origin) throw new Error('Untrusted sender');
  }

  function registerIpcHandlers() {
    ipcMain.handle('desktop:open-folder', async (event, target) => {
      assertTrusted(event);
      if (target !== 'player' && target !== 'multiview') throw new Error('Unknown target');
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Open folder',
        properties: ['openDirectory'],
      });
      if (canceled || !filePaths[0]) return { canceled: true, count: 0 };
      const files = collectFolderFiles(filePaths[0]);
      await openFiles(files, target === 'multiview' ? '#mvFileInput' : '#fileInput');
      return { canceled: false, count: files.length };
    });
    ipcMain.handle('desktop:open-with-state', async (event) => {
      assertTrusted(event);
      const available = canManageOpenWith();
      return { available, registered: available ? await isRegistered(portableExe) : false };
    });
    ipcMain.handle('desktop:open-with-register', async (event) => {
      assertTrusted(event);
      if (!canManageOpenWith()) return { ok: false };
      try {
        await registerFileTypes(portableExe);
        writeSettings({ ...readSettings(), fileTypes: 'registered', exePath: portableExe });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error.message || error) };
      }
    });
  }

  /** Once, in the portable build: offer to add PekoPlayer to the Windows "Open with" menu (current user only). */
  async function offerFileTypes() {
    if (process.platform !== 'win32' || !portableExe) return;
    const settings = readSettings();
    if (settings.fileTypes === 'registered') {
      // The executable was moved or renamed: point the registered entries at its new location.
      if (settings.exePath !== portableExe) {
        await registerFileTypes(portableExe).catch(() => {});
        writeSettings({ ...settings, exePath: portableExe });
      }
      return;
    }
    if (settings.fileTypes === 'declined') return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'PekoPlayer',
      message: 'Add PekoPlayer to the "Open with" menu for video files?',
      detail:
        'This lets you open videos from File Explorer with PekoPlayer. It only changes settings for your user account and needs no administrator rights. ' +
        'You can also do it later from the keyboard shortcuts panel (press ?). To undo it, run PekoPlayer with --unregister-file-types.',
      buttons: ['Add', 'No thanks'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      try {
        await registerFileTypes(portableExe);
        writeSettings({ ...settings, fileTypes: 'registered', exePath: portableExe });
      } catch (error) {
        dialog.showErrorBox('PekoPlayer', `Could not add PekoPlayer to "Open with": ${error.message}`);
      }
    } else {
      writeSettings({ ...settings, fileTypes: 'declined' });
    }
  }

  app.on('second-instance', (_event, argv, workingDirectory) => {
    openFiles(filesFromArguments(userArguments(argv), workingDirectory));
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => httpServer?.close());

  handleRegistrationFlag(userArguments(process.argv)).then(async (handled) => {
    if (handled) return;
    await app.whenReady();
    Menu.setApplicationMenu(null);
    const started = await startServer({ root: path.join(__dirname, 'web'), port: PREFERRED_PORT, fallback: true });
    httpServer = started.server;
    origin = started.origin;
    registerIpcHandlers();

    const permissionAllowed = (permission, requestOrigin) =>
      ALLOWED_PERMISSIONS.has(permission) && requestOrigin === origin;
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permissionAllowed(permission, new URL(details.requestingUrl || contents.getURL()).origin));
    });
    session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
      permissionAllowed(permission, requestingOrigin),
    );

    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 400,
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      show: false,
      icon: path.join(__dirname, 'web', 'icons', 'icon-512.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.cjs'),
        spellcheck: false,
        devTools: !app.isPackaged,
      },
    });
    win.once('ready-to-show', () => win.show());

    // Stay on the app origin; open web links in the default browser and refuse everything else.
    win.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    await win.loadURL(`${origin}/`);
    await openFiles(filesFromArguments(userArguments(process.argv)));
    offerFileTypes().catch(() => {});
  });
}
