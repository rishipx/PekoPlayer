// Player: Screenshot, URL hash, media session, casting, wake lock, announcements
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Saves the current frame, including active effects, as a PNG download. */
      takeScreenshot() {
        const source =
          this.shaderRenderer?.enabled && this.shaderRenderer.supported ? this.shaderRenderer.canvas : this.el.video;
        const video = this.el.video;
        if (!video.videoWidth) return;
        const srcW = source === video ? video.videoWidth : source.width;
        const srcH = source === video ? video.videoHeight : source.height;
        const rot = this.state.rotation;
        const swapped = rot === 90 || rot === 270;
        const c = document.createElement('canvas');
        c.width = swapped ? srcH : srcW;
        c.height = swapped ? srcW : srcH;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(source, -srcW / 2, -srcH / 2, srcW, srcH);
        c.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const item = this.playlist[this.currentIndex];
          const base = item ? item.name.replace(/\.[^.]+$/, '') : 'screenshot';
          this.el.downloadAnchor.href = url;
          this.el.downloadAnchor.download = `${base}-${this.formatTime(video.currentTime).replace(':', 'm')}s.png`;
          this.el.downloadAnchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }, 'image/png');
      },

      setupMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => this.el.video.play().catch(() => {}));
        ms.setActionHandler('pause', () => this.el.video.pause());
        ms.setActionHandler('previoustrack', () => this.playPrevious());
        ms.setActionHandler('nexttrack', () => this.playNext(true));
        ms.setActionHandler('seekbackward', (d) => this.seekBy(-(d.seekOffset || 10)));
        ms.setActionHandler('seekforward', (d) => this.seekBy(d.seekOffset || 10));
      },

      setupCast() {
        const video = this.el.video;
        if (!video.remote || !this.el.castBtn) return;
        const update = () => {
          const s = video.remote.state;
          this.el.castBtn.hidden = s === 'disconnected' && !video.remote.isConnected?.();
          this.el.castBtn.classList.toggle('active', s === 'connected');
        };
        video.remote.addEventListener?.('connect', update);
        video.remote.addEventListener?.('disconnect', update);
        this.el.castBtn.addEventListener('click', () =>
          video.remote.prompt().catch(() => this.announce('No cast devices')),
        );
        update();
      },

      bindPipState() {
        const v = this.el.video;
        const btns = [this.el.pipQuickBtn].filter(Boolean);
        v.addEventListener('enterpictureinpicture', () => btns.forEach((b) => b.classList.add('active')));
        v.addEventListener('leavepictureinpicture', () => btns.forEach((b) => b.classList.remove('active')));
      },

      bindWakeLock() {
        if (!('wakeLock' in navigator)) return;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && !this.el.video.paused) this.acquireWakeLock();
        });
      },

      async acquireWakeLock() {
        if (!('wakeLock' in navigator)) return;
        if (this._wakeLock) return;
        try {
          this._wakeLock = await navigator.wakeLock.request('screen');
          this._wakeLock.addEventListener('release', () => {
            this._wakeLock = null;
          });
        } catch {
          // Screen wake lock is unsupported or was refused.
        }
      },

      releaseWakeLock() {
        if (!this._wakeLock) return;
        try {
          this._wakeLock.release();
        } catch {
          // The wake lock was already released.
        }
        this._wakeLock = null;
      },

      announce(msg) {
        this.el.srStatus.textContent = msg;
        if (/error|could not|failed|unavailable/i.test(msg)) {
          this.el.srAlert.textContent = msg;
          setTimeout(() => {
            this.el.srAlert.textContent = '';
          }, 3000);
        }
      },
    };
  })(),
);
