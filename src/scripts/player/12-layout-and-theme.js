// Player: Control layout, playlist placement and style, theme, reduced motion, settings pages
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      applyControlLayout(layout, opts = {}) {
        const valid = ['minimal', 'classic', 'standard'];
        if (!valid.includes(layout)) layout = 'minimal';
        this.controlLayout = layout;
        this.el.controlBar.dataset.layout = layout;
        this.el.controls.classList.toggle('standard-layout', layout === 'standard');
        this.syncControlLayoutUI();
        if (!opts.silent) this.saveSettings();
      },

      applyControlLook(look, opts = {}) {
        const valid = ['frost', 'glass', 'solid'];
        if (!valid.includes(look)) look = 'frost';
        this.controlLook = look;
        this.el.controlBar.dataset.look = look;
        document
          .querySelectorAll(
            '.captions-menu, .settings-menu, .subtitle-settings-popover, .speed-menu, .mv-popover-menu, #mvView, #mvToolbar, #playlistCarousel',
          )
          .forEach((el) => {
            el.dataset.look = look;
          });
        this.syncControlLookUI();
        if (!opts.silent) this.saveSettings();
      },

      syncControlLayoutUI() {
        if (!this.el.controlLayoutGroup) return;
        this.el.controlLayoutGroup
          .querySelectorAll('button[data-layout]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-layout') === this.controlLayout));
      },

      syncControlLookUI() {
        if (!this.el.controlLookGroup) return;
        this.el.controlLookGroup
          .querySelectorAll('button[data-look]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-look') === this.controlLook));
      },

      syncPlaylistButtonPlacement() {
        const inCB = this.playlistButtonInControlBar;
        if (this.el.playlistToggleBtn) this.el.playlistToggleBtn.hidden = inCB;
        if (this.el.playlistQuickBtn) this.el.playlistQuickBtn.hidden = !inCB;
        const row = this.el.playlistBtnPlacementRow;
        if (row) {
          row.classList.toggle('on', inCB);
          row.setAttribute('aria-checked', String(inCB));
        }
      },

      setPlaylistButtonPlacement(on, opts = {}) {
        this.playlistButtonInControlBar = !!on;
        this.syncPlaylistButtonPlacement();
        if (!opts.silent) this.saveSettings();
      },

      syncPlaylistStyleUI() {
        const g = this.el.playlistStyleGroup;
        if (!g) return;
        g.querySelectorAll('button[data-plstyle]').forEach((b) =>
          b.classList.toggle('active', b.getAttribute('data-plstyle') === this.playlistStyle),
        );
      },

      setPlaylistStyle(style, opts = {}) {
        if (style !== 'sidebar' && style !== 'carousel') return;
        if (this.playlistStyle === style) {
          this.syncPlaylistStyleUI();
          return;
        }
        if (this.isPlaylistOpen()) this.togglePlaylistPanel(false, { restoreFocus: false });
        this.playlistStyle = style;
        this.syncPlaylistStyleUI();
        if (!opts.silent) this.saveSettings();
      },

      isPlaylistOpen() {
        if (this.playlistStyle === 'carousel') return !!(this.el.playlistCarousel && !this.el.playlistCarousel.hidden);
        return this.el.playlistPanel.classList.contains('open');
      },

      _syncShuffleUI() {
        const on = this.shuffleOn;
        [this.el.playlistShuffleBtn, this.el.plcShuffleBtn].forEach((btn) => {
          if (!btn) return;
          btn.setAttribute('aria-pressed', String(on));
          btn.classList.toggle('active', on);
        });
      },

      _syncSortUI() {
        if (this.el.playlistSort) this.el.playlistSort.value = this.sortMode;
        if (this.el.plcSort) this.el.plcSort.value = this.sortMode;
      },

      _getSortedPlaylist() {
        const rows = this.playlist.map((item, index) => ({ item, index }));
        const mode = this.sortMode;
        if (mode === 'name') rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
        else if (mode === 'duration') rows.sort((a, b) => (b.item.duration || 0) - (a.item.duration || 0));
        else if (mode === 'size') rows.sort((a, b) => (b.item.size || 0) - (a.item.size || 0));
        else if (mode === 'added') rows.sort((a, b) => (b.item.addedAt || 0) - (a.item.addedAt || 0));
        return rows;
      },
      // Closes every floating surface that is not in the whitelist.

      // Shows or hides the top bar. The choice is remembered across visits unless opts.persist is false.
      setTopbarHidden(hidden, opts = {}) {
        const el = this.el;
        el.app.classList.toggle('topbar-hidden', hidden);
        el.topbarHideBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        el.topbarRevealBtn.hidden = !hidden;
        if (!hidden) el.topbarRevealBtn.classList.remove('visible');
        if (opts.persist !== false) {
          try {
            localStorage.setItem(PekoConfig.STORAGE.topbarHidden, hidden ? '1' : '0');
          } catch {
            // Storage is unavailable or full: skip saving, the app keeps working.
          }
        }
        requestAnimationFrame(() => {
          this.shaderRenderer?.resize();
          if (this.state.rotation) this.applyRotation();
        });
      },

      // Moves focus off an element inside a panel that is closing. Panels slide out of view instead of
      // being removed, so a focused search or filter field would otherwise keep swallowing shortcut keys.
      _releaseFocusFrom(container) {
        const active = document.activeElement;
        if (active && active !== document.body && container?.contains(active)) active.blur();
      },

      _closeOthersFor(except = []) {
        const ex = new Set(except);
        if (!ex.has('settings') && !this.el.settingsMenu.hidden) this.closeSettingsMenu();
        if (!ex.has('captions') && !this.el.captionsMenu.hidden) this.closeCaptionsMenu();
        if (!ex.has('speed') && this.el.speedMenu && !this.el.speedMenu.hidden) this.closeSpeedMenu();
        if (!ex.has('subtitle') && !this.el.subtitleSettingsPopover.hidden) this.closeSubtitleSettingsPopover();
        if (!ex.has('carousel') && this.el.playlistCarousel && !this.el.playlistCarousel.hidden)
          this.togglePlaylistCarousel(false, { restoreFocus: false });
        if (!ex.has('plcList') && this.el.plcListPopup && !this.el.plcListPopup.hidden) this.toggleCarouselList(false);
        if (!ex.has('sidebar') && this.el.playlistPanel.classList.contains('open'))
          this.togglePlaylistSidebar(false, { restoreFocus: false });
        if (!ex.has('search') && this.state.searchPanelOpen) this.toggleSearchPanel(false, { restoreFocus: false });
      },
      // Dismisses the playlist carousel and its list popup on any outside interaction.

      closePlaylistCarouselFloating() {
        if (this.el.plcListPopup && !this.el.plcListPopup.hidden) this.toggleCarouselList(false);
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden)
          this.togglePlaylistCarousel(false, { restoreFocus: false });
      },

      showActionBadge(icon, label, value, active) {
        const { actionBadge, actionBadgeIcon, actionBadgeLabel, actionBadgeValue, controls } = this.el;
        if (!actionBadge || !controls.classList.contains('visible')) return;
        actionBadgeIcon.innerHTML = icon || '';
        actionBadgeLabel.textContent = label || '';
        actionBadgeValue.textContent = value || '';
        actionBadge.classList.toggle('is-active', !!active);
        actionBadge.classList.add('visible');
        clearTimeout(this._actionBadgeTimer);
        this._actionBadgeTimer = setTimeout(() => {
          actionBadge.classList.remove('visible');
        }, 1500);
      },

      applyTheme(hex, opts = {}) {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        this.themeColor = hex.toLowerCase();
        const root = document.documentElement,
          c = hex.replace('#', '');
        const r = parseInt(c.slice(0, 2), 16),
          g = parseInt(c.slice(2, 4), 16),
          b = parseInt(c.slice(4, 6), 16);
        root.style.setProperty('--accent', hex);
        root.style.setProperty('--accent-rgb', `${r},${g},${b}`);
        root.style.setProperty('--accent-hover', this._lightenHex(hex, 0.15));
        root.style.setProperty('--accent-soft', this._hexToRgba(hex, 0.14));
        root.style.setProperty('--accent-glow', `0 0 0 3px ${this._hexToRgba(hex, 0.2)}`);
        if (this.el.themeSwatches)
          this.el.themeSwatches
            .querySelectorAll('button[data-theme]')
            .forEach((btn) =>
              btn.classList.toggle('active', (btn.getAttribute('data-theme') || '').toLowerCase() === this.themeColor),
            );
        if (this.el.themePicker) this.el.themePicker.value = hex;
        if (!opts.silent) this.saveSettings();
      },

      _lightenHex(hex, amount) {
        const c = hex.replace('#', '');
        const r = parseInt(c.slice(0, 2), 16),
          g = parseInt(c.slice(2, 4), 16),
          b = parseInt(c.slice(4, 6), 16);
        const nr = Math.min(255, Math.round(r + (255 - r) * amount)),
          ng = Math.min(255, Math.round(g + (255 - g) * amount)),
          nb = Math.min(255, Math.round(b + (255 - b) * amount));
        return '#' + [nr, ng, nb].map((v) => v.toString(16).padStart(2, '0')).join('');
      },

      _hexToRgba(hex, alpha) {
        const c = hex.replace('#', '');
        const r = parseInt(c.slice(0, 2), 16),
          g = parseInt(c.slice(2, 4), 16),
          b = parseInt(c.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      },

      applyReduceMotion(on, opts = {}) {
        if (this.systemReducedMotion && !on) return;
        this.reduceMotion = !!on;
        document.documentElement.classList.toggle('reduce-motion', this.reduceMotion);
        if (!opts.silent) this.saveSettings();
      },

      showSettingsPage(name, opts = {}) {
        if (this.settingsPage === 'main' && name !== 'main') this._mainScrollTop = this.el.settingsMenu.scrollTop;
        this.settingsPage = name;
        const pages = this.el.settingsMenu.querySelectorAll('.settings-page');
        pages.forEach((p) => {
          const isTarget = p.getAttribute('data-settings-page') === name;
          p.hidden = !isTarget;
          if (isTarget && opts.animate !== false) {
            p.classList.remove('anim-in');
            void p.offsetWidth;
            p.classList.add('anim-in');
          }
        });
        if (name === 'main') this.el.settingsMenu.scrollTop = this._mainScrollTop || 0;
        else this.el.settingsMenu.scrollTop = 0;
      },
    };
  })(),
);
