// Player: Saved settings, play state, seeking, time updates
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Restores the saved settings from localStorage, validating every value and ignoring anything malformed. */
      loadSettings() {
        try {
          const s = JSON.parse(localStorage.getItem(PekoConfig.STORAGE.settings) || '{}');
          if (typeof s.volumeLevel === 'number') this.volumeLevel = Math.min(2, Math.max(0, s.volumeLevel));
          if (typeof s.isMuted === 'boolean') this.isMuted = s.isMuted;
          if (typeof s.loopMode === 'string') this.loopMode = s.loopMode;
          if (typeof s.shuffleOn === 'boolean') this.shuffleOn = s.shuffleOn;
          if (typeof s.sortMode === 'string') this.sortMode = s.sortMode;
          if (typeof s.videoFit === 'string') this.videoFit = s.videoFit;
          if (typeof s.videoRatio === 'string') this.videoRatio = s.videoRatio;
          if (typeof s.brightness === 'number') this.brightness = s.brightness;
          if (typeof s.controlLayout === 'string') this.controlLayout = s.controlLayout;
          if (typeof s.controlLook === 'string') this.controlLook = s.controlLook;
          if (typeof s.speed === 'number') this.el.speedSelect.value = String(s.speed);
          if (typeof s.themeColor === 'string') this.applyTheme(s.themeColor, { silent: true });
          if (typeof s.reduceMotion === 'boolean') this.applyReduceMotion(s.reduceMotion, { silent: true });
          if (s.eq && typeof s.eq.bass === 'number')
            this.eq = {
              bass: s.eq.bass,
              mid: s.eq.mid ?? 0,
              treble: s.eq.treble ?? 0,
            };
          if (typeof s.silenceSkipEnabled === 'boolean') this.silenceSkip.enabled = s.silenceSkipEnabled;
          if (typeof s.silenceSkipThreshold === 'number') this.silenceSkip.thresholdDb = s.silenceSkipThreshold;
          if (s.subtitleStyle && typeof s.subtitleStyle.size === 'number')
            this.subtitleStyle = { ...this.subtitleStyle, ...s.subtitleStyle };
          if (s.effects && typeof s.effects === 'object') {
            const known = [
              'enabled',
              'preset',
              'exposure',
              'contrast',
              'saturation',
              'temperature',
              'tint',
              'sharpen',
              'vignette',
            ];
            known.forEach((k) => {
              if (typeof s.effects[k] !== 'undefined') this.effects[k] = s.effects[k];
            });
          }
          if (typeof s.showStageTitle === 'boolean') this.showStageTitle = s.showStageTitle;
          if (typeof s.compactSpeedBtn === 'boolean') this.compactSpeedBtn = s.compactSpeedBtn;
          if (typeof s.timeDisplayMode === 'string') this.state.timeDisplayMode = s.timeDisplayMode;
          if (typeof s.playlistButtonInControlBar === 'boolean')
            this.playlistButtonInControlBar = s.playlistButtonInControlBar;
          if (s.playlistStyle === 'sidebar' || s.playlistStyle === 'carousel') this.playlistStyle = s.playlistStyle;
          this.syncLoopUI();
          this._syncShuffleUI();
          this._syncSortUI();
          this.syncEqUI();
          this.syncSilenceSkipUI();
          this.syncVideoFitUI();
          this.syncVideoRatioUI();
          this.applySubtitleStyle();
          this.updateCaptionsButtonState();
        } catch {
          // Missing or corrupt saved data: keep the defaults.
        }
      },

      /** Saves the current settings to localStorage. */
      saveSettings() {
        try {
          localStorage.setItem(
            PekoConfig.STORAGE.settings,
            JSON.stringify({
              volumeLevel: this.volumeLevel,
              isMuted: this.isMuted,
              loopMode: this.loopMode,
              shuffleOn: this.shuffleOn,
              sortMode: this.sortMode,
              speed: Number(this.el.speedSelect.value),
              eq: this.eq,
              subtitleStyle: this.subtitleStyle,
              silenceSkipEnabled: this.silenceSkip.enabled,
              silenceSkipThreshold: this.silenceSkip.thresholdDb,
              effects: this.effects,
              videoFit: this.videoFit,
              videoRatio: this.videoRatio,
              brightness: this.brightness,
              controlLayout: this.controlLayout,
              controlLook: this.controlLook,
              showStageTitle: this.showStageTitle,
              compactSpeedBtn: this.compactSpeedBtn,
              themeColor: this.themeColor,
              reduceMotion: this.reduceMotion,
              timeDisplayMode: this.state.timeDisplayMode,
              playlistButtonInControlBar: this.playlistButtonInControlBar,
              playlistStyle: this.playlistStyle,
            }),
          );
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      togglePlay() {
        const video = this.el.video;
        if (!video.src) return;
        if (video.paused) {
          if (this.audioGraphReady && this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
          video.play().catch(() => setTimeout(() => video.play().catch(() => {}), 80));
          this.shaderRenderer?.setPlaying(true);
        } else video.pause();
      },

      setPlayIcon(p) {
        const { playBtn } = this.el;
        const pi = playBtn.querySelector('.icon-play'),
          pa = playBtn.querySelector('.icon-pause');
        if (pi) {
          if (p) pi.setAttribute('hidden', '');
          else pi.removeAttribute('hidden');
        }
        if (pa) {
          if (p) pa.removeAttribute('hidden');
          else pa.setAttribute('hidden', '');
        }
      },

      updateTimeDisplay() {
        const video = this.el.video;
        const ct = this.el.currentTime,
          d = this.el.duration;
        const ctM = this.el.currentTimeMini,
          dM = this.el.durationMini;
        if (!video.duration || !isFinite(video.duration)) {
          if (ct) ct.textContent = '0:00';
          if (d) d.textContent = this.state.timeDisplayMode === 'remaining' ? '-0:00' : '0:00';
          if (ctM) ctM.textContent = '0:00';
          if (dM) dM.textContent = '0:00';
          return;
        }
        const elapsed = this.formatTime(video.currentTime);
        let tail;
        if (this.state.timeDisplayMode === 'remaining')
          tail = `-${this.formatTime(Math.max(0, video.duration - video.currentTime))}`;
        else tail = this.formatTime(video.duration);
        if (ct) ct.textContent = elapsed;
        if (d) d.textContent = tail;
        if (ctM) ctM.textContent = elapsed;
        if (dM) dM.textContent = this.formatTime(video.duration);
      },

      toggleTimeDisplay() {
        this.state.timeDisplayMode = this.state.timeDisplayMode === 'normal' ? 'remaining' : 'normal';
        this.updateTimeDisplay();
        this.saveSettings();
      },

      onPlayStateChange(p) {
        const { playBtn } = this.el;
        this.setPlayIcon(p);
        playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
        this.flashCenterIcon(p ? 'play' : 'pause');
        this.announce(p ? 'Playing' : 'Paused');
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
        if (p) {
          this.debouncedHideControls();
          if (this.silenceSkip.enabled) this.startSilenceWatcher();
          this.acquireWakeLock();
        } else {
          this.showControls();
          this.stopSilenceWatcher();
          this.releaseWakeLock();
        }
        this.shaderRenderer?.setPlaying(p);
        if (p) this.shaderRenderer?.invalidate();
      },

      seekBy(s) {
        const video = this.el.video;
        if (!video.duration) return;
        video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + s));
        this.flashCenterIcon(s > 0 ? 'forward' : 'rewind', Math.abs(s));
        this.shaderRenderer?.invalidate();
      },

      stepFrame(d) {
        const video = this.el.video;
        if (!video.duration) return;
        video.pause();
        video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + d / 30));
        this.shaderRenderer?.invalidate();
      },

      seekToPercent(p) {
        const video = this.el.video;
        if (!video.duration) return;
        video.currentTime = (p / 100) * video.duration;
        this.flashCenterIcon('seek', p);
        this.shaderRenderer?.invalidate();
      },

      onLoadedMetadata() {
        const video = this.el.video;
        this.el.progressContainer.setAttribute('aria-valuemax', String(Math.floor(video.duration)));
        this.showLoading(false);
        this.applyRotation();
        const item = this.playlist[this.currentIndex];
        if (item) {
          item.duration = video.duration;
          this.persistItemField(item.id, { duration: video.duration });
          this.renderPlaylist();
          if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) this.renderPlaylistCarousel();
        }
        this.shaderRenderer?.resize();
        this._applyShaderCanvasRect();
        this.applyVideoDisplay();
        this.shaderRenderer?.invalidate();
        this.updateTimeDisplay();
        this.renderBookmarks();
        this.detectEmbeddedTracks();
        setTimeout(() => {
          if (this.subtitleStyle.delay !== 0) this._applySubtitleDelayToCues();
        }, 100);
      },

      onTimeUpdate() {
        if (this._pendingTimeUpdate) return;
        this._pendingTimeUpdate = true;
        requestAnimationFrame(() => {
          this._pendingTimeUpdate = false;
          this._doTimeUpdate();
        });
      },

      _doTimeUpdate() {
        const video = this.el.video;
        if (!video.duration || this.state.isDragging) return;
        if (this.state.loopA != null && this.state.loopB != null && video.currentTime >= this.state.loopB) {
          video.currentTime = this.state.loopA;
          this.shaderRenderer?.invalidate();
          this._updateAbLoopBadge();
        } else if (this.state.loopA != null && this.state.loopB != null) this._updateAbLoopBadge();
        const r = video.currentTime / video.duration;
        this.el.progressBar.style.width = `${r * 100}%`;
        this.el.progressHandle.style.left = `${r * 100}%`;
        this.updateTimeDisplay();
        this.el.progressContainer.setAttribute('aria-valuenow', String(Math.floor(video.currentTime)));
        this.el.progressContainer.setAttribute(
          'aria-valuetext',
          `${this.formatTime(video.currentTime)} of ${this.formatTime(video.duration)}`,
        );
        this.throttledSaveResume();
        this._progressUpdateThrottled();
        if (this.state.syncTranscriptOn) this._syncScrollThrottled();
      },

      updateBuffered() {
        const video = this.el.video;
        if (!video.duration || !video.buffered.length) return;
        const e = video.buffered.end(video.buffered.length - 1);
        this.el.bufferedBar.style.width = `${Math.min(100, (e / video.duration) * 100)}%`;
      },

      setScrubVisual(r) {
        this.el.progressBar.style.width = `${r * 100}%`;
        this.el.progressHandle.style.left = `${r * 100}%`;
      },
    };
  })(),
);
