// Player: Volume, mute, speed, shuffle and loop modes
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      applyVolumeToMedia() {
        const v = this.el.video;
        if (!v) return;
        if (this.audioGraphReady && this.gainNode) {
          this.gainNode.gain.value = this.isMuted ? 0 : this.volumeLevel;
          if (v.muted) v.muted = false;
          if (v.volume !== 1) v.volume = 1;
        } else {
          v.muted = this.isMuted;
          v.volume = Math.min(1, this.isMuted ? 0 : this.volumeLevel);
        }
      },

      /** Builds the Web Audio graph (gain and equalizer) on first use and resumes it if the browser suspended it. Returns false when Web Audio is unavailable. */
      ensureAudioGraph() {
        if (this.audioGraphReady) {
          if (this.audioCtx?.state === 'suspended') this.audioCtx.resume().catch(() => {});
          return true;
        }
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return false;
          this.audioCtx = new Ctx();
          this.audioSource = this.audioCtx.createMediaElementSource(this.el.video);
          const { filters, output } = PekoEq.buildChain(this.audioCtx, this.audioSource);
          this.bassFilter = filters.bass;
          this.midFilter = filters.mid;
          this.trebleFilter = filters.treble;
          this.gainNode = this.audioCtx.createGain();
          output.connect(this.gainNode).connect(this.audioCtx.destination);
          this.bassFilter.gain.value = this.eq.bass;
          this.midFilter.gain.value = this.eq.mid;
          this.trebleFilter.gain.value = this.eq.treble;
          this.gainNode.gain.value = this.isMuted ? 0 : this.volumeLevel;
          this.el.video.volume = 1;
          this.el.video.muted = false;
          this.audioCtx.resume().catch(() => {});
          this.audioGraphReady = true;
          this.applyVolumeToMedia();
          return true;
        } catch {
          this.audioGraphReady = false;
          return false;
        }
      },

      setVolume(l) {
        const c = Math.min(2, Math.max(0, l));
        this.volumeLevel = c;
        this.isMuted = false;
        this.ensureAudioGraph();
        this.applyVolumeToMedia();
        this.syncVolumeUI();
        this.showVolumeOverlay();
        this.saveSettings();
      },

      toggleMute() {
        this.isMuted = !this.isMuted;
        this.ensureAudioGraph();
        this.applyVolumeToMedia();
        this.syncVolumeUI();
        this.showVolumeOverlay();
        this.saveSettings();
      },

      /** Updates the volume slider, icon, percentage and overlay to match the current volume and mute state. */
      syncVolumeUI() {
        const { volumeSlider, muteBtn, volumeFill, volumeText, volumeIcon, volumeOverlay } = this.el;
        const effective = this.isMuted ? 0 : this.volumeLevel;
        const pct = Math.round(effective * 100);
        const ib = pct > 100,
          im = pct === 0;
        const tp = Math.min(100, (pct / 200) * 100),
          hm = 50;
        volumeSlider.value = String(pct);
        if (volumeText) volumeText.textContent = String(pct);
        const as = Math.min(tp, hm);
        volumeSlider.style.background = ib
          ? `linear-gradient(to right, #fff 0%, #fff ${hm}%, var(--boost) ${hm}%, var(--boost) ${tp}%, rgba(255,255,255,0.22) ${tp}%, rgba(255,255,255,0.22) 100%)`
          : `linear-gradient(to right, #fff 0%, #fff ${as}%, rgba(255,255,255,0.22) ${as}%, rgba(255,255,255,0.22) 100%)`;
        if (volumeFill) volumeFill.style.width = `${tp}%`;
        const svg = muteBtn.querySelector('.vol-icon');
        if (!svg) return;
        const sh = (el, h) => {
          if (!el) return;
          if (h) el.setAttribute('hidden', '');
          else el.removeAttribute('hidden');
        };
        sh(svg.querySelector('.vol-wave-1'), im);
        sh(svg.querySelector('.vol-wave-2'), im || pct < 40);
        sh(svg.querySelector('.vol-mute-x'), !im);
        muteBtn.classList.toggle('is-muted', im);
        muteBtn.classList.toggle('is-boost', ib);
        if (volumeIcon) volumeIcon.innerHTML = svg.outerHTML;
        if (volumeOverlay) {
          volumeOverlay.classList.toggle('muted', im);
          volumeOverlay.classList.toggle('boosted', ib);
        }
      },

      showVolumeOverlay() {
        this.el.volumeOverlay.classList.add('visible');
        clearTimeout(this.timers.volumeOverlay);
        this.timers.volumeOverlay = setTimeout(() => this.el.volumeOverlay.classList.remove('visible'), 900);
      },

      setSpeed(r) {
        if (this.silenceSkip.active) {
          this.silenceSkip.active = false;
          this.el.silenceSkipBadge.hidden = true;
        }
        this.silenceSkip.preSkipRate = r;
        this.el.video.playbackRate = r;
        this.announce(`Speed ${r}×`);
        this.saveSettings();
      },

      toggleShuffle() {
        this.shuffleOn = !this.shuffleOn;
        if (this.shuffleOn) {
          this.playbackOrder = [];
          this.playbackOrderIndex = -1;
        }
        this._syncShuffleUI();
        this.saveSettings();
      },

      setLoopMode(m) {
        this.loopMode = m;
        this.syncLoopUI();
        this.saveSettings();
      },

      syncLoopUI() {
        document
          .querySelectorAll('#settingsMenu [data-loop]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-loop') === this.loopMode));
      },
    };
  })(),
);
