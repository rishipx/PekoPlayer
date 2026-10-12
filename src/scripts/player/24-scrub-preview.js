// Player: Scrub tooltip and frame preview
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      updateScrubTooltip(r, e) {
        const video = this.el.video;
        if (!video.duration) return;
        const t = r * video.duration;
        this.el.progressTooltipTime.textContent = this.formatTime(t);
        this.requestThumbnailPreview(t);
        if (e) {
          const rect = this.el.progressContainer.getBoundingClientRect();
          const x = ('touches' in e && e.touches.length ? e.touches[0].clientX : e.clientX) - rect.left;
          this.el.progressTooltip.style.left = `${Math.min(rect.width - 4, Math.max(4, x))}px`;
        }
      },

      ensureThumbVideo() {
        if (this._thumbVideo) return this._thumbVideo;
        const v = document.createElement('video');
        v.muted = true;
        v.preload = 'metadata';
        v.style.display = 'none';
        document.body.appendChild(v);
        this._thumbVideo = v;
        return v;
      },

      syncThumbVideoSource() {
        const item = this.playlist[this.currentIndex];
        if (!item || !this._thumbVideo) return;
        if (this._thumbVideo.src !== item.url) this._thumbVideo.src = item.url;
      },

      requestThumbnailPreview(t) {
        const item = this.playlist[this.currentIndex];
        if (!item) return;
        const now = Date.now();
        if (now - this._lastThumbRequest < 120) return;
        this._lastThumbRequest = now;
        const tv = this.ensureThumbVideo();
        this.syncThumbVideoSource();
        if (!tv.duration && tv.readyState < 1) return;
        const token = ++this._thumbToken;
        const onSeeked = () => {
          if (token !== this._thumbToken) return;
          this.drawThumbnailFrame(tv);
        };
        if (tv._lastSeekedHandler) tv.removeEventListener('seeked', tv._lastSeekedHandler);
        tv._lastSeekedHandler = onSeeked;
        tv.addEventListener('seeked', onSeeked, { once: true });
        try {
          tv.currentTime = Math.min(t, tv.duration || t);
        } catch {
          // The preview video is not ready for seeking yet.
        }
      },

      drawThumbnailFrame(tv) {
        const c = this.el.progressThumb;
        if (!tv.videoWidth) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const vr = tv.videoWidth / tv.videoHeight,
          cr = c.width / c.height;
        let sx = 0,
          sy = 0,
          sw = tv.videoWidth,
          sh = tv.videoHeight;
        if (vr > cr) {
          sw = sh * cr;
          sx = (tv.videoWidth - sw) / 2;
        } else {
          sh = sw / cr;
          sy = (tv.videoHeight - sh) / 2;
        }
        ctx.drawImage(tv, sx, sy, sw, sh, 0, 0, c.width, c.height);
        c.hidden = false;
      },

      hideThumbnailPreview() {
        this.el.progressThumb.hidden = true;
      },
    };
  })(),
);
