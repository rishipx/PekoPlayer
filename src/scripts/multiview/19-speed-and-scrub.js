// Multi-view: Folder open, playback rate, scrubbing and the progress tick
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Adds a tile for every video in a folder. The desktop app shows its own dialog and hands the files over itself. */
      async openFolder() {
        if (window.pekoDesktop) {
          const result = await window.pekoDesktop.openFolder('multiview').catch(() => null);
          if (!result) window.pekoPlayer?.announce('Could not open that folder');
          else if (!result.canceled && result.count === 0)
            window.pekoPlayer?.announce('No videos found in that folder');
          return;
        }
        try {
          const d = await window.showDirectoryPicker();
          const files = [];
          await PekoUtils.collectFilesFromDirectoryHandle(d, files);
          const playable = files.filter(
            (f) => window.pekoPlayer?.isPlayableVideoFile(f) ?? f.type.startsWith('video/'),
          );
          playable.forEach((f) =>
            this.createTile({
              type: 'local',
              name: f.name,
              file: f,
            }),
          );
        } catch {
          // The folder picker was cancelled or is unsupported.
        }
      },

      /** Runs the progress tick while the wall is open. A closed wall needs no timer, so the page stays idle. */
      startTicker() {
        if (this._tickerTimer) return;
        this._tickerTimer = setInterval(() => this.tick(), PekoConfig.TIMING.wallTickMs);
      },

      stopTicker() {
        clearInterval(this._tickerTimer);
        this._tickerTimer = null;
      },

      setTileRate(tile, r) {
        if (tile.player && tile.ytReady) {
          try {
            tile.player.setPlaybackRate(r);
          } catch {
            // The player is not ready, or was already removed.
          }
        } else if (tile.type === 'local' && tile.video) tile.video.playbackRate = r;
      },

      updateTileSpeedUI(tile) {
        const b = tile.wrapper.querySelector(PekoSelectors.tile.speed);
        if (b) b.textContent = `${tile.rate}x`;
      },

      cycleTileSpeed(tile) {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const i = speeds.indexOf(tile.rate);
        tile.rate = speeds[((i > -1 ? i : 2) + 1) % speeds.length];
        this.setTileRate(tile, tile.rate);
        this.updateTileSpeedUI(tile);
        this.persistTileField(tile.id, { rate: tile.rate });
      },

      /** Starts dragging a tile's timeline and seeks while the pointer moves. */
      startTileScrub(e, tile) {
        const d = this.getTileDuration(tile);
        if (!d) return;
        e.preventDefault();
        tile._scrubbing = true;
        this.showTileChrome(tile, true);
        const scrub = tile.wrapper.querySelector(PekoSelectors.tile.scrub);
        const rf = (ev) => {
          const r = scrub.getBoundingClientRect();
          const x = ('touches' in ev && ev.touches.length ? ev.touches[0].clientX : ev.clientX) - r.left;
          return this.clamp(x / r.width, 0, 1);
        };
        const sv = (r) => this.setTileScrubVisual(tile, r);
        sv(rf(e));
        const mv = (ev) => {
          if (ev.cancelable) ev.preventDefault();
          sv(rf(ev));
        };
        const up = (ev) => {
          tile._scrubbing = false;
          const ee = 'changedTouches' in ev && ev.changedTouches.length ? { touches: ev.changedTouches } : ev;
          this.seekTile(tile, rf(ee) * this.getTileDuration(tile));
          this.scheduleHideTileChrome(tile, PekoConfig.TIMING.tileControlsHideMs);
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', up);
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      },

      setTileScrubVisual(tile, r) {
        const f = tile.wrapper.querySelector(PekoSelectors.tile.scrubFill);
        const h = tile.wrapper.querySelector(PekoSelectors.tile.scrubHandle);
        const s = tile.wrapper.querySelector(PekoSelectors.tile.scrub);
        if (f) f.style.width = `${r * 100}%`;
        if (h) h.style.left = `${r * 100}%`;
        if (s) s.setAttribute('aria-valuenow', String(Math.round(r * 100)));
      },

      /** Periodic update of every tile: progress display and A/B loop enforcement. */
      tick() {
        const now = Date.now();
        this.tiles.forEach((tile) => {
          if (tile._resizing || tile._dragging || tile._scrubbing) return;
          const d = this.getTileDuration(tile);
          if (!d) return;
          let c = this.getTileCurrentTime(tile);
          if (tile.loopA != null && tile.loopB != null && c >= tile.loopB) {
            this.seekTile(tile, tile.loopA);
            c = tile.loopA;
          }
          const r = this.clamp(c / d, 0, 1);
          this.setTileScrubVisual(tile, r);
          const t = tile.wrapper.querySelector(PekoSelectors.tile.time);
          if (t) {
            const isSmall = tile.wrapper.clientWidth > 0 && tile.wrapper.clientWidth < 460;
            if (isSmall) t.textContent = PekoUtils.formatTime(c);
            else
              t.innerHTML = `${PekoUtils.formatTime(c)}<span class="mv-tile-time-sep">/</span>${PekoUtils.formatTime(d)}`;
          }
          if (now - tile._lastSavedAt > 5000) {
            tile._lastSavedAt = now;
            this.persistTileField(tile.id, { currentTime: c });
          }
        });
      },
    };
  })(),
);
