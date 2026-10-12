// Multi-view: Per-tile and wall playback, volume, loop, fullscreen and Picture-in-Picture
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      togglePlayPauseAll() {
        if (!this.tiles.length) return;
        const anyPaused = this.tiles.some((t) => {
          if (t.player && t.ytReady) {
            try {
              return t.player.getPlayerState() !== 1;
            } catch {
              return true;
            }
          }
          if (t.type === 'local' && t.video) return t.video.paused;
          return false;
        });
        if (anyPaused) this.tiles.forEach((t) => this.playTile(t));
        else this.tiles.forEach((t) => this.pauseTile(t));
        this.updatePlayPauseAllBtn();
      },

      togglePlayTile(tile) {
        if (tile.player && tile.ytReady) {
          try {
            const s = tile.player.getPlayerState();
            if (s === 1) this.pauseTile(tile);
            else this.playTile(tile);
          } catch {
            // The player is not ready, or was already removed.
          }
          return;
        }
        if (tile.type === 'local' && tile.video) tile.video.paused ? this.playTile(tile) : this.pauseTile(tile);
      },

      playTile(tile) {
        if (tile.player && tile.ytReady) {
          try {
            tile.player.playVideo();
          } catch {
            // The player is not ready, or was already removed.
          }
          return;
        }
        if (tile.type === 'local' && tile.video) tile.video.play().catch(() => {});
      },

      pauseTile(tile) {
        if (tile.player && tile.ytReady) {
          try {
            tile.player.pauseVideo();
          } catch {
            // The player is not ready, or was already removed.
          }
          return;
        }
        if (tile.type === 'local' && tile.video) tile.video.pause();
      },

      /** Mutes or unmutes a tile, whether it is a YouTube player or a local video. */
      toggleMuteTile(tile) {
        if (tile.player && tile.ytReady) {
          try {
            if (tile.player.isMuted()) {
              tile.player.unMute();
              tile.muted = false;
            } else {
              tile.player.mute();
              tile.muted = true;
            }
          } catch {
            // The player is not ready, or was already removed.
          }
          this.updateTileVolUI(tile);
          this.persistTileField(tile.id, { muted: tile.muted });
          return;
        }
        if (tile.type === 'local' && tile.video) {
          tile.video.muted = !tile.video.muted;
          tile.muted = tile.video.muted;
        } else return;
        this.updateTileVolUI(tile);
        this.persistTileField(tile.id, { muted: tile.muted });
      },

      setTileVolume(tile, level) {
        const p = this.clamp(level, 0, 100);
        tile.volume = p / 100;
        if (tile.player && tile.ytReady) {
          try {
            tile.player.setVolume(p);
            if (p > 0 && tile.muted) {
              tile.player.unMute();
              tile.muted = false;
            }
          } catch {
            // The player is not ready, or was already removed.
          }
        } else if (tile.type === 'local' && tile.video) {
          tile.video.volume = tile.volume;
          if (p > 0 && tile.muted) {
            tile.video.muted = false;
            tile.muted = false;
          }
        }
        this.updateTileVolUI(tile);
        this.persistTileField(tile.id, { volume: tile.volume, muted: tile.muted });
      },

      updateTileVolUI(tile) {
        const m = tile.wrapper.querySelector(PekoSelectors.tile.mute);
        const s = tile.wrapper.querySelector(PekoSelectors.tile.volslider);
        const effective = tile.muted ? 0 : (tile.volume ?? 1);
        const pct = Math.round(effective * 100);
        if (s) {
          s.value = String(pct);
          s.style.setProperty('--vol-pct', `${pct}%`);
        }
        if (m) {
          m.classList.toggle('is-active', !!tile.muted);
          m.innerHTML = tile.muted ? MV_ICON_MUTE : MV_ICON_VOL;
        }
      },

      toggleTileLoop(tile) {
        tile.loop = !tile.loop;
        const b = tile.wrapper.querySelector(PekoSelectors.tile.loop);
        if (b) {
          b.classList.toggle('is-active', tile.loop);
          b.setAttribute('aria-pressed', String(tile.loop));
        }
        if (tile.player && tile.ytReady) {
          try {
            if (tile.loop) tile.player.setLoop(true);
            else tile.player.setLoop(false);
          } catch {
            // The player is not ready, or was already removed.
          }
        } else if (tile.type === 'local' && tile.video) tile.video.loop = tile.loop;
        this.persistTileField(tile.id, { loop: tile.loop });
      },

      toggleTileFullscreen(tile) {
        if (document.fullscreenElement === tile.wrapper) document.exitFullscreen?.();
        else tile.wrapper.requestFullscreen?.().catch(() => {});
      },

      toggleTilePip(tile) {
        if (tile.type === 'local') this.toggleLocalPip(tile);
        else this.toggleYTPopout(tile);
      },

      async toggleLocalPip(tile) {
        if (!tile.video) return;
        try {
          if (document.pictureInPictureElement === tile.video) await document.exitPictureInPicture();
          else await tile.video.requestPictureInPicture();
        } catch {
          // Picture-in-picture is unsupported, or the browser refused it for this video.
        }
      },

      /** Moves a YouTube tile into a floating Document Picture-in-Picture window, or back into the wall. */
      async toggleYTPopout(tile) {
        if (!('documentPictureInPicture' in window)) return;
        if (tile._popupWin && !tile._popupWin.closed) {
          tile._popupWin.close();
          return;
        }
        try {
          const win = await window.documentPictureInPicture.requestWindow({
            width: Math.max(240, Math.round(tile.wrapper.clientWidth)) || 480,
            height: Math.max(135, Math.round(tile.wrapper.clientHeight)) || 270,
          });
          tile._popupWin = win;
          win.document.title = tile.name;
          const style = win.document.createElement('style');
          style.textContent =
            'html,body{margin:0;height:100%;background:#000;overflow:hidden;}iframe,video{width:100%;height:100%;border:0;display:block;}';
          win.document.head.appendChild(style);
          tile._popupChildren = Array.from(tile.body.childNodes);
          tile._popupChildren.forEach((n) => win.document.body.appendChild(n));
          const ph = document.createElement('div');
          ph.className = 'mv-tile-popout-placeholder';
          ph.textContent = 'Playing in a floating window';
          tile.body.appendChild(ph);
          tile._popupPlaceholder = ph;
          win.addEventListener('pagehide', () => this.restoreTileFromPopup(tile), { once: true });
        } catch {
          // Document picture-in-picture is unsupported or was refused: the tile stays in the wall.
        }
      },

      restoreTileFromPopup(tile) {
        if (tile._popupPlaceholder) {
          tile._popupPlaceholder.remove();
          tile._popupPlaceholder = null;
        }
        (tile._popupChildren || []).forEach((n) => tile.body.appendChild(n));
        tile._popupChildren = null;
        tile._popupWin = null;
      },
    };
  })(),
);
