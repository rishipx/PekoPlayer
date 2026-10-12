// Multi-view: Event binding, open and close, keyboard and tile intake
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Wires the toolbar, file inputs, YouTube form, layout controls and global listeners of the wall. */
      bindEvents() {
        const el = this.el;
        el.multiviewOpenBtn.addEventListener('click', () => this.open());
        el.mvBackBtn.addEventListener('click', () => this.close());
        el.mvFileInput.addEventListener('change', (e) =>
          this.addLocalFiles(e.target.files || new DataTransfer().files),
        );
        el.mvYtForm.addEventListener('submit', (e) => {
          e.preventDefault();
          this.addYouTubeFromInput();
        });
        el.mvPlayPauseAllBtn.addEventListener('click', () => this.togglePlayPauseAll());
        el.mvMuteAllBtn.addEventListener('click', () => this.toggleMuteAll());
        el.mvSyncStartBtn.addEventListener('click', () => this.syncStart());
        el.mvClearAllBtn.addEventListener('click', () => this.confirmClearAll());
        if (PekoUtils.hasFolderPicker()) {
          el.mvFolderBtn.hidden = false;
          el.mvFolderBtn.addEventListener('click', () => this.openFolder());
        }
        el.mvSleepBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSleepMenu();
        });
        el.mvSleepMenu.addEventListener('click', (e) => e.stopPropagation());
        el.mvSleepMenu.querySelectorAll('[data-sleep]').forEach((b) =>
          b.addEventListener('click', () => {
            this.setSleepMode(b.getAttribute('data-sleep') || 'off');
            this.closeSleepMenu();
          }),
        );
        el.mvEqBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleEqMenu();
        });
        el.mvEqMenu.addEventListener('click', (e) => e.stopPropagation());
        el.mvEqBass.addEventListener('input', (e) => this.setEqBass(Number(e.target.value)));
        el.mvEqMid.addEventListener('input', (e) => this.setEqMid(Number(e.target.value)));
        el.mvEqTreble.addEventListener('input', (e) => this.setEqTreble(Number(e.target.value)));
        el.mvEqPreset.addEventListener('change', (e) => this.setEqPreset(e.target.value));
        el.mvEqResetBtn.addEventListener('click', () => this.resetEq());
        document.addEventListener('click', (e) => {
          const t = e.target;
          if (t.closest('#mvSleepBtn') || t.closest('#mvEqBtn')) return;
          if (t.closest('#mvSleepMenu') || t.closest('#mvEqMenu')) return;
          this.closeSleepMenu();
          this.closeEqMenu();
        });
        el.mvView
          .querySelectorAll('.mv-seg')
          .forEach((b) =>
            b.addEventListener('click', () => this.setLayoutMode(b.getAttribute('data-layout') || 'grid')),
          );
        el.mvColsMinus.addEventListener('click', () => this.setCols(this.cols - 1));
        el.mvColsPlus.addEventListener('click', () => this.setCols(this.cols + 1));
        window.addEventListener(
          'resize',
          PekoUtils.debounce(() => this.renderLayout(), 150),
          { passive: true },
        );
        window.addEventListener(
          'orientationchange',
          PekoUtils.debounce(() => this.renderLayout(), 200),
          { passive: true },
        );
        window.addEventListener('beforeunload', () => this.flushAllProgress());
        document.addEventListener('fullscreenchange', () => {
          this.tiles.forEach((t) => {
            const a = document.fullscreenElement === t.wrapper;
            const b = t.wrapper.querySelector(PekoSelectors.tile.fullscreen);
            if (b) b.innerHTML = a ? MV_ICON_COMPRESS : MV_ICON_EXPAND;
            // Start the idle timer when a tile enters fullscreen, and bring the controls back when it leaves.
            if (a || t._wasFullscreen) this.showTileChrome(t);
            t._wasFullscreen = a;
          });
          const w = document.fullscreenElement === el.mvView;
          if (el.mvFullscreenBtn) {
            el.mvFullscreenBtn.innerHTML = w ? ICON_FS_EXIT : ICON_FS_ENTER;
            el.mvFullscreenBtn.setAttribute('aria-label', w ? 'Exit fullscreen' : 'Fullscreen');
            el.mvFullscreenBtn.setAttribute('data-tip', w ? 'Exit fullscreen' : 'Fullscreen');
          }
        });
        el.mvHideBarBtn?.addEventListener('click', () => {
          if (!this.tiles.length) return;
          el.mvView.classList.add('mv-bar-hidden');
          requestAnimationFrame(() => this.renderLayout());
        });
        el.mvBarTab?.addEventListener('click', () => {
          el.mvView.classList.remove('mv-bar-hidden');
          el.mvBarTab.classList.remove('visible');
          requestAnimationFrame(() => this.renderLayout());
        });
        // While the toolbar is hidden, the down arrow appears when the pointer nears the top edge.
        // Touch screens have no hover, so the stylesheet keeps the arrow visible there.
        el.mvView.addEventListener(
          'mousemove',
          (e) => {
            if (el.mvView.classList.contains('mv-bar-hidden'))
              el.mvBarTab?.classList.toggle('visible', e.clientY <= 48);
          },
          { passive: true },
        );
        el.mvView.addEventListener('mouseleave', () => el.mvBarTab?.classList.remove('visible'));
        el.mvFullscreenBtn?.addEventListener('click', () => {
          if (document.fullscreenElement === el.mvView) document.exitFullscreen?.();
          else el.mvView.requestFullscreen?.().catch(() => {});
        });
      },

      open() {
        if (document.fullscreenElement && document.fullscreenElement.id !== 'mvView')
          document.exitFullscreen?.().catch(() => {});
        this.el.mvView.hidden = false;
        this.isOpen = true;
        this.startTicker();
        this.saveMvSettings();
        window.pekoPlayer?.el.video?.pause();
        this.renderLayout();
        this.updatePlayPauseAllBtn();
        this.updateSegDividerVisibility();
      },

      close() {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        this.flushAllProgress();
        this.el.mvView.hidden = true;
        this.isOpen = false;
        this.stopTicker();
        this.saveMvSettings();
        this.forEachTile((t) => this.pauseTile(t));
      },

      closeAnyOpenPopover() {
        if (!this.el.mvSleepMenu.hidden) {
          this.closeSleepMenu();
          return true;
        }
        if (!this.el.mvEqMenu.hidden) {
          this.closeEqMenu();
          return true;
        }
        return false;
      },

      /** Keyboard shortcuts while multi-view is open; they act on the active tile. */
      handleKeyDown(e) {
        const tile = this.getActiveTile();
        switch (e.key) {
          case ' ':
            e.preventDefault();
            if (tile) this.togglePlayTile(tile);
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (tile) this.seekTile(tile, this.getTileCurrentTime(tile) + 10);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            if (tile) this.seekTile(tile, this.getTileCurrentTime(tile) - 10);
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (tile) this.setTileVolume(tile, Math.round((tile.volume ?? 1) * 100) + 5);
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (tile) this.setTileVolume(tile, Math.round((tile.volume ?? 1) * 100) - 5);
            break;
          case 'm':
          case 'M':
            if (tile) this.toggleMuteTile(tile);
            break;
          case 'l':
          case 'L':
            if (tile) this.toggleTileLoop(tile);
            break;
          case 'f':
          case 'F':
            if (tile) this.toggleTileFullscreen(tile);
            break;
          case 'p':
          case 'P':
            if (tile) this.toggleTilePip(tile);
            break;
          case 'a':
          case 'A':
            if (tile) this.toggleTileAbLoop(tile);
            break;
          case '[':
            if (tile) this.moveTileBy(tile, -1);
            break;
          case ']':
            if (tile) this.moveTileBy(tile, 1);
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            if (tile) this.seekTileToPercent(tile, Number(e.key) * 10);
            break;
          default:
            return;
        }
      },

      addLocalFiles(fileList) {
        const files = Array.from(fileList).filter(
          (f) => window.pekoPlayer?.isPlayableVideoFile(f) ?? f.type.startsWith('video/'),
        );
        files.forEach((f) =>
          this.createTile({
            type: 'local',
            name: f.name,
            file: f,
          }),
        );
        this.el.mvFileInput.value = '';
      },

      addYouTubeFromInput() {
        const raw = this.el.mvYtInput.value.trim();
        if (!raw) return;
        const id = this.parseYouTubeId(raw);
        if (!id) {
          window.pekoPlayer?.announce("Couldn't find a YouTube ID");
          return;
        }
        const aspect = /youtube\.com\/shorts\//.test(raw) ? 9 / 16 : 16 / 9;
        this.createTile({
          type: 'youtube',
          name: `YouTube · ${id}`,
          videoId: id,
          aspect,
        });
        this.el.mvYtInput.value = '';
      },

      parseYouTubeId(url) {
        const c = url.trim().replace(/^<|>$/g, '');
        const pats = [
          /youtube\.com\/watch\?[^#]*v=([a-zA-Z0-9_-]{6,})/,
          /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
          /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
          /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
          /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/,
        ];
        for (const p of pats) {
          const m = c.match(p);
          if (m) return m[1];
        }
        if (/^[a-zA-Z0-9_-]{10,12}$/.test(c)) return c;
        return null;
      },
    };
  })(),
);
