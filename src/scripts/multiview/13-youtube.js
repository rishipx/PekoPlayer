// Multi-view: YouTube iframe API, tile lifecycle and remote-control blocking
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Loads the YouTube IFrame API once, on demand, and shares one promise between tiles. Resolves with `YT`, or null when the script is blocked or takes longer than 8 seconds. */
      loadYouTubeIframeAPI() {
        if (window.__pekoYtApiPromise) return window.__pekoYtApiPromise;
        window.__pekoYtApiPromise = new Promise((resolve) => {
          let settled = false;
          const settle = (v) => {
            if (!settled) {
              settled = true;
              resolve(v);
            }
          };
          const ready = () => {
            if (window.YT && window.YT.Player) {
              settle(window.YT);
              return true;
            }
            return false;
          };
          if (ready()) return;
          const timeout = setTimeout(() => settle(null), 8000);
          window.onYouTubeIframeAPIReady = () => {
            clearTimeout(timeout);
            if (!ready())
              setTimeout(() => {
                if (!ready()) settle(null);
              }, 100);
          };
          if (!document.querySelector('script[data-peko-yt-api]')) {
            const t = document.createElement('script');
            t.src = 'https://www.youtube.com/iframe_api';
            t.setAttribute('data-peko-yt-api', 'true');
            t.onerror = () => {
              clearTimeout(timeout);
              settle(null);
            };
            document.head.appendChild(t);
          }
        });
        return window.__pekoYtApiPromise;
      },

      /** Creates the YouTube player for a tile once the API is ready. Falls back to a plain embed on file:// pages and when the API cannot load. */
      queueYouTubeTile(tile, videoId, holder) {
        if (!holder) return;
        if (location.protocol === 'file:') {
          this.renderBareYouTubeIframe(tile, videoId, holder);
          return;
        }
        this.loadYouTubeIframeAPI().then((YT) => {
          if (!holder.isConnected) return;
          if (!YT || !YT.Player) {
            if (YT === null) this.renderBareYouTubeIframe(tile, videoId, holder);
            return;
          }
          try {
            tile.body.classList.add('mv-tile-body-yt');
            tile.player = new YT.Player(holder, {
              videoId,
              host: 'https://www.youtube-nocookie.com',
              playerVars: {
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                controls: 0,
                iv_load_policy: 3,
                fs: 0,
                disablekb: 1,
                origin: location.origin,
              },
              events: {
                onReady: () => this.onYouTubeTileReady(tile),
                onStateChange: (ev) => this.onYouTubeTileStateChange(tile, ev),
                onError: (ev) => this.onYouTubeTileError(tile, videoId, ev),
              },
            });
          } catch {
            this.renderBareYouTubeIframe(tile, videoId, holder);
          }
        });
      },

      /** Maps YouTube player error codes to messages and marks unrecoverable failures on the tile. */
      onYouTubeTileError(tile, videoId, ev) {
        const code = ev?.data;
        const permanent = code === 100 || code === 101 || code === 150;
        const msgs = {
          2: 'Invalid YouTube video ID.',
          5: "Can't play in HTML5.",
          100: 'Video removed or private.',
          101: 'Owner disabled embedding.',
          150: 'Owner disabled embedding.',
        };
        const msg = msgs[code] || "This video couldn't be played.";
        if (permanent) {
          const body = tile.body;
          body.innerHTML = '';
          const err = document.createElement('div');
          err.className = 'mv-tile-yt-error';
          err.innerHTML = `<strong>Can't play this video</strong><span>${msg}</span>`;
          body.appendChild(err);
          tile.player = null;
          tile.ytReady = false;
          return;
        }
        const body = tile.body;
        const iframe = body.querySelector('iframe');
        if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
        const fresh = document.createElement('div');
        fresh.className = 'mv-tile-yt-holder';
        body.appendChild(fresh);
        tile.player = null;
        tile.ytReady = false;
        this.renderBareYouTubeIframe(tile, videoId, fresh);
      },

      onYouTubeTileReady(tile) {
        tile.ytReady = true;
        const h = tile.body.querySelector(PekoSelectors.tile.ytHolder);
        if (h) h.classList.add('has-player');
        Promise.resolve().then(() => {
          if (!tile.player) return;
          try {
            tile.player.setVolume(Math.round((tile.volume ?? 1) * 100));
            if (tile.muted) tile.player.mute();
            tile.player.setPlaybackRate(tile.rate || 1);
            if (tile.currentTime) tile.player.seekTo(tile.currentTime, true);
          } catch {
            // The player is not ready, or was already removed.
          }
          this.updateTileVolUI(tile);
          this.updateTileSpeedUI(tile);
          this.updatePlayPauseAllBtn();
        });
      },

      /** Keeps the tile's play icon and controls in sync with the YouTube player state, and restarts looping tiles. */
      onYouTubeTileStateChange(tile, ev) {
        const E = 0,
          P = 1,
          PU = 2;
        if (ev.data === P) {
          this.setTilePlayIcon(tile, true);
          this.scheduleHideTileChrome(tile, PekoConfig.TIMING.tileControlsHideMs);
        } else if (ev.data === PU) {
          this.setTilePlayIcon(tile, false);
          this.showTileChrome(tile);
        } else if (ev.data === E) {
          if (tile.loop && tile.player) {
            try {
              tile.player.seekTo(0, true);
              tile.player.playVideo();
            } catch {
              // The player is not ready, or was already removed.
            }
          } else {
            this.setTilePlayIcon(tile, false);
            this.showTileChrome(tile, true);
          }
        }
        this.updatePlayPauseAllBtn();
      },

      renderBareYouTubeIframe(tile, videoId, holder) {
        if (!holder) return;
        tile.body.classList.remove('mv-tile-body-yt');
        holder.innerHTML = '';
        holder.classList.add('has-player');
        const origin = location.protocol === 'file:' ? '' : `&origin=${encodeURIComponent(location.origin)}`;
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&fs=0${origin}`;
        iframe.title = tile.name;
        iframe.allow =
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.setAttribute('allowfullscreen', '');
        iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
        holder.appendChild(iframe);
        tile.player = null;
        tile.ytReady = false;
        this.disableRemoteControls(tile);
      },

      /** Disables the tile buttons that cannot drive a plain YouTube iframe, which has no player API. */
      disableRemoteControls(tile) {
        [
          PekoSelectors.tile.play,
          PekoSelectors.tile.mute,
          PekoSelectors.tile.rewind,
          PekoSelectors.tile.forward,
          PekoSelectors.tile.speed,
          PekoSelectors.tile.loop,
          PekoSelectors.tile.abloop,
        ].forEach((s) => {
          const b = tile.wrapper.querySelector(s);
          if (b) b.setAttribute('disabled', 'true');
        });
        const scr = tile.wrapper.querySelector(PekoSelectors.tile.scrub);
        if (scr) {
          scr.setAttribute('tabindex', '-1');
          scr.classList.add('is-disabled');
        }
        const v = tile.wrapper.querySelector(PekoSelectors.tile.volslider);
        if (v) v.setAttribute('disabled', 'true');
      },
    };
  })(),
);
