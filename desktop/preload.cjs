'use strict';
// The only bridge between the page and the desktop shell. The page can ask for a folder to be opened and manage the
// Windows "Open with" entries; it never gets file system or Node.js access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'pekoDesktop',
  Object.freeze({
    /** Shows the folder dialog and hands the videos found to the player (`target` is 'player' or 'multiview'). */
    openFolder: (target) => ipcRenderer.invoke('desktop:open-folder', target),
    /** Resolves to { available, registered }: whether "Open with" can be managed here and whether it is set up. */
    openWithState: () => ipcRenderer.invoke('desktop:open-with-state'),
    /** Adds PekoPlayer to the Windows "Open with" menu for video files. Resolves to { ok }. */
    addToOpenWith: () => ipcRenderer.invoke('desktop:open-with-register'),
  }),
);
