// Desktop app bridge: offers "Add to Open with" in the shortcuts panel while the page runs inside the desktop app.
(function () {
  'use strict';
  const desktop = window.pekoDesktop;
  const button = document.getElementById('openWithBtn');
  const modal = document.getElementById('shortcutsModal');
  if (!desktop || !button) return;

  const announce = (message) => window.pekoPlayer?.announce?.(message);

  /** Shows the button only when "Open with" can be set up here and has not been set up yet. */
  async function refresh() {
    try {
      const state = await desktop.openWithState();
      button.hidden = !(state.available && !state.registered);
    } catch {
      // The desktop shell did not answer: leave the button hidden.
      button.hidden = true;
    }
  }

  button.addEventListener('click', async () => {
    const result = await desktop.addToOpenWith().catch(() => ({ ok: false }));
    if (result.ok) {
      button.hidden = true;
      announce('PekoPlayer was added to "Open with"');
    } else {
      announce('Could not add PekoPlayer to "Open with"');
    }
  });

  // The first-run prompt may have been answered since the page loaded, so check again whenever the panel opens.
  if (modal) new MutationObserver(refresh).observe(modal, { attributes: true, attributeFilter: ['class', 'hidden'] });
  refresh();
})();
