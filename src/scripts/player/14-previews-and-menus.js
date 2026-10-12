// Player: Hover previews, popover menus, speed menu and subtitle settings popover
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      _ensurePreview() {
        if (this._playlistPreviewEl) return this._playlistPreviewEl;
        const el = document.createElement('div');
        el.className = 'pi-preview';
        const img = document.createElement('img');
        img.alt = '';
        el.appendChild(img);
        document.body.appendChild(el);
        this._playlistPreviewEl = el;
        return el;
      },

      /** Shows the floating thumbnail preview with the given image. */
      _showPreview(src, anchorRect, side = 'left') {
        if (!src) {
          this._hidePreview();
          return;
        }
        const el = this._ensurePreview();
        el.querySelector('img').src = src;
        const PW = 250,
          PH = 140,
          GAP = 14;
        let left;
        if (side === 'left') {
          const pr = this.el.playlistPanel.getBoundingClientRect();
          left = pr.left - PW - GAP;
        } else {
          const pr = this.el.searchPanel.getBoundingClientRect();
          left = pr.right + GAP;
        }
        let top = anchorRect.top + anchorRect.height / 2 - PH / 2;
        left = Math.max(8, Math.min(window.innerWidth - PW - 8, left));
        top = Math.max(8, Math.min(window.innerHeight - PH - 8, top));
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.classList.add('visible');
      },

      _hidePreview() {
        clearTimeout(this._playlistPreviewTimer);
        this._playlistPreviewEl?.classList.remove('visible');
      },

      /** Shows a thumbnail preview while hovering playlist items. */
      bindPlaylistPreview() {
        const list = this.el.playlistItems;
        if (!list) return;
        list.addEventListener('mouseover', (e) => {
          const li = e.target.closest('.playlist-item');
          if (!li) {
            this._hidePreview();
            return;
          }
          const item = this.playlist[Number(li.dataset.index)];
          if (!item || !item.thumbnail) return;
          clearTimeout(this._playlistPreviewTimer);
          this._playlistPreviewTimer = setTimeout(
            () => this._showPreview(item.thumbnail, li.getBoundingClientRect(), 'left'),
            400,
          );
        });
        list.addEventListener('mouseout', (e) => {
          const to = e.relatedTarget?.closest?.('.playlist-item');
          const fr = e.target.closest?.('.playlist-item');
          if (fr && !to) this._hidePreview();
        });
        list.addEventListener('mouseleave', () => this._hidePreview());
        list.addEventListener('scroll', () => this._hidePreview(), { passive: true });
      },

      /** Shows a thumbnail preview while hovering chapters. */
      bindChapterPreview() {
        const list = this.el.chapterList;
        if (!list) return;
        list.addEventListener('mouseover', (e) => {
          const li = e.target.closest('.chapter-item');
          if (!li) {
            this._hidePreview();
            return;
          }
          const item = this.playlist[this.currentIndex];
          if (!item) return;
          const t = parseFloat(li.dataset.time);
          const key = `${item.id}::${t.toFixed(1)}`;
          const url = this._chapterThumbCache.get(key);
          if (!url) {
            this._hidePreview();
            return;
          }
          clearTimeout(this._playlistPreviewTimer);
          this._playlistPreviewTimer = setTimeout(
            () => this._showPreview(url, li.getBoundingClientRect(), 'right'),
            300,
          );
        });
        list.addEventListener('mouseout', (e) => {
          const to = e.relatedTarget?.closest?.('.chapter-item');
          const fr = e.target.closest?.('.chapter-item');
          if (fr && !to) this._hidePreview();
        });
        list.addEventListener('mouseleave', () => this._hidePreview());
        list.addEventListener('scroll', () => this._hidePreview(), { passive: true });
      },

      positionMenu(el, anchorEl, offsetY = 12) {
        if (window.innerWidth <= 760) {
          el.style.left = '';
          el.style.right = '';
          el.style.bottom = '';
          el.style.top = '';
          return;
        }
        const rect = anchorEl.getBoundingClientRect();
        el.style.left = 'auto';
        el.style.right = `${Math.max(12, window.innerWidth - rect.right - 4)}px`;
        el.style.bottom = `${window.innerHeight - rect.top + offsetY}px`;
      },
      // Opening a menu dismisses its sibling floating surfaces.

      toggleSettingsMenu(force) {
        const open = force ?? this.el.settingsMenu.hidden;
        if (open) this._closeOthersFor(['settings']);
        this.el.settingsMenu.hidden = !open;
        this.el.settingsBtn.setAttribute('aria-expanded', String(open));
        this.el.settingsBtn.classList.toggle('active', open);
        if (open) {
          this.showSettingsPage('main', { animate: false });
          this.positionMenu(this.el.settingsMenu, this.el.settingsBtn, 12);
        }
      },

      closeSettingsMenu() {
        this.el.settingsMenu.hidden = true;
        this.el.settingsBtn.setAttribute('aria-expanded', 'false');
        this.el.settingsBtn.classList.remove('active');
        this.showSettingsPage('main', { animate: false });
      },

      toggleCaptionsMenu() {
        const { captionsMenu, captionsBtn } = this.el;
        const willOpen = captionsMenu.hidden;
        if (willOpen) this._closeOthersFor(['captions']);
        captionsMenu.hidden = !willOpen;
        captionsBtn.setAttribute('aria-expanded', String(willOpen));
        captionsBtn.classList.toggle('active', willOpen);
        if (willOpen) {
          this.renderCaptionsMenu();
          this.renderEmbeddedTracksMenu();
          this.updateSearchSubsLink();
          this.positionMenu(captionsMenu, captionsBtn, 12);
        }
      },

      closeCaptionsMenu() {
        this.el.captionsMenu.hidden = true;
        this.el.captionsBtn.setAttribute('aria-expanded', 'false');
        this.el.captionsBtn.classList.remove('active');
      },

      updateSearchSubsLink() {
        const a = this.el.searchSubsBtn;
        if (!a) return;
        const item = this.playlist[this.currentIndex];
        const q = item ? item.name.replace(/\.[^.]+$/, '') : '';
        a.href = `https://www.opensubtitles.org/en/search2/sublanguageid-all/moviename-${encodeURIComponent(q)}`;
      },

      toggleSpeedMenu() {
        const { speedMenu } = this.el;
        if (!speedMenu) return;
        const willOpen = speedMenu.hidden;
        if (willOpen) this._closeOthersFor(['speed']);
        speedMenu.hidden = !willOpen;
        if (willOpen) {
          this.positionMenu(speedMenu, this.el.speedBtn, 10);
          this.syncSpeedMenuActive();
        }
      },

      closeSpeedMenu() {
        if (this.el.speedMenu) this.el.speedMenu.hidden = true;
      },

      syncSpeedMenuActive() {
        if (!this.el.speedMenu) return;
        const cur = String(Number(this.el.speedSelect.value));
        this.el.speedMenu
          .querySelectorAll('button[data-speed]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-speed') === cur));
      },

      syncSpeedBtn() {
        const btn = this.el.speedBtn;
        if (!btn) return;
        const rate = Number(this.el.speedSelect.value) || 1;
        btn.textContent = `${rate}×`;
        btn.classList.toggle('is-modified', rate !== 1);
      },

      cycleSpeed(dir = 1) {
        const cur = Number(this.el.speedSelect.value) || 1;
        let idx = SPEED_STEPS.indexOf(cur);
        if (idx === -1) idx = SPEED_STEPS.indexOf(1);
        idx = (idx + dir + SPEED_STEPS.length) % SPEED_STEPS.length;
        const next = SPEED_STEPS[idx];
        this.el.speedSelect.value = String(next);
        this.setSpeed(next);
        this.syncSpeedBtn();
        this.syncSpeedMenuActive();
      },

      setSpeedFromMenu(rate) {
        const n = Number(rate);
        if (!Number.isFinite(n)) return;
        this.el.speedSelect.value = String(n);
        this.setSpeed(n);
        this.syncSpeedBtn();
        this.syncSpeedMenuActive();
        this.closeSpeedMenu();
      },

      openSubtitleSettingsPopover() {
        this._closeOthersFor(['subtitle']);
        this.el.subtitleSettingsPopover.hidden = false;
        this.positionMenu(this.el.subtitleSettingsPopover, this.el.captionsBtn, 12);
        this.syncSubtitleSettingsUI();
      },

      closeSubtitleSettingsPopover() {
        this.el.subtitleSettingsPopover.hidden = true;
      },
    };
  })(),
);
