// Player: A-B loop and equalizer
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      toggleAbLoopPoint() {
        const video = this.el.video;
        if (!video.duration) return;
        if (this.state.loopA == null) {
          this.state.loopA = video.currentTime;
          this.el.abLoopBtn.classList.add('active');
          this.announce(`A set at ${this.formatTime(this.state.loopA)}`);
        } else if (this.state.loopB == null) {
          if (video.currentTime <= this.state.loopA + 0.2) {
            this.announce('Move playhead past A to set B');
            return;
          }
          this.state.loopB = video.currentTime;
          this.announce(`B set at ${this.formatTime(this.state.loopB)} · loop active`);
          video.currentTime = this.state.loopA;
        } else {
          this.clearAbLoop();
          this.announce('A/B loop cleared');
          return;
        }
        this.updateAbLoopMarkers();
      },

      clearAbLoop() {
        this.state.loopA = null;
        this.state.loopB = null;
        this.el.abLoopBtn.classList.remove('active');
        this.updateAbLoopMarkers();
      },

      /** Positions the A and B markers and the loop range on the progress bar and updates the loop badge. */
      updateAbLoopMarkers() {
        const video = this.el.video,
          dur = video.duration,
          scrubber = this.el.progressContainer,
          badge = this.el.abLoopBadge;
        if (!dur) {
          this.el.abMarkerA.hidden = this.el.abMarkerB.hidden = this.el.abLoopRange.hidden = true;
          if (badge) badge.classList.remove('visible');
          scrubber.classList.remove('ab-active');
          return;
        }
        const hasA = this.state.loopA != null,
          hasB = this.state.loopB != null;
        if (hasA) {
          this.el.abMarkerA.hidden = false;
          this.el.abMarkerA.style.left = `${(this.state.loopA / dur) * 100}%`;
        } else this.el.abMarkerA.hidden = true;
        if (hasB) {
          this.el.abMarkerB.hidden = false;
          this.el.abMarkerB.style.left = `${(this.state.loopB / dur) * 100}%`;
        } else this.el.abMarkerB.hidden = true;
        if (hasA && hasB) {
          const l = this.state.loopB - this.state.loopA;
          this.el.abLoopRange.hidden = false;
          this.el.abLoopRange.style.left = `${(this.state.loopA / dur) * 100}%`;
          this.el.abLoopRange.style.width = `${(l / dur) * 100}%`;
          this.el.abLoopDuration.textContent = `A→B ${this.formatTime(l)}`;
          this.el.abLoopValue.textContent = this.formatTime(l);
          scrubber.classList.add('ab-active');
          if (badge) badge.classList.add('visible');
          this._updateAbLoopBadge();
        } else {
          this.el.abLoopRange.hidden = true;
          this.el.abLoopDuration.textContent = '';
          this.el.abLoopValue.textContent = hasA ? 'A set' : '—';
          scrubber.classList.remove('ab-active');
          if (badge) badge.classList.remove('visible');
        }
      },

      _updateAbLoopBadge() {
        const badge = this.el.abLoopBadge;
        if (!badge) return;
        const video = this.el.video,
          a = this.state.loopA,
          b = this.state.loopB;
        if (a == null || b == null) return;
        const total = b - a,
          t = video.currentTime;
        const elapsed = Math.max(0, Math.min(total, t - a));
        const remaining = Math.max(0, total - elapsed);
        if (this.el.abLoopBadgeElapsed) this.el.abLoopBadgeElapsed.textContent = this.formatTime(elapsed);
        if (this.el.abLoopBadgeTotal) this.el.abLoopBadgeTotal.textContent = this.formatTime(total);
        if (this.el.abLoopBadgeRemaining)
          this.el.abLoopBadgeRemaining.textContent = `· ${this.formatTime(remaining)} left`;
      },

      setEqBass(d) {
        this.eq.bass = Math.min(12, Math.max(-12, d));
        if (this.ensureAudioGraph() && this.bassFilter) this.bassFilter.gain.value = this.eq.bass;
        this.syncEqUI();
        this.saveSettings();
      },

      setEqMid(d) {
        this.eq.mid = Math.min(12, Math.max(-12, d));
        if (this.ensureAudioGraph() && this.midFilter) this.midFilter.gain.value = this.eq.mid;
        this.syncEqUI();
        this.saveSettings();
      },

      setEqTreble(d) {
        this.eq.treble = Math.min(12, Math.max(-12, d));
        if (this.ensureAudioGraph() && this.trebleFilter) this.trebleFilter.gain.value = this.eq.treble;
        this.syncEqUI();
        this.saveSettings();
      },

      setEqPreset(id) {
        const p = PekoEq.PRESETS.find((x) => x.id === id);
        if (!p) return;
        this.eq = {
          bass: p.bass,
          mid: p.mid,
          treble: p.treble,
        };
        if (this.ensureAudioGraph() && this.bassFilter && this.midFilter && this.trebleFilter) {
          this.bassFilter.gain.value = this.eq.bass;
          this.midFilter.gain.value = this.eq.mid;
          this.trebleFilter.gain.value = this.eq.treble;
        }
        this.syncEqUI();
        this.saveSettings();
      },

      /** Reflects the equalizer values in the sliders and labels. */
      syncEqUI() {
        const { eqBass, eqMid, eqTreble, eqBassValue, eqMidValue, eqTrebleValue, eqPreset, eqNavValue } = this.el;
        if (!eqBass) return;
        eqBass.value = String(this.eq.bass);
        eqMid.value = String(this.eq.mid);
        eqTreble.value = String(this.eq.treble);
        eqBassValue.textContent = `${this.eq.bass > 0 ? '+' : ''}${this.eq.bass}dB`;
        eqMidValue.textContent = `${this.eq.mid > 0 ? '+' : ''}${this.eq.mid}dB`;
        eqTrebleValue.textContent = `${this.eq.treble > 0 ? '+' : ''}${this.eq.treble}dB`;
        if (eqPreset) {
          const m = PekoEq.matchPreset(this.eq);
          if (m === 'custom' && !eqPreset.querySelector('option[value="custom"]')) {
            const o = document.createElement('option');
            o.value = 'custom';
            o.textContent = 'Custom';
            eqPreset.appendChild(o);
          }
          eqPreset.value = m;
        }
        if (eqNavValue) {
          const m = PekoEq.matchPreset(this.eq);
          const p = PekoEq.PRESETS.find((x) => x.id === m);
          eqNavValue.textContent = p ? p.name : 'Custom';
        }
      },
    };
  })(),
);
