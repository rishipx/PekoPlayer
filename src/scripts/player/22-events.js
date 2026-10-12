// Player: Event binding, drag and drop, scrubber binding and folder open
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      bindEvents() {
        this._bindFileInputs();
        this._bindVideoEvents();
        this._bindTransportControls();
        this._bindSettingsAndMenus();
        this._bindOutsideDismissal();
        this._bindAdvancedControls();
        this._bindPlaylistAndStage();
        this._bindActivityAndWindow();
        this._bindSearchAndCarousel();
        this._bindTopbarToggle();
      },

      _bindFileInputs() {
        const el = this.el;
        el.openBtn.addEventListener('click', () => {
          this._fileInputIntent = 'play';
          el.fileInput.click();
        });
        el.playlistAddBtn.addEventListener('click', () => {
          this._fileInputIntent = 'add';
          el.fileInput.click();
        });
        el.fileInput.addEventListener('change', (e) =>
          this.handleFilesChosen(e.target.files || new DataTransfer().files),
        );
        el.subtitleInput.addEventListener('change', (e) => {
          const f = e.target.files?.[0];
          if (f) this.handleSubtitleChosen(f);
        });
        this.bindDragDrop();
      },

      _bindVideoEvents() {
        const el = this.el;
        const video = el.video;
        video.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        video.addEventListener('timeupdate', () => this.onTimeUpdate());
        video.addEventListener('progress', () => this._bufferedUpdateThrottled());
        video.addEventListener('waiting', () => this.showLoading(true));
        video.addEventListener('canplay', () => this.showLoading(false));
        video.addEventListener('play', () => this.onPlayStateChange(true));
        video.addEventListener('pause', () => this.onPlayStateChange(false));
        video.addEventListener('ended', () => this.onEnded());
        video.addEventListener('volumechange', () => this.syncVolumeUI());
        video.addEventListener('error', () => this.onVideoError());
      },

      /** Wires the play, seek, previous/next, volume and speed controls. */
      _bindTransportControls() {
        const el = this.el;
        el.playBtn.addEventListener('click', () => this.togglePlay());
        el.rewindBtn.addEventListener('click', () => this.seekBy(-10));
        el.forwardBtn.addEventListener('click', () => this.seekBy(10));
        el.prevBtn.addEventListener('click', () => this.playPrevious());
        el.nextBtn.addEventListener('click', () => this.playNext(true));
        el.muteBtn.addEventListener('click', () => this.toggleMute());
        el.volumeSlider.addEventListener('input', (e) => this.setVolume(Number(e.target.value) / 100));
        el.speedSelect.addEventListener('change', (e) => {
          this.setSpeed(Number(e.target.value));
          this.syncSpeedBtn();
          this.syncSpeedMenuActive();
        });
        el.speedBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.compactSpeedBtn) this.cycleSpeed(1);
          else this.toggleSpeedMenu();
        });
        el.speedBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleSpeedMenu();
        });
        el.speedMenu.addEventListener('click', (e) => {
          e.stopPropagation();
          const b = e.target.closest('button[data-speed]');
          if (b) this.setSpeedFromMenu(b.getAttribute('data-speed'));
        });
        el.pipQuickBtn?.addEventListener('click', () => this.togglePip());
        el.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        el.currentTime?.addEventListener('click', () => this.toggleTimeDisplay());
        el.duration?.addEventListener('click', () => this.toggleTimeDisplay());
        el.currentTime?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggleTimeDisplay();
          }
        });
        el.duration?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.toggleTimeDisplay();
          }
        });
        this.bindScrubber();
      },

      /** Wires the settings menu, its sub-pages and the sleep, loop and other option rows. */
      _bindSettingsAndMenus() {
        const el = this.el;
        document
          .querySelectorAll('#settingsMenu [data-loop]')
          .forEach((b) => b.addEventListener('click', () => this.setLoopMode(b.getAttribute('data-loop') || 'off')));
        document
          .querySelectorAll('#sleepMenu [data-sleep]')
          .forEach((b) => b.addEventListener('click', () => this.setSleepMode(b.getAttribute('data-sleep') || 'off')));
        document
          .querySelectorAll('#videoFitGroup [data-fit]')
          .forEach((b) => b.addEventListener('click', () => this.setVideoFit(b.getAttribute('data-fit') || 'none')));
        document
          .querySelectorAll('#videoRatioGroup [data-ratio]')
          .forEach((b) =>
            b.addEventListener('click', () => this.setVideoRatio(b.getAttribute('data-ratio') || 'auto')),
          );
        el.controlLayoutGroup?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-layout]');
          if (b) this.applyControlLayout(b.getAttribute('data-layout'));
        });
        el.controlLookGroup?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-look]');
          if (b) this.applyControlLook(b.getAttribute('data-look'));
        });
        el.brightnessSlider?.addEventListener('input', (e) => this.setBrightness(Number(e.target.value)));
        el.searchSubsBtn?.addEventListener('click', () => this.updateSearchSubsLink());
        el.transcriptSyncBtn?.addEventListener('click', () => this.toggleTranscriptSync());
        el.captionsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleCaptionsMenu();
        });
        el.settingsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSettingsMenu();
        });
        el.playlistQuickBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePlaylistPanel();
        });
        el.settingsMenu.querySelectorAll('[data-settings-nav]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSettingsPage(b.getAttribute('data-settings-nav'));
          });
        });
        el.settingsMenu.querySelectorAll('[data-settings-back]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSettingsPage('main');
          });
        });
        el.themeSwatches?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-theme]');
          if (b) this.applyTheme(b.getAttribute('data-theme'));
        });
        el.themePicker?.addEventListener('input', (e) => this.applyTheme(e.target.value));
        el.showTitleRow?.addEventListener('click', () => {
          this.showStageTitle = !this.showStageTitle;
          this.syncInterfaceUI();
          this.saveSettings();
        });
        el.showTitleRow?.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.showStageTitle = !this.showStageTitle;
            this.syncInterfaceUI();
            this.saveSettings();
          }
        });
        el.compactSpeedRow?.addEventListener('click', () => {
          this.compactSpeedBtn = !this.compactSpeedBtn;
          this.syncInterfaceUI();
          this.saveSettings();
        });
        el.compactSpeedRow?.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.compactSpeedBtn = !this.compactSpeedBtn;
            this.syncInterfaceUI();
            this.saveSettings();
          }
        });
        el.reduceMotionRow?.addEventListener('click', () => {
          if (this.systemReducedMotion) return;
          this.applyReduceMotion(!this.reduceMotion);
        });
        el.reduceMotionRow?.addEventListener('keydown', (e) => {
          if (this.systemReducedMotion) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.applyReduceMotion(!this.reduceMotion);
          }
        });
        el.bookmarkBtn?.addEventListener('click', () => {
          this.toggleBookmark();
          this.closeSettingsMenu();
        });
        el.captionsMenu.addEventListener('click', (e) => e.stopPropagation());
        el.settingsMenu.addEventListener('click', (e) => e.stopPropagation());
        el.subtitleSettingsPopover.addEventListener('click', (e) => e.stopPropagation());
        el.speedMenu.addEventListener('click', (e) => e.stopPropagation());
      },

      /** Closes open menus and popovers when the user clicks or taps outside them. */
      _bindOutsideDismissal() {
        // Outside-click dismissal for the carousel and list popup. It fires on pointerdown so
        // control-bar buttons still receive their own click on the same gesture.
        document.addEventListener(
          'pointerdown',
          (e) => {
            const t = e.target;
            if (t.closest('#playlistCarousel')) return;
            if (t.closest('#playlistPanel')) return;
            if (
              t.closest(
                '.captions-menu, .settings-menu, .subtitle-settings-popover, .speed-menu, .mv-popover-menu, .modal-backdrop, #shortcutsModal',
              )
            )
              return;
            // Do not dismiss while scrubbing or adjusting the volume.
            if (t.closest('.volume-container, #progressContainer')) return;
            // These buttons toggle themselves, so they are not pre-dismissed.
            if (t.closest('#playlistQuickBtn, #playlistToggleBtn, #plcTitleBtn')) return;
            this.closePlaylistCarouselFloating();
          },
          true,
        );
        document.addEventListener(
          'click',
          (e) => {
            const t = e.target;
            if (
              this.el.plcListPopup &&
              !this.el.plcListPopup.hidden &&
              !t.closest('#plcListPopup') &&
              !t.closest('#plcTitleBtn')
            )
              this.toggleCarouselList(false);
            if (
              t.closest('.popover') ||
              t.closest('.captions-menu') ||
              t.closest('.settings-menu') ||
              t.closest('.subtitle-settings-popover') ||
              t.closest('.speed-menu') ||
              t.closest('#settingsBtn') ||
              t.closest('#captionsBtn') ||
              t.closest('#speedBtn') ||
              t.closest('#plcListPopup') ||
              t.closest('#plcTitleBtn')
            )
              return;
            let closed = false;
            if (!this.el.captionsMenu.hidden) {
              this.closeCaptionsMenu();
              closed = true;
            }
            if (!this.el.settingsMenu.hidden) {
              this.closeSettingsMenu();
              closed = true;
            }
            if (!this.el.subtitleSettingsPopover.hidden) {
              this.closeSubtitleSettingsPopover();
              closed = true;
            }
            if (this.el.speedMenu && !this.el.speedMenu.hidden) {
              this.closeSpeedMenu();
              closed = true;
            }
            if (closed) this._lastMenuCloseAt = Date.now();
          },
          true,
        );
      },

      /** Wires the extra tools: rotate, screenshot, A/B loop, bookmarks, equalizer and effects. */
      _bindAdvancedControls() {
        const el = this.el;
        el.moreRotateBtn.addEventListener('click', () => {
          this.rotateVideo();
          this.closeSettingsMenu();
        });
        el.moreScreenshotBtn.addEventListener('click', () => {
          this.takeScreenshot();
          this.closeSettingsMenu();
        });
        el.moreStepBackBtn?.addEventListener('click', () => this.stepFrame(-1));
        el.moreStepForwardBtn?.addEventListener('click', () => this.stepFrame(1));
        el.moreSilenceSkipBtn.addEventListener('click', () => this.toggleSilenceSkip());
        el.silenceThreshold.addEventListener('input', (e) => this.setSilenceThreshold(Number(e.target.value)));
        el.silenceThreshold.addEventListener('mousedown', (e) => e.stopPropagation());
        el.eqBass.addEventListener('input', (e) => this.setEqBass(Number(e.target.value)));
        el.eqMid.addEventListener('input', (e) => this.setEqMid(Number(e.target.value)));
        el.eqTreble.addEventListener('input', (e) => this.setEqTreble(Number(e.target.value)));
        el.eqPreset.addEventListener('change', (e) => this.setEqPreset(e.target.value));
        el.abLoopBtn.addEventListener('click', () => {
          this.toggleAbLoopPoint();
          this.closeSettingsMenu();
        });
        el.fxToggleRow.addEventListener('click', () => this.toggleEffects());
        el.fxToggleRow.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.toggleEffects();
          }
        });
        el.fxPreset.addEventListener('change', (e) => this.applyEffectsPreset(e.target.value));
        el.fxExposure.addEventListener('input', (e) => this.setEffectField('exposure', Number(e.target.value)));
        el.fxContrast.addEventListener('input', (e) => this.setEffectField('contrast', Number(e.target.value)));
        el.fxSaturation.addEventListener('input', (e) => this.setEffectField('saturation', Number(e.target.value)));
        el.fxTemperature.addEventListener('input', (e) => this.setEffectField('temperature', Number(e.target.value)));
        el.fxTint.addEventListener('input', (e) => this.setEffectField('tint', Number(e.target.value)));
        el.fxSharpen.addEventListener('input', (e) => this.setEffectField('sharpen', Number(e.target.value)));
        el.fxVignette.addEventListener('input', (e) => this.setEffectField('vignette', Number(e.target.value)));
        el.fxResetBtn.addEventListener('click', () => this.resetEffects());
        el.capSubtitleSettingsBtn?.addEventListener('click', () => this.openSubtitleSettingsPopover());
        el.subNativeRow?.addEventListener('click', () => this.setSubtitleStyle({ native: !this.subtitleStyle.native }));
        el.subNativeRow?.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.setSubtitleStyle({ native: !this.subtitleStyle.native });
          }
        });
        el.subPastelRow?.addEventListener('click', () => this.setSubtitleStyle({ pastel: !this.subtitleStyle.pastel }));
        el.subPastelRow?.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.setSubtitleStyle({ pastel: !this.subtitleStyle.pastel });
          }
        });
        el.subDelaySlider?.addEventListener('input', (e) => {
          this.subtitleStyle.delay = Number(e.target.value);
          this.syncSubtitleSettingsUI();
          this._applySubtitleDelayToCues();
          this.saveSettings();
        });
        el.subDelayEarlier?.addEventListener('click', () => this.adjustSubtitleDelay(-0.1));
        el.subDelayLater?.addEventListener('click', () => this.adjustSubtitleDelay(0.1));
        el.capFontGroup?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-font]');
          if (b) this.setSubtitleStyle({ font: b.getAttribute('data-font') || 'inter' });
        });
        el.capSizeSlider?.addEventListener('input', (e) => this.setSubtitleStyle({ size: Number(e.target.value) }));
        el.capPositionSlider?.addEventListener('input', (e) =>
          this.setSubtitleStyle({ position: Number(e.target.value) }),
        );
        el.capBgToggleRow?.addEventListener('click', () => {
          const has = this.subtitleStyle.bg !== 'none';
          this.setSubtitleStyle({ bg: has ? 'none' : 'semi' });
        });
        el.capColorSwatches?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-color]');
          if (b) this.setSubtitleStyle({ color: b.getAttribute('data-color') || '#ffffff' });
        });
        el.capColorPicker?.addEventListener('input', (e) => this.setSubtitleStyle({ color: e.target.value }));
        el.capStyleResetBtn?.addEventListener('click', () => this.resetSubtitleStyle());
      },

      /** Wires the playlist panel, folder opening and the stage gestures (wheel zoom, click, double click). */
      _bindPlaylistAndStage() {
        const el = this.el;
        if (PekoUtils.hasFolderPicker()) {
          el.openFolderBtn.hidden = false;
          el.openFolderBtn.addEventListener('click', () => this.openFolder());
        }
        el.stage.addEventListener('wheel', (e) => this.handleZoomWheel(e), { passive: false });
        this.bindZoomPan();
        this.bindVideoHoldGesture();
        el.playlistToggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.togglePlaylistPanel();
        });
        el.playlistCloseBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.togglePlaylistSidebar(false);
        });
        el.playlistClearBtn.addEventListener('click', () => this.clearPlaylist());
        el.playlistSearch.addEventListener('input', (e) => {
          this.filterText = e.target.value;
          this._renderPlaylistDebounced();
        });
        el.playlistSort.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v === 'shuffle') {
            this.shufflePlaylistOrder();
            e.target.value = 'manual';
            this.sortMode = 'manual';
            this._syncSortUI();
            this.saveSettings();
            return;
          }
          this.sortMode = v;
          this._syncSortUI();
          this.saveSettings();
          this.renderPlaylist();
          if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) {
            this.renderPlaylistCarousel();
            this.renderCarouselList();
          }
        });
        el.resumeYes.addEventListener('click', () => this.applyResume(true));
        el.resumeNo.addEventListener('click', () => this.applyResume(false));
        el.helpBtn.addEventListener('click', () => this.openShortcuts());
        el.shortcutsCloseBtn.addEventListener('click', () => this.closeShortcuts());
        el.shortcutsModal.addEventListener('click', (e) => {
          if (e.target === el.shortcutsModal) this.closeShortcuts();
        });
      },

      /** Shows and hides the controls with pointer activity and reacts to window focus, resize and fullscreen changes. */
      _bindActivityAndWindow() {
        const el = this.el;
        el.stage.addEventListener('mousemove', () => this.showControls(), { passive: true });
        el.stage.addEventListener('touchstart', () => this.showControls(), { passive: true });
        el.stage.addEventListener('mouseleave', (e) => {
          const to = e.relatedTarget;
          if (
            to &&
            to.closest &&
            (to.closest('.search-panel') ||
              to.closest('.playlist-panel') ||
              to.closest('.control-bar') ||
              to.closest('.topbar') ||
              to.closest('.plc-shell'))
          )
            return;
          this.debouncedHideControls();
        });
        el.controlBar.addEventListener('mouseenter', () => this.showControls());
        el.controlBar.addEventListener('touchstart', () => this.showControls(), { passive: true });
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('blur', () => this.cancelSpaceHold());
        document.addEventListener('fullscreenchange', () => {
          this.syncFullscreenUI();
          if (this.state.rotation) setTimeout(() => this.applyRotation(), 260);
          this.shaderRenderer?.resize();
          this.applyVideoDisplay();
          this.repositionOpenMenus();
        });
        window.addEventListener(
          'resize',
          PekoUtils.debounce(() => {
            if (this.state.rotation) this.applyRotation();
            if (this.state.zoom > 1) {
              this.clampPan();
              this.applyVideoTransform();
            }
            this.shaderRenderer?.resize();
            this.applyVideoDisplay();
            this.renderBookmarks();
            this.repositionOpenMenus();
            if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) this.updateCarouselNav();
          }, 150),
          { passive: true },
        );
        window.addEventListener(
          'orientationchange',
          PekoUtils.debounce(() => {
            this.shaderRenderer?.resize();
            this.applyVideoDisplay();
            this.renderBookmarks();
          }, 200),
          { passive: true },
        );
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') this.saveResumePosition();
          else if (!this.el.video.paused) this.acquireWakeLock();
        });
        window.addEventListener('beforeunload', () => {
          this.saveResumePosition();
          this.releaseWakeLock();
          this.transcriptIndex.terminate();
          this._thumbRpc?.terminate();
          this.shaderRenderer?.dispose?.();
        });
      },

      /** Wires the transcript search panel and the playlist carousel. */
      _bindSearchAndCarousel() {
        const el = this.el;
        el.searchToggleBtn.addEventListener('click', () => this.toggleSearchPanel());
        el.searchPanelCloseBtn.addEventListener('click', () => this.toggleSearchPanel(false));
        el.searchInput.addEventListener('input', () => this._searchDebounced());
        el.searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.toggleSearchPanel(false, { restoreFocus: false });
          }
          if (e.key === 'Enter') {
            const f =
              el.searchResults.querySelector('.search-result-item') || el.chapterList.querySelector('.chapter-item');
            f?.click();
          }
        });
        document
          .querySelectorAll('.search-tab')
          .forEach((b) => b.addEventListener('click', () => this.setSearchTab(b.getAttribute('data-tab') || 'search')));
        el.playlistBtnPlacementRow?.addEventListener('click', () =>
          this.setPlaylistButtonPlacement(!this.playlistButtonInControlBar),
        );
        el.playlistBtnPlacementRow?.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.setPlaylistButtonPlacement(!this.playlistButtonInControlBar);
          }
        });
        el.playlistStyleGroup?.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-plstyle]');
          if (b) this.setPlaylistStyle(b.getAttribute('data-plstyle'));
        });
        el.plcCloseBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.togglePlaylistCarousel(false);
        });
        el.plcPrevBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.scrollCarouselBy(-1);
        });
        el.plcNextBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.scrollCarouselBy(1);
        });
        el.plcAddBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this._fileInputIntent = 'add';
          el.fileInput.click();
        });
        el.plcClearBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearPlaylist();
        });
        el.plcShuffleBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleShuffle();
        });
        el.playlistShuffleBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleShuffle();
        });
        el.plcTrack?.addEventListener('scroll', () => this.updateCarouselNav(), { passive: true });
        el.plcTitleBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleCarouselList();
        });
        el.plcListSearch?.addEventListener('input', () => this.renderCarouselList());
        el.plcSort?.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v === 'shuffle') {
            this.shufflePlaylistOrder();
            e.target.value = 'manual';
            this.sortMode = 'manual';
            this._syncSortUI();
            this.saveSettings();
            return;
          }
          this.sortMode = v;
          this._syncSortUI();
          this.saveSettings();
          this.renderPlaylist();
          if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) {
            this.renderPlaylistCarousel();
            this.renderCarouselList();
          }
        });
        this._bindCarouselTwoFingerSwipe(el.plcTrack);
        this._bindCarouselWheelScroll(el.plcTrack);
      },
      // Map trackpad and wheel deltas to horizontal carousel scrolling.

      // Hide and show controls for the top bar. While the bar is hidden, moving the pointer into the top strip
      // reveals a small tab with a down arrow; touch screens always show the tab.
      _bindTopbarToggle() {
        const el = this.el;
        const isHidden = () => el.app.classList.contains('topbar-hidden');
        const stripHeight = Math.max(
          48,
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0,
        );
        el.topbarHideBtn.addEventListener('click', () => this.setTopbarHidden(true));
        el.topbarRevealBtn.addEventListener('click', () => this.setTopbarHidden(false));
        document.addEventListener(
          'mousemove',
          (e) => {
            if (isHidden()) el.topbarRevealBtn.classList.toggle('visible', e.clientY <= stripHeight);
          },
          { passive: true },
        );
        document.documentElement.addEventListener('mouseleave', () => el.topbarRevealBtn.classList.remove('visible'));
        try {
          if (localStorage.getItem(PekoConfig.STORAGE.topbarHidden) === '1')
            this.setTopbarHidden(true, { persist: false });
        } catch {
          // Missing or corrupt saved data: keep the defaults.
        }
      },

      _bindCarouselWheelScroll(track) {
        if (!track) return;
        track.addEventListener(
          'wheel',
          (e) => {
            // Nested vertical scrollers, such as the list popup, handle their own scrolling.
            const nested = e.target.closest('.plc-list-popup');
            if (nested && nested.scrollHeight > nested.clientHeight) return;
            const delta = e.deltaX || e.deltaY;
            if (!delta) return;
            e.preventDefault();
            track.classList.add('no-snap');
            track.scrollLeft += delta;
            clearTimeout(this._trackSnapTimer);
            this._trackSnapTimer = setTimeout(() => track.classList.remove('no-snap'), 220);
          },
          { passive: false },
        );
      },

      /** Scrolls the playlist carousel with a two-finger swipe on touch screens. */
      _bindCarouselTwoFingerSwipe(track) {
        if (!track) return;
        let active = false,
          startX = 0,
          startScroll = 0;
        track.addEventListener(
          'touchstart',
          (e) => {
            if (e.touches.length !== 2) {
              active = false;
              return;
            }
            active = true;
            startX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            startScroll = track.scrollLeft;
            track.classList.add('no-snap');
          },
          { passive: true },
        );
        track.addEventListener(
          'touchmove',
          (e) => {
            if (!active || e.touches.length !== 2) return;
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const dx = cx - startX;
            if (Math.abs(dx) > 4 && e.cancelable) e.preventDefault();
            track.scrollLeft = startScroll - dx;
          },
          { passive: false },
        );
        track.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) {
            active = false;
            setTimeout(() => track.classList.remove('no-snap'), 220);
          }
        });
        track.addEventListener('touchcancel', () => {
          active = false;
          track.classList.remove('no-snap');
        });
      },

      repositionOpenMenus() {
        if (!this.el.settingsMenu.hidden) this.positionMenu(this.el.settingsMenu, this.el.settingsBtn, 12);
        if (!this.el.captionsMenu.hidden) this.positionMenu(this.el.captionsMenu, this.el.captionsBtn, 12);
        if (!this.el.subtitleSettingsPopover.hidden)
          this.positionMenu(this.el.subtitleSettingsPopover, this.el.captionsBtn, 12);
        if (this.el.speedMenu && !this.el.speedMenu.hidden) this.positionMenu(this.el.speedMenu, this.el.speedBtn, 10);
      },

      /** Accepts files dropped on the stage and shows the drop hint while a file is dragged over it. */
      bindDragDrop() {
        const stage = this.el.stage,
          dropZone = this.el.dropZone;
        let dragDepth = 0;
        const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
        stage.addEventListener('dragenter', (e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth++;
          dropZone.classList.add('active');
        });
        stage.addEventListener('dragover', (e) => {
          if (isFileDrag(e)) e.preventDefault();
        });
        stage.addEventListener('dragleave', (e) => {
          if (!isFileDrag(e)) return;
          dragDepth = Math.max(0, dragDepth - 1);
          if (dragDepth === 0) dropZone.classList.remove('active');
        });
        stage.addEventListener('drop', (e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragDepth = 0;
          dropZone.classList.remove('active');
          const items = e.dataTransfer?.items;
          const entries =
            items && items.length && items[0].webkitGetAsEntry
              ? Array.from(items)
                  .map((item) => item.webkitGetAsEntry())
                  .filter((entry) => !!entry)
              : null;
          const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
          this.handleDroppedFiles(entries, files);
        });
      },

      /** Wires the progress bar: click and drag to seek, hover preview and keyboard control. */
      bindScrubber() {
        const progressContainer = this.el.progressContainer,
          video = this.el.video;
        const rf = (e) => {
          const r = progressContainer.getBoundingClientRect();
          const x = ('touches' in e && e.touches.length ? e.touches[0].clientX : e.clientX) - r.left;
          return Math.min(1, Math.max(0, x / r.width));
        };
        const mv = (e) => {
          if (e.cancelable) e.preventDefault();
          const r = rf(e);
          this.setScrubVisual(r);
          this.updateScrubTooltip(r, e);
        };
        const end = (e) => {
          this.state.isDragging = false;
          progressContainer.classList.remove('scrubbing');
          const ev = 'changedTouches' in e && e.changedTouches.length ? { touches: e.changedTouches } : e;
          if (video.duration) {
            const r = rf(ev);
            video.currentTime = r * video.duration;
          }
          if (this.state.wasPlaying) video.play().catch(() => {});
          this.shaderRenderer?.invalidate();
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', end);
          document.removeEventListener('touchmove', mv);
          document.removeEventListener('touchend', end);
          this.debouncedHideControls();
        };
        const start = (e) => {
          // Only the primary button scrubs, so a right-click on a bookmark marker reaches its contextmenu handler.
          if (e.button) return;
          if (!video.duration) return;
          this.state.isDragging = true;
          this.state.wasPlaying = !video.paused;
          video.pause();
          progressContainer.classList.add('scrubbing');
          mv(e);
          document.addEventListener('mousemove', mv);
          document.addEventListener('mouseup', end);
          document.addEventListener('touchmove', mv, { passive: false });
          document.addEventListener('touchend', end);
        };
        progressContainer.addEventListener('mousedown', start);
        progressContainer.addEventListener('touchstart', start, { passive: true });
        progressContainer.addEventListener('mousemove', (e) => {
          if (this.state.isDragging || !video.duration) return;
          this.updateScrubTooltip(rf(e), e);
        });
        progressContainer.addEventListener('contextmenu', (e) => {
          if (this.removeBookmarkNear(e.clientX)) e.preventDefault();
        });
        progressContainer.addEventListener('mouseleave', () => {
          if (this.state.isDragging) return;
          this.hideThumbnailPreview();
        });
        progressContainer.addEventListener('keydown', (e) => {
          if (!video.duration) return;
          const step = e.shiftKey ? 30 : 5;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.seekBy(step);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.seekBy(-step);
          } else if (e.key === 'Home') {
            e.preventDefault();
            video.currentTime = 0;
          } else if (e.key === 'End') {
            e.preventDefault();
            video.currentTime = video.duration;
          }
        });
      },

      /** Opens every video in a folder. The desktop app shows its own dialog and hands the files over itself. */
      async openFolder() {
        if (window.pekoDesktop) {
          const result = await window.pekoDesktop.openFolder('player').catch(() => null);
          if (!result) this.announce('Could not open that folder');
          else if (!result.canceled && result.count === 0) this.announce('No videos found in that folder');
          return;
        }
        try {
          const dirHandle = await window.showDirectoryPicker();
          const files = [];
          await PekoUtils.collectFilesFromDirectoryHandle(dirHandle, files);
          this.addFilesToPlaylistWithSidecars(files, { playFirst: true });
        } catch (err) {
          if (err.name !== 'AbortError') this.announce('Could not open that folder');
        }
      },
    };
  })(),
);
