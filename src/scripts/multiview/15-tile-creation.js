// Multi-view: Tile creation, controls and chrome visibility
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Builds a tile (local video or YouTube) with its controls, drag and resize handles and state, and adds it to the wall. Also used to restore saved tiles. */
      createTile(data, restoreOpts) {
        const silent = !!restoreOpts?._silent;
        const id = restoreOpts?.id || `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'mv-tile';
        wrapper.dataset.id = id;
        const handles = [
          ['n', 'edge'],
          ['s', 'edge'],
          ['e', 'edge'],
          ['w', 'edge'],
          ['ne', 'corner'],
          ['nw', 'corner'],
          ['se', 'corner'],
          ['sw', 'corner'],
        ]
          .map(
            ([d, k]) =>
              `<div class="mv-resize-handle ${k}" data-dir="${d}" aria-hidden="true">${k === 'corner' ? MV_ICON_RESIZE : ''}</div>`,
          )
          .join('');
        const isYT = data.type === 'youtube';
        const pipBtn = `<button class="mv-tile-pip" aria-label="${isYT ? 'Pop out' : 'Picture in picture'}">${MV_ICON_PIP}</button>`;
        wrapper.innerHTML = `
      <div class="mv-tile-header">
        <span class="mv-tile-name">${this.escapeHtml(data.name)}</span>
        <span class="mv-tile-badge">${isYT ? 'YT' : 'Local'}</span>
        <div class="mv-tile-actions">
          <button class="mv-tile-loop" aria-label="Loop" aria-pressed="false">${MV_ICON_LOOP}</button>
          <button class="mv-tile-fullscreen" aria-label="Fullscreen">${MV_ICON_EXPAND}</button>
          <button class="mv-tile-remove" aria-label="Remove">${MV_ICON_CLOSE}</button>
        </div>
      </div>
      <div class="mv-tile-body"></div>
      <div class="mv-tile-controls">
        <div class="mv-tile-group mv-tile-group-transport">
          <button class="mv-tile-rewind" aria-label="Rewind 10s">${MV_ICON_REWIND}</button>
          <button class="mv-tile-play" aria-label="Play/Pause">${MV_ICON_PLAY}</button>
          <button class="mv-tile-forward" aria-label="Forward 10s">${MV_ICON_FORWARD}</button>
        </div>
        <div class="mv-tile-group mv-tile-group-scrub">
          <div class="mv-tile-scrub" role="slider" tabindex="0" aria-label="Seek">
            <div class="mv-tile-scrub-fill"></div>
            <div class="mv-tile-scrub-handle"></div>
          </div>
          <span class="mv-tile-time">0:00<span class="mv-tile-time-sep">/</span>0:00</span>
        </div>
        <div class="mv-tile-group mv-tile-group-end">
          <div class="mv-tile-volume">
            <button class="mv-tile-mute" aria-label="Mute">${MV_ICON_VOL}</button>
            <input type="range" class="mv-tile-volslider" min="0" max="100" value="100" aria-label="Volume" style="--vol-pct: 100%">
          </div>
          <button class="mv-tile-speed" aria-label="Playback speed">1x</button>
          ${data.type === 'local' ? `<button class="mv-tile-abloop" aria-label="A/B loop">${MV_ICON_ABLOOP}</button>` : ''}
          ${pipBtn}
        </div>
      </div>
      ${handles}`;
        const body = wrapper.querySelector(PekoSelectors.tile.body);
        if (!body) return null;
        const n = this.tiles.length;
        if (restoreOpts?.z) this.zCounter = Math.max(this.zCounter, restoreOpts.z);
        const tile = {
          id,
          type: data.type,
          name: data.name,
          videoId: data.videoId || null,
          wrapper,
          body,
          video: null,
          player: null,
          ytReady: false,
          _file: data.type === 'local' ? data.file : null,
          aspect:
            typeof restoreOpts?.aspect === 'number' && restoreOpts.aspect > 0
              ? restoreOpts.aspect
              : typeof data.aspect === 'number' && data.aspect > 0
                ? data.aspect
                : 16 / 9,
          x: restoreOpts?.x ?? 4 + (n % 4) * 6,
          y: restoreOpts?.y ?? 4 + (n % 4) * 6,
          w: restoreOpts?.w ?? 42,
          h: restoreOpts?.h ?? 42,
          z: restoreOpts?.z ?? ++this.zCounter,
          volume: restoreOpts?.volume ?? 1,
          muted: !!restoreOpts?.muted,
          rate: restoreOpts?.rate ?? 1,
          loop: !!restoreOpts?.loop,
          currentTime: restoreOpts?.currentTime ?? 0,
          _lastSavedAt: 0,
          _scrubbing: false,
          _resizing: false,
          _dragging: false,
          loopA: null,
          loopB: null,
          zoom: 1,
          _objectUrl: null,
          _audioCtx: null,
          _audioGraphReady: false,
          _bassFilter: null,
          _midFilter: null,
          _trebleFilter: null,
          _ro: null,
          _chromeHideTimer: null,
          _resizeRAF: null,
          _dragRAF: null,
          _popupWin: null,
          _popupChildren: null,
          _popupPlaceholder: null,
        };
        if (data.type === 'local' && data.file) {
          const video = document.createElement('video');
          video.src = URL.createObjectURL(data.file);
          video.playsInline = true;
          video.addEventListener('click', () => this.togglePlayTile(tile));
          video.addEventListener('play', () => {
            this.setTilePlayIcon(tile, true);
            this.scheduleHideTileChrome(tile, PekoConfig.TIMING.tileControlsHideMs);
            this.updatePlayPauseAllBtn();
          });
          video.addEventListener('pause', () => {
            this.setTilePlayIcon(tile, false);
            this.showTileChrome(tile);
            this.updatePlayPauseAllBtn();
          });
          video.addEventListener('ended', () => {
            if (!tile.loop) {
              this.setTilePlayIcon(tile, false);
              this.showTileChrome(tile, true);
            }
            this.updatePlayPauseAllBtn();
          });
          video.addEventListener('loadedmetadata', () => {
            if (tile.currentTime) video.currentTime = tile.currentTime;
            video.volume = tile.volume;
            video.muted = tile.muted;
            video.playbackRate = tile.rate;
            video.loop = tile.loop;
            this.updateTileVolUI(tile);
            this.updateTileSpeedUI(tile);
            if (video.videoWidth && video.videoHeight) {
              const a = video.videoWidth / video.videoHeight;
              if (Math.abs(a - tile.aspect) > 0.01) {
                tile.aspect = a;
                this.persistTileField(tile.id, { aspect: a });
                this.renderLayout();
              }
            }
            if (this.eq.bass || this.eq.mid || this.eq.treble) this.ensureTileAudioGraph(tile);
          });
          video.addEventListener('contextmenu', (e) => e.preventDefault());
          video.style.webkitTouchCallout = 'none';
          video.style.userSelect = 'none';
          video.style.touchAction = 'manipulation';
          body.appendChild(video);
          tile.video = video;
          tile._objectUrl = video.src;
        } else {
          const holder = document.createElement('div');
          holder.className = 'mv-tile-yt-holder';
          holder.id = `${id}-yt`;
          body.appendChild(holder);
          this.queueYouTubeTile(tile, data.videoId, holder);
        }
        this.attachTileControls(tile);
        this.updateTileVolUI(tile);
        this.updateTileSpeedUI(tile);
        this.showTileChrome(tile, true);
        this.tiles.push(tile);
        this.el.mvCanvas.appendChild(wrapper);
        if (this.layoutMode === 'canvas' && !restoreOpts) {
          this._fitCanvasTileToAspect(tile);
          this.applyCanvasPosition(tile);
        }
        if (!restoreOpts) this.persistTile(tile);
        if (!restoreOpts) this.setActiveTile(tile);
        else if (!this.activeTileId) this.setActiveTile(tile);
        this.updateTileSizeClass(tile);
        if (typeof ResizeObserver !== 'undefined') {
          tile._ro = new ResizeObserver(() => this.updateTileSizeClass(tile));
          tile._ro.observe(wrapper);
        }
        if (!silent) {
          this.renderLayout();
          this.updatePlayPauseAllBtn();
        }
        return tile;
      },

      updateTileSizeClass(tile) {
        const w = tile.wrapper.clientWidth;
        tile.wrapper.classList.toggle('mv-tile-tiny', w > 0 && w < 240);
        tile.wrapper.classList.toggle('mv-tile-compact', w >= 240 && w < 460);
      },

      _fitCanvasTileToAspect(tile) {
        if (this.layoutMode !== 'canvas') return;
        const r = this.el.mvCanvas.getBoundingClientRect();
        const cw = r.width,
          ch = r.height;
        if (!cw || !ch) return;
        const a = tile.aspect > 0 ? tile.aspect : 16 / 9;
        const pw = cw * 0.4;
        const nh = pw / a;
        const cap = ch * 0.75;
        const fh = Math.min(nh, cap);
        const fw = fh === cap && nh > cap ? cap * a : pw;
        tile.w = (fw / cw) * 100;
        tile.h = (fh / ch) * 100;
        tile.x = Math.max(1, Math.min(tile.x, 100 - tile.w - 1));
        tile.y = Math.max(1, Math.min(tile.y, 100 - tile.h - 1));
      },

      /** Binds the click and pointer handlers of a tile's control bar. */
      attachTileControls(tile) {
        const w = tile.wrapper;
        w.querySelector(PekoSelectors.tile.play)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePlayTile(tile);
        });
        w.querySelector(PekoSelectors.tile.mute)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleMuteTile(tile);
        });
        w.querySelector(PekoSelectors.tile.rewind)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.seekTile(tile, this.getTileCurrentTime(tile) - 10);
        });
        w.querySelector(PekoSelectors.tile.forward)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.seekTile(tile, this.getTileCurrentTime(tile) + 10);
        });
        w.querySelector(PekoSelectors.tile.speed)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cycleTileSpeed(tile);
        });
        const volSlider = w.querySelector(PekoSelectors.tile.volslider);
        volSlider?.addEventListener('input', (e) => {
          e.stopPropagation();
          this.setTileVolume(tile, Number(e.target.value));
        });
        volSlider?.addEventListener('mousedown', (e) => e.stopPropagation());
        const scrub = w.querySelector(PekoSelectors.tile.scrub);
        scrub?.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.startTileScrub(e, tile);
        });
        scrub?.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            this.startTileScrub(e, tile);
          },
          { passive: false },
        );
        w.querySelector(PekoSelectors.tile.abloop)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleTileAbLoop(tile);
        });
        w.querySelector(PekoSelectors.tile.remove)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeTile(tile.id);
        });
        w.querySelector(PekoSelectors.tile.loop)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleTileLoop(tile);
        });
        w.querySelector(PekoSelectors.tile.fullscreen)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleTileFullscreen(tile);
        });
        w.querySelector(PekoSelectors.tile.pip)?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleTilePip(tile);
        });
        w.addEventListener('wheel', (e) => this.handleTileZoomWheel(e, tile), { passive: false });
        w.addEventListener('mousedown', () => this.bringToFront(tile));
        w.addEventListener('touchstart', () => this.bringToFront(tile), { passive: true });
        w.addEventListener('mousemove', () => this.showTileChrome(tile));
        w.addEventListener('mouseenter', () => this.showTileChrome(tile));
        w.addEventListener('mouseleave', () => this.scheduleHideTileChrome(tile, 300));
        w.addEventListener('focusin', () => this.showTileChrome(tile, true));
        const header = w.querySelector(PekoSelectors.tile.header);
        header?.addEventListener('mousedown', (e) => this.startTileDrag(e, tile));
        header?.addEventListener('touchstart', (e) => this.startTileDrag(e, tile), { passive: false });
        w.querySelectorAll('.mv-resize-handle').forEach((h) => {
          const d = h.getAttribute('data-dir') || 'se';
          h.addEventListener('mousedown', (e) => this.startTileResize(e, tile, d));
          h.addEventListener('touchstart', (e) => this.startTileResize(e, tile, d), { passive: false });
        });
      },

      setTilePlayIcon(tile, playing) {
        const b = tile.wrapper.querySelector(PekoSelectors.tile.play);
        if (b) b.innerHTML = playing ? MV_ICON_PAUSE : MV_ICON_PLAY;
      },

      /** Shows the tile's header and controls, and hides them again after a short idle time unless `force` is set. */
      showTileChrome(tile, force) {
        tile.wrapper.classList.add('mv-tile-chrome-visible');
        clearTimeout(tile._chromeHideTimer);
        if (!force) this.scheduleHideTileChrome(tile, PekoConfig.TIMING.tileControlsHideMs);
      },

      /**
       * Hides the tile's controls after `delay` ms. In the wall they stay while the pointer rests on the tile or a control
       * has keyboard focus; a fullscreen tile hides them whenever the pointer is idle.
       */
      scheduleHideTileChrome(tile, delay) {
        clearTimeout(tile._chromeHideTimer);
        tile._chromeHideTimer = setTimeout(() => {
          const fullscreen = document.fullscreenElement === tile.wrapper;
          if (!fullscreen && (tile.wrapper.matches(':hover') || tile.wrapper.querySelector(':focus-visible'))) return;
          tile.wrapper.classList.remove('mv-tile-chrome-visible');
        }, delay);
      },
    };
  })(),
);
