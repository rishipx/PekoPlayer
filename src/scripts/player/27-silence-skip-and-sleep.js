// Player: Silence skipping and sleep timer
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      toggleSilenceSkip() {
        if (this.silenceSkip.enabled) this.disableSilenceSkip();
        else this.enableSilenceSkip();
      },

      enableSilenceSkip() {
        if (!this.ensureAudioGraph() || !this.audioCtx || !this.audioSource) return;
        if (!this.silenceSkip.analyser) {
          const a = this.audioCtx.createAnalyser();
          a.fftSize = 1024;
          a.smoothingTimeConstant = 0.2;
          this.audioSource.connect(a);
          this.silenceSkip.analyser = a;
          this.silenceSkip.buffer = new Float32Array(a.fftSize);
        }
        this.silenceSkip.enabled = true;
        if (!this.el.video.paused) this.startSilenceWatcher();
        this.syncSilenceSkipUI();
        this.saveSettings();
      },

      disableSilenceSkip() {
        this.silenceSkip.enabled = false;
        this.stopSilenceWatcher();
        this.syncSilenceSkipUI();
        this.saveSettings();
      },

      setSilenceThreshold(d) {
        this.silenceSkip.thresholdDb = Math.min(-25, Math.max(-60, d));
        this.syncSilenceSkipUI();
        this.saveSettings();
      },

      syncSilenceSkipUI() {
        const { moreSilenceSkipBtn, silenceSkipRow, silenceThreshold, silenceThresholdValue } = this.el;
        if (!moreSilenceSkipBtn) return;
        moreSilenceSkipBtn.setAttribute('aria-checked', String(this.silenceSkip.enabled));
        silenceSkipRow.hidden = !this.silenceSkip.enabled;
        silenceThreshold.value = String(this.silenceSkip.thresholdDb);
        silenceThresholdValue.textContent = `${this.silenceSkip.thresholdDb}dB`;
      },

      startSilenceWatcher() {
        if (this.silenceSkip.interval) return;
        this.silenceSkip.interval = setInterval(() => this.tickSilenceSkip(), 100);
      },

      stopSilenceWatcher() {
        if (this.silenceSkip.interval) {
          clearInterval(this.silenceSkip.interval);
          this.silenceSkip.interval = null;
        }
        this.resetSilenceState();
      },

      resetSilenceState() {
        this.silenceSkip.silentFor = 0;
        if (this.silenceSkip.active) {
          this.el.video.playbackRate = this.silenceSkip.preSkipRate || 1;
          this.silenceSkip.active = false;
          this.el.silenceSkipBadge.hidden = true;
        }
      },

      /** Measures the audio level each frame and speeds playback up while the audio stays silent. */
      tickSilenceSkip() {
        const { analyser, buffer } = this.silenceSkip;
        const video = this.el.video;
        if (!analyser || !buffer || !this.silenceSkip.enabled) return;
        if (video.paused || video.ended || !video.duration || this.state.isDragging) {
          this.resetSilenceState();
          return;
        }
        analyser.getFloatTimeDomainData(buffer);
        let s = 0;
        for (let i = 0; i < buffer.length; i++) s += buffer[i] * buffer[i];
        const rms = Math.sqrt(s / buffer.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        if (db < this.silenceSkip.thresholdDb) {
          this.silenceSkip.silentFor += 100;
          if (!this.silenceSkip.active && this.silenceSkip.silentFor >= this.silenceSkip.activateAfterMs) {
            this.silenceSkip.active = true;
            this.silenceSkip.preSkipRate = video.playbackRate;
            video.playbackRate = Math.max(this.silenceSkip.skipRate, video.playbackRate);
            this.el.silenceSkipBadge.hidden = false;
          }
        } else {
          this.silenceSkip.silentFor = 0;
          if (this.silenceSkip.active) {
            video.playbackRate = this.silenceSkip.preSkipRate || 1;
            this.silenceSkip.active = false;
            this.el.silenceSkipBadge.hidden = true;
          }
        }
      },

      setSleepMode(m) {
        if (this.state.sleepTimer) clearTimeout(this.state.sleepTimer);
        this.state.sleepMode = m;
        document
          .querySelectorAll('#sleepMenu [data-sleep]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-sleep') === m));
        if (m === 'off') return;
        if (m === 'end') {
          this.announce('Pause at end of video');
          return;
        }
        const min = Number(m);
        if (!min) return;
        this.state.sleepTimer = setTimeout(() => this.pauseForSleep(), min * 60000);
        this.announce(`Sleep in ${min} min`);
      },

      pauseForSleep() {
        this.el.video.pause();
        this.announce('Sleep timer');
        this.setSleepMode('off');
      },
    };
  })(),
);
