// Multi-view: Settings, UI synchronisation and tile persistence
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      async initDB() {
        try {
          this.db = await PekoDB.open();
          await this.restoreFromDB();
        } catch {
          // IndexedDB is unavailable (private mode or blocked): continue without saved files.
        }
      },

      loadMvSettings() {
        try {
          const s = JSON.parse(localStorage.getItem(PekoConfig.STORAGE.multiViewSettings) || '{}');
          if (['grid', 'split', 'canvas'].includes(s.layoutMode)) this.layoutMode = s.layoutMode;
          if (typeof s.cols === 'number') this.cols = Math.max(1, Math.min(4, Math.round(s.cols)));
          if (PekoLayout.isValidShares(s.colFr, s.colFr?.length ?? 0)) this.colFr = s.colFr;
          if (PekoLayout.isValidShares(s.rowFr, s.rowFr?.length ?? 0)) this.rowFr = s.rowFr;
          if (s.gridSizes && typeof s.gridSizes.sig === 'string') this.gridSizes = s.gridSizes;
          if (typeof s.allMuted === 'boolean') this.allMuted = s.allMuted;
          if (typeof s.isOpen === 'boolean') this.isOpen = s.isOpen;
          if (s.eq && typeof s.eq.bass === 'number')
            this.eq = {
              bass: s.eq.bass,
              mid: s.eq.mid ?? 0,
              treble: s.eq.treble ?? 0,
            };
        } catch {
          // Missing or corrupt saved data: keep the defaults.
        }
        this.syncEqUI();
      },

      saveMvSettings() {
        try {
          localStorage.setItem(
            PekoConfig.STORAGE.multiViewSettings,
            JSON.stringify({
              layoutMode: this.layoutMode,
              cols: this.cols,
              colFr: this.colFr,
              rowFr: this.rowFr,
              gridSizes: this.gridSizes,
              allMuted: this.allMuted,
              isOpen: this.isOpen,
              eq: this.eq,
            }),
          );
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      buildMvEqPresetOptions() {
        const s = this.el.mvEqPreset;
        if (!s) return;
        s.innerHTML = '';
        PekoEq.PRESETS.forEach((p) => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name;
          s.appendChild(o);
        });
      },

      applyMvUiFromState() {
        const { mvView, mvColsValue } = this.el;
        mvView
          .querySelectorAll('.mv-seg')
          .forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-layout') === this.layoutMode)));
        mvColsValue.textContent = String(this.cols);
        this.syncMuteAllBtn();
        this.updatePlayPauseAllBtn();
        const look = window.pekoPlayer?.controlLook || 'frost';
        mvView.dataset.look = look;
        this.el.mvToolbar.dataset.look = look;
        document.querySelectorAll('.mv-popover-menu').forEach((m) => (m.dataset.look = look));
        this.updateSegDividerVisibility();
      },

      updateSegDividerVisibility() {
        const divider = document.getElementById('mvSegDivider'),
          stepper = document.getElementById('mvColsStepper');
        const isCanvas = this.layoutMode === 'canvas';
        if (divider) divider.style.display = isCanvas ? 'none' : '';
        if (stepper) stepper.style.display = isCanvas ? 'none' : '';
      },

      syncMuteAllBtn() {
        const btn = this.el.mvMuteAllBtn;
        if (!btn) return;
        btn.innerHTML = this.allMuted ? MV_TOOLBAR_MUTE : MV_TOOLBAR_VOL;
        btn.setAttribute('aria-pressed', String(this.allMuted));
        btn.setAttribute('aria-label', this.allMuted ? 'Unmute all' : 'Mute all');
        btn.setAttribute('data-tip', this.allMuted ? 'Unmute all' : 'Mute all');
      },

      /** Recreates the tiles saved in IndexedDB (local files and YouTube links) with their stored order, position and size. */
      async restoreFromDB() {
        if (!this.db) return;
        const records = await PekoDB.getAll(this.db, PekoDB.MV_STORE);
        if (!records.length) return;
        // Saved order first; older records have none and fall back to their stacking order.
        records.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.z || 0) - (b.z || 0));
        records.forEach((rec) =>
          this.createTile(
            {
              type: rec.type,
              name: rec.name,
              file: rec.blob,
              videoId: rec.videoId,
            },
            {
              id: rec.id,
              x: rec.x,
              y: rec.y,
              w: rec.w,
              h: rec.h,
              z: rec.z,
              aspect: rec.aspect,
              volume: rec.volume,
              muted: rec.muted,
              rate: rec.rate,
              loop: rec.loop,
              currentTime: rec.currentTime,
              _silent: true,
            },
          ),
        );
        this.renderLayout();
      },

      /** Saves a tile's source and layout so it can be restored on the next visit. */
      async persistTile(tile) {
        if (!this.db) return;
        const rec = {
          id: tile.id,
          type: tile.type,
          name: tile.name,
          x: tile.x,
          y: tile.y,
          w: tile.w,
          h: tile.h,
          z: tile.z,
          order: this.tiles.indexOf(tile),
          aspect: tile.aspect,
          volume: tile.volume,
          muted: tile.muted,
          rate: tile.rate,
          loop: tile.loop,
          currentTime: tile.currentTime,
          addedAt: Date.now(),
        };
        if (tile.type === 'local') {
          rec.blob = tile._file;
          rec.size = tile._file?.size;
        } else rec.videoId = tile.videoId;
        PekoDB.guardWrite(PekoDB.put(this.db, rec, PekoDB.MV_STORE), (msg) => window.pekoPlayer?.announce(msg)).catch(
          () => {},
        );
      },

      async persistTileField(id, fields) {
        if (!this.db) return;
        PekoDB.guardWrite(PekoDB.updateRecord(this.db, id, fields, PekoDB.MV_STORE), (msg) =>
          window.pekoPlayer?.announce(msg),
        ).catch(() => {});
      },

      /** Saves the tiles' current order, which is the order of the grid and split layouts. */
      persistOrder() {
        this.tiles.forEach((tile, order) => this.persistTileField(tile.id, { order }));
      },

      async persistRemoveTile(id) {
        if (!this.db) return;
        PekoDB.remove(this.db, id, PekoDB.MV_STORE).catch(() => {});
      },

      flushAllProgress() {
        if (!this.db) return;
        this.tiles.forEach((t) => {
          const c = this.getTileCurrentTime(t);
          if (c) PekoDB.updateRecord(this.db, t.id, { currentTime: c }, PekoDB.MV_STORE).catch(() => {});
        });
      },
    };
  })(),
);
