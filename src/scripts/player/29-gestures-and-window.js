// Player: Hold gesture, Picture-in-Picture, fullscreen, video errors
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Touch and mouse hold gesture on the video: temporary 2x speed on a hold, and horizontal or vertical drags for seeking and volume. */
      bindVideoHoldGesture() {
        const video = this.el.video;
        const HOLD_MS = 320,
          MT = 10,
          MG = 300;
        let holdTimer = null,
          holding = false,
          preHoldRate = 1,
          wasPausedBeforeHold = false;
        let downX = 0,
          downY = 0,
          moved = false,
          active = false;
        let touchActive = false;
        const anyMenuOpen = () =>
          !this.el.captionsMenu.hidden ||
          !this.el.settingsMenu.hidden ||
          !this.el.subtitleSettingsPopover.hidden ||
          (this.el.speedMenu && !this.el.speedMenu.hidden);
        const cancelHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          if (holding) {
            video.playbackRate = preHoldRate;
            holding = false;
            this.el.holdSpeedBadge.hidden = true;
            if (wasPausedBeforeHold) {
              video.pause();
              wasPausedBeforeHold = false;
            }
          }
        };
        const startHold = () => {
          holdTimer = setTimeout(() => {
            holdTimer = null;
            holding = true;
            preHoldRate = video.playbackRate;
            wasPausedBeforeHold = video.paused;
            if (wasPausedBeforeHold) video.play().catch(() => {});
            video.playbackRate = 2;
            this.el.holdSpeedBadge.hidden = false;
          }, HOLD_MS);
        };
        const onDown = (x, y) => {
          if (this.state.zoom > 1) return;
          if (Date.now() - (this._lastMenuCloseAt || 0) < MG) return;
          if (anyMenuOpen()) return;
          downX = x;
          downY = y;
          moved = false;
          active = true;
          startHold();
        };
        const onMove = (x, y) => {
          if (!active || moved) return;
          if (Math.abs(x - downX) > MT || Math.abs(y - downY) > MT) moved = true;
        };
        const onUp = () => {
          if (!active) return;
          active = false;
          const wasHolding = holding;
          const timerWasActive = !!holdTimer;
          cancelHold();
          if (wasHolding || !timerWasActive || moved) return;
          this.togglePlay();
        };
        video.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (e.target.closest('.controls')) return;
          onDown(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', () => onUp());
        video.addEventListener(
          'touchstart',
          (e) => {
            if (e.touches.length !== 1) return;
            if (e.target.closest('.controls')) return;
            touchActive = true;
            const t = e.touches[0];
            onDown(t.clientX, t.clientY);
            if (e.cancelable) e.preventDefault();
          },
          { passive: false },
        );
        window.addEventListener(
          'touchmove',
          (e) => {
            if (!touchActive) return;
            const t = e.touches[0];
            if (t) onMove(t.clientX, t.clientY);
            if (active && !moved && e.cancelable) e.preventDefault();
          },
          { passive: false },
        );
        window.addEventListener(
          'touchend',
          (e) => {
            if (!touchActive) return;
            touchActive = false;
            onUp();
            if (e.cancelable) e.preventDefault();
          },
          { passive: false },
        );
        window.addEventListener('touchcancel', () => {
          touchActive = false;
          cancelHold();
          active = false;
        });
        video.addEventListener('contextmenu', (e) => e.preventDefault());
      },

      togglePip() {
        const video = this.el.video;
        if (!document.pictureInPictureEnabled) return;
        if (document.pictureInPictureElement) document.exitPictureInPicture();
        else video.requestPictureInPicture().catch(() => {});
      },

      toggleFullscreen() {
        const app = this.el.app;
        if (!document.fullscreenElement) app.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
      },

      syncFullscreenUI() {
        const fs = !!document.fullscreenElement;
        this.el.app.classList.toggle('fullscreen', fs);
        const btn = this.el.fullscreenBtn;
        if (btn) {
          btn.innerHTML = fs ? ICON_FS_EXIT : ICON_FS_ENTER;
          btn.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
          btn.setAttribute('data-tip', fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)');
        }
      },

      onVideoError() {
        this.showLoading(false);
        const item = this.playlist[this.currentIndex];
        const ext = item?.name.split('.').pop()?.toLowerCase() || '';
        const hint = /(mkv|avi|flv|wmv|mov)/.test(ext)
          ? ' This format may not be supported by your browser. Try converting to MP4 or WebM.'
          : '';
        this.announce('This video could not be played.' + hint);
      },
    };
  })(),
);
