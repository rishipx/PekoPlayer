// Multi-view: Synchronised start, duration, seeking, A-B loop and zoom
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      forEachTile(fn) {
        this.tiles.forEach(fn);
      },

      syncStart() {
        if (!this.tiles.length) return;
        this.tiles.forEach((t) => this.seekTile(t, 0));
        this.tiles.forEach((t) => this.playTile(t));
        this.updatePlayPauseAllBtn();
      },

      getTileDuration(tile) {
        if (tile.player && tile.ytReady) {
          try {
            return tile.player.getDuration() || 0;
          } catch {
            return 0;
          }
        }
        if (tile.type === 'local' && tile.video) return tile.video.duration || 0;
        return 0;
      },

      getTileCurrentTime(tile) {
        if (tile.player && tile.ytReady) {
          try {
            return tile.player.getCurrentTime() || 0;
          } catch {
            return 0;
          }
        }
        if (tile.type === 'local' && tile.video) return tile.video.currentTime || 0;
        return 0;
      },

      seekTile(tile, t) {
        const d = this.getTileDuration(tile);
        const c = this.clamp(t, 0, d || Math.max(t, 0));
        if (tile.player && tile.ytReady) {
          try {
            tile.player.seekTo(c, true);
          } catch {
            // The player is not ready, or was already removed.
          }
        } else if (tile.type === 'local' && tile.video) tile.video.currentTime = c;
        else return;
        tile._lastSavedAt = Date.now();
        this.persistTileField(tile.id, { currentTime: c });
      },

      seekTileToPercent(tile, p) {
        const d = this.getTileDuration(tile);
        if (!d) return;
        this.seekTile(tile, (p / 100) * d);
      },

      toggleTileAbLoop(tile) {
        const b = tile.wrapper.querySelector(PekoSelectors.tile.abloop);
        const c = this.getTileCurrentTime(tile);
        const d = this.getTileDuration(tile);
        if (!d) return;
        if (tile.loopA == null) {
          tile.loopA = c;
          b?.classList.add('is-active');
        } else if (tile.loopB == null) {
          if (c <= tile.loopA) return;
          tile.loopB = c;
        } else {
          tile.loopA = null;
          tile.loopB = null;
          b?.classList.remove('is-active');
        }
      },

      handleTileZoomWheel(e, tile) {
        if (tile.type !== 'local' || !tile.video?.videoWidth) return;
        e.preventDefault();
        e.stopPropagation();
        const d = e.deltaY < 0 ? 0.15 : -0.15;
        tile.zoom = Math.min(4, Math.max(1, Math.round((tile.zoom + d) * 100) / 100));
        tile.video.style.transform = tile.zoom > 1 ? `scale(${tile.zoom})` : '';
      },
    };
  })(),
);
