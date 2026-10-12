// Player: Control visibility, shortcuts and keyboard handling
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      showControls(force) {
        this.el.controls.classList.add('visible');
        if (this.showStageTitle && this.el.stageTitle && this.playlist[this.currentIndex])
          this.el.stageTitle.classList.add('visible');
        if (!force) this.debouncedHideControls();
      },

      maybeHideControls() {
        if (
          !this.el.captionsMenu.hidden ||
          !this.el.settingsMenu.hidden ||
          !this.el.subtitleSettingsPopover.hidden ||
          (this.el.speedMenu && !this.el.speedMenu.hidden)
        )
          return;
        if (this.el.controlBar.matches(':hover')) return;
        if (this.state.searchPanelOpen || this.el.playlistPanel.classList.contains('open')) return;
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) return;
        if (this.state.isDragging || this.state.spaceHoldActive) return;
        this.el.controls.classList.remove('visible');
        if (this.el.stageTitle) this.el.stageTitle.classList.remove('visible');
      },

      showLoading(show) {
        this.el.loading.hidden = !show;
      },

      /** Briefly shows an icon and label in the middle of the stage as feedback for an action. */
      flashCenterIcon(type, seconds) {
        const { centerFlash, centerFlashIcon, centerFlashLabel } = this.el;
        const icons = {
          play: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>',
          pause:
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
          forward:
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
          rewind:
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
          seek: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 8 8"/><path d="m4 12-2-2M4 12l2-2"/></svg>',
        };
        centerFlashIcon.innerHTML = icons[type] || '';
        if ((type === 'forward' || type === 'rewind') && seconds)
          centerFlashLabel.textContent = `${type === 'forward' ? '+' : '-'}${Math.round(seconds)}s`;
        else if (type === 'seek') centerFlashLabel.textContent = `${seconds}%`;
        else centerFlashLabel.textContent = '';
        centerFlash.classList.remove('pos-left', 'pos-right');
        if (type === 'rewind') centerFlash.classList.add('pos-left');
        else if (type === 'forward') centerFlash.classList.add('pos-right');
        centerFlash.classList.remove('pulse');
        void centerFlash.offsetWidth;
        centerFlash.classList.add('pulse');
      },

      openShortcuts() {
        this.el.shortcutsModal.hidden = false;
        this._trapShortcuts =
          this._trapShortcuts ||
          createFocusTrap(this.el.shortcutsModal.querySelector('.modal') || this.el.shortcutsModal);
        this._trapShortcuts.activate();
        this.el.shortcutsCloseBtn.focus();
      },

      closeShortcuts() {
        this.el.shortcutsModal.hidden = true;
        if (this._trapShortcuts) this._trapShortcuts.deactivate({ restoreFocus: false });
      },

      /** Global keyboard shortcuts. Hands over to multi-view while it is open and ignores keys typed into text fields. */
      handleKeyDown(e) {
        const tag = (e.target.tagName || '').toLowerCase();
        const inTextInput = tag === 'input' || tag === 'select' || tag === 'textarea';
        const mvOpen = !!(window.multiView && window.multiView.isOpen && !window.multiView.el.mvView.hidden);
        if (e.key === 'Escape') {
          if (!this.el.shortcutsModal.hidden) this.closeShortcuts();
          else if (this.el.plcListPopup && !this.el.plcListPopup.hidden) this.toggleCarouselList(false);
          else if (!this.el.subtitleSettingsPopover.hidden) this.closeSubtitleSettingsPopover();
          else if (!this.el.captionsMenu.hidden) this.closeCaptionsMenu();
          else if (!this.el.settingsMenu.hidden) {
            if (this.settingsPage !== 'main') this.showSettingsPage('main');
            else this.closeSettingsMenu();
          } else if (this.el.speedMenu && !this.el.speedMenu.hidden) this.closeSpeedMenu();
          else if (this.state.loopA != null || this.state.loopB != null) {
            this.clearAbLoop();
            this.announce('A/B loop cleared');
            return;
          } else if (this.state.searchPanelOpen) this.toggleSearchPanel(false, { restoreFocus: false });
          else if (this.isPlaylistOpen()) this.togglePlaylistPanel(false, { restoreFocus: false });
          else if (mvOpen && window.multiView.closeAnyOpenPopover()) {
            // A multi-view popover was open and has just been closed; nothing else to do.
          } else if (mvOpen) window.multiView.close();
          return;
        }
        if (!this.el.shortcutsModal.hidden) return;
        if (inTextInput) return;
        if (e.key === '?') {
          e.preventDefault();
          this.openShortcuts();
          return;
        }
        if (mvOpen) {
          window.multiView.handleKeyDown(e);
          return;
        }
        let rc = true;
        switch (e.key) {
          case ' ':
            e.preventDefault();
            if (!e.repeat) this.startSpaceHoldTimer();
            rc = false;
            break;
          case 'ArrowRight':
            if (document.activeElement !== this.el.progressContainer) this.seekBy(10);
            rc = false;
            break;
          case 'ArrowLeft':
            if (document.activeElement !== this.el.progressContainer) this.seekBy(-10);
            rc = false;
            break;
          case 'ArrowUp':
            e.preventDefault();
            this.setVolume(this.volumeLevel + (this.volumeLevel >= 1 ? 0.05 : 0.025));
            rc = false;
            break;
          case 'ArrowDown':
            e.preventDefault();
            this.setVolume(this.volumeLevel - (this.volumeLevel > 1 ? 0.05 : 0.025));
            rc = false;
            break;
          case 'm':
          case 'M':
            if (e.shiftKey) this.toggleBookmark();
            else this.toggleMute();
            break;
          case 'b':
          case 'B':
            this.toggleBookmark();
            break;
          case 'f':
          case 'F':
            this.toggleFullscreen();
            break;
          case 'p':
          case 'P':
            this.togglePip();
            break;
          case 'o':
          case 'O':
            this._fileInputIntent = 'play';
            this.el.fileInput.click();
            break;
          case 'q':
          case 'Q':
            this.togglePlaylistPanel();
            break;
          case 'c':
          case 'C':
            this.toggleCaptionsMenu();
            break;
          case 's':
          case 'S':
            this.takeScreenshot();
            break;
          case 'r':
          case 'R':
            this.rotateVideo();
            break;
          case 'a':
          case 'A':
            this.toggleAbLoopPoint();
            break;
          case 'g':
          case 'G':
            this.cycleEffects();
            break;
          case ',':
          case '<':
            if (this.el.video.paused) this.stepFrame(-1);
            break;
          case '.':
          case '>':
            if (this.el.video.paused) this.stepFrame(1);
            break;
          case 'l':
          case 'L':
            this.cycleLoopModeWithBadge();
            break;
          case 'n':
            this.playNext(true);
            break;
          case 'N':
            this.playPrevious();
            break;
          case 'v':
          case 'V':
            window.multiView?.open();
            break;
          case 'z':
          case 'Z':
            this.resetZoom();
            break;
          case '+':
          case '=':
            e.preventDefault();
            this.setZoom(this.state.zoom + 0.2);
            break;
          case '-':
          case '_':
            e.preventDefault();
            this.setZoom(this.state.zoom - 0.2);
            break;
          case '/':
            e.preventDefault();
            this.toggleSearchPanel(true);
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            this.seekToPercent(Number(e.key) * 10);
            break;
          default:
            return;
        }
        if (rc) this.showControls();
      },

      handleKeyUp(e) {
        if (e.key !== ' ') return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (this.state.spaceHoldTimer) {
          clearTimeout(this.state.spaceHoldTimer);
          this.state.spaceHoldTimer = null;
          this.togglePlay();
          return;
        }
        this.cancelSpaceHold();
      },

      startSpaceHoldTimer() {
        clearTimeout(this.state.spaceHoldTimer);
        this.state.spaceHoldTimer = setTimeout(() => {
          this.state.spaceHoldTimer = null;
          const video = this.el.video;
          if (!video.src) return;
          this.state.preHoldSpeed = video.playbackRate;
          this.state.spaceHoldActive = true;
          this.state.spaceHoldWasPaused = video.paused;
          if (video.paused) video.play().catch(() => {});
          video.playbackRate = 2;
          this.el.holdSpeedBadge.hidden = false;
        }, 350);
      },

      cancelSpaceHold() {
        clearTimeout(this.state.spaceHoldTimer);
        this.state.spaceHoldTimer = null;
        if (this.state.spaceHoldActive) {
          this.el.video.playbackRate = this.state.preHoldSpeed;
          this.state.spaceHoldActive = false;
          this.el.holdSpeedBadge.hidden = true;
          if (this.state.spaceHoldWasPaused) {
            this.el.video.pause();
            this.state.spaceHoldWasPaused = false;
          }
        }
      },
    };
  })(),
);
