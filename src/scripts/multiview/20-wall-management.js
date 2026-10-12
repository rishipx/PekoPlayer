// Multi-view: Mute all, clear all and tile removal
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      toggleMuteAll() {
        this.allMuted = !this.allMuted;
        this.syncMuteAllBtn();
        this.tiles.forEach((t) => {
          if (t.player && t.ytReady) {
            try {
              this.allMuted ? t.player.mute() : t.player.unMute();
            } catch {
              return;
            }
          } else if (t.type === 'local' && t.video) t.video.muted = this.allMuted;
          else return;
          t.muted = this.allMuted;
          this.updateTileVolUI(t);
          this.persistTileField(t.id, { muted: t.muted });
        });
        this.saveMvSettings();
      },

      confirmClearAll() {
        if (!this.tiles.length) return;
        if (confirm(`Remove all ${this.tiles.length} tile${this.tiles.length > 1 ? 's' : ''}?`)) this.clearAll();
      },

      clearAll() {
        this._clearingAll = true;
        try {
          [...this.tiles].forEach((t) => this.removeTile(t.id));
        } finally {
          this._clearingAll = false;
        }
      },

      /** Removes a tile and releases everything it holds: timers, observers, media, object URLs, audio nodes and the pop-out window. */
      removeTile(id) {
        const i = this.tiles.findIndex((t) => t.id === id);
        if (i === -1) return;
        const tile = this.tiles[i];
        clearTimeout(tile._chromeHideTimer);
        tile._ro?.disconnect();
        if (tile._resizeRAF) cancelAnimationFrame(tile._resizeRAF);
        if (tile._dragRAF) cancelAnimationFrame(tile._dragRAF);
        if (tile._popupWin && !tile._popupWin.closed) {
          try {
            tile._popupWin.close();
          } catch {
            // The pop-out window is already closed.
          }
        }
        if (tile.video) {
          try {
            tile.video.pause();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          try {
            tile.video.removeAttribute('src');
            tile.video.load();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
        }
        if (tile._objectUrl) {
          try {
            URL.revokeObjectURL(tile._objectUrl);
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          tile._objectUrl = null;
        }
        if (tile.player) {
          try {
            tile.player.stopVideo?.();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          try {
            tile.player.destroy?.();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          tile.player = null;
        }
        tile.ytReady = false;
        if (tile._audioCtx) {
          try {
            tile._audioCtx.close();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          tile._audioCtx = null;
        }
        tile.wrapper.remove();
        this.tiles.splice(i, 1);
        this.persistRemoveTile(id);
        // Close the gap in the saved order, so a tile added later never shares a position with an older one.
        if (!this._clearingAll) this.persistOrder();
        if (this.activeTileId === id) {
          this.activeTileId = null;
          if (this.tiles.length) this.setActiveTile(this.tiles[this.tiles.length - 1]);
        }
        this.renderLayout();
        this.updatePlayPauseAllBtn();
      },
    };
  })(),
);
