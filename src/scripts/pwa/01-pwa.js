// Install prompt handling and service worker registration.
(function initPwa() {
  try {
    const installBtn = document.getElementById('installPwaBtn');
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true;

    if (isStandalone && installBtn) installBtn.hidden = true;

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      if (installBtn && !isStandalone) installBtn.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      if (installBtn) installBtn.hidden = true;
      if (window.pekoPlayer?.announce) window.pekoPlayer.announce('PekoPlayer installed');
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
        } catch {
          // The install prompt was dismissed or is no longer available.
        }
        deferredPrompt = null;
        installBtn.hidden = true;
      });
    }

    // Files opened from the operating system (double-click or "Open with" on the installed app) arrive in the launch queue.
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(async (launchParams) => {
        const files = [];
        for (const handle of launchParams.files || []) {
          try {
            files.push(await handle.getFile());
          } catch {
            // The file was moved or can no longer be read: skip it.
          }
        }
        const player = window.pekoPlayer;
        if (!files.length || !player) return;
        if (window.multiView?.isOpen) window.multiView.close();
        player.addFilesToPlaylistWithSidecars(files, { playFirst: true });
      });
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  } catch {
    // Install support is best-effort and must never block the player.
  }
})();
