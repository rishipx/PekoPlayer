// Player: Subtitle styling, timing, parsing and embedded track handling
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Reflects the caption style in the subtitle settings controls. */
      syncSubtitleSettingsUI() {
        const el = this.el;
        const s = this.subtitleStyle;
        if (el.subNativeRow) {
          el.subNativeRow.classList.toggle('on', s.native);
          el.subNativeRow.setAttribute('aria-checked', String(s.native));
        }
        if (el.subPastelRow) {
          el.subPastelRow.classList.toggle('on', s.pastel);
          el.subPastelRow.setAttribute('aria-checked', String(s.pastel));
        }
        if (el.subDelaySlider) {
          el.subDelaySlider.value = String(s.delay);
          el.subDelayValue.textContent = `${s.delay.toFixed(1)} s`;
          el.subDelayBoxValue.textContent = s.delay.toFixed(1);
        }
        if (el.capFontGroup)
          el.capFontGroup
            .querySelectorAll('button')
            .forEach((b) => b.classList.toggle('active', b.getAttribute('data-font') === s.font));
        if (el.capSizeSlider) {
          el.capSizeSlider.value = String(s.size);
          el.capSizeValue.textContent = `${s.size}%`;
        }
        if (el.capPositionSlider) {
          el.capPositionSlider.value = String(s.position);
          el.capPositionValue.textContent = s.position <= 15 ? 'Default' : s.position >= 60 ? 'High' : 'Elevated';
        }
        if (el.capBgToggleRow) {
          const has = s.bg !== 'none';
          el.capBgToggleRow.classList.toggle('on', has);
          el.capBgToggleRow.setAttribute('aria-checked', String(has));
        }
        if (el.capColorSwatches)
          el.capColorSwatches
            .querySelectorAll('button[data-color]')
            .forEach((b) =>
              b.classList.toggle(
                'active',
                (b.getAttribute('data-color') || '').toLowerCase() === s.color.toLowerCase(),
              ),
            );
      },

      setSubtitleStyle(patch) {
        Object.assign(this.subtitleStyle, patch);
        this.applySubtitleStyle();
        this.syncSubtitleSettingsUI();
        this.saveSettings();
      },

      /** Applies the caption style (size, position, font and colors) as CSS variables on the caption element. */
      applySubtitleStyle() {
        const { captionsCue } = this.el;
        const s = this.subtitleStyle;
        const sizePx = Math.round((s.size / 100) * 16);
        captionsCue.style.setProperty('--caption-size', `${sizePx}px`);
        captionsCue.style.setProperty('--caption-bottom', `${s.position}%`);
        captionsCue.style.setProperty('--caption-font-family', CAPTION_FONTS[s.font] || CAPTION_FONTS.inter);
        let bg, color;
        if (s.pastel) {
          bg = s.bg === 'none' ? 'transparent' : s.bg === 'solid' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)';
          color = s.color === '#ffffff' ? '#1a1a1c' : s.color;
        } else {
          bg = s.bg === 'none' ? 'transparent' : s.bg === 'solid' ? 'rgba(0,0,0,0.92)' : 'rgba(0,0,0,0.7)';
          color = s.color;
        }
        captionsCue.style.setProperty('--caption-color', color);
        captionsCue.style.setProperty('--caption-bg', bg);
        captionsCue.style.setProperty('--caption-pad', s.bg === 'none' ? '0' : '4px 12px');
        captionsCue.style.setProperty(
          '--caption-shadow',
          s.edge === 'outline'
            ? '-1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000, 1px 1px 2px #000'
            : s.edge === 'drop'
              ? '0 2px 4px rgba(0,0,0,0.9)'
              : 'none',
        );
        document.querySelectorAll('video track').forEach((trackEl) => {
          const tt = trackEl.track;
          if (!tt) return;
          const isActive = trackEl.dataset.trackId === this.playlist[this.currentIndex]?.activeTrackId;
          if (s.native) tt.mode = isActive ? 'showing' : 'disabled';
          else tt.mode = isActive ? 'hidden' : 'disabled';
        });
        if (s.native) captionsCue.classList.add('native-hidden');
        else {
          captionsCue.classList.remove('native-hidden');
          if (this._lastAppliedNative !== s.native) this.bindCueRendering();
        }
        this._lastAppliedNative = s.native;
      },

      resetSubtitleStyle() {
        this.subtitleStyle = {
          size: 100,
          color: '#ffffff',
          bg: 'semi',
          edge: 'outline',
          position: 12,
          font: 'inter',
          pastel: false,
          native: false,
          delay: 0,
        };
        this.applySubtitleStyle();
        this.syncSubtitleSettingsUI();
        this.saveSettings();
      },

      adjustSubtitleDelay(delta) {
        const n = Math.max(-10, Math.min(10, this.subtitleStyle.delay + delta));
        this.setSubtitleStyle({ delay: n });
        this._applySubtitleDelayToCues();
      },

      /** Shifts the cue times of the active track by the configured subtitle delay. */
      _applySubtitleDelayToCues() {
        const item = this.playlist[this.currentIndex];
        if (!item || !item.activeTrackId) return;
        const trackEl = Array.from(this.el.video.querySelectorAll('track')).find(
          (t) => t.dataset.trackId === item.activeTrackId,
        );
        if (!trackEl?.track?.cues) return;
        const shift = this.subtitleStyle.delay;
        const current = parseFloat(trackEl.dataset.appliedDelay || '0');
        const d = shift - current;
        if (Math.abs(d) < 0.001) return;
        Array.from(trackEl.track.cues).forEach((cue) => {
          cue.startTime = Math.max(0, cue.startTime + d);
          cue.endTime = Math.max(0, cue.endTime + d);
        });
        trackEl.dataset.appliedDelay = String(shift);
        const tt = trackEl.track;
        if (tt && tt.mode === 'hidden') {
          const captionsCue = this.el.captionsCue,
            cues = tt.activeCues;
          if (cues && cues.length) {
            captionsCue.textContent = Array.from(cues)
              .map((c) => c.text.replace(/<[^>]+>/g, ''))
              .join('\n');
            captionsCue.classList.add('visible');
          } else captionsCue.classList.remove('visible');
        }
        if (this.state.syncTranscriptOn) this._syncScrollThrottled();
      },

      parseSubtitleText(text, filename) {
        let vttText = text;
        if (/\.srt$/i.test(filename)) vttText = this.srtToVtt(text);
        else if (!/^WEBVTT/.test(vttText.trim())) vttText = 'WEBVTT\n\n' + vttText;
        return { vttText, cues: this.parseVttCues(vttText) };
      },

      /** Parses WebVTT text into an array of cues. */
      parseVttCues(vttText) {
        const cues = [];
        const blocks = vttText.replace(/\r+/g, '').split(/\n\n+/);
        const timeRe = /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*-->\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/;
        for (const block of blocks) {
          const lines = block
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          let idx = -1;
          for (let i = 0; i < lines.length; i++)
            if (timeRe.test(lines[i])) {
              idx = i;
              break;
            }
          if (idx === -1) continue;
          const m = lines[idx].match(timeRe);
          if (!m) continue;
          const tl = lines.slice(idx + 1);
          if (!tl.length) continue;
          cues.push({
            start: timecodeToSeconds(m[1]),
            end: timecodeToSeconds(m[2]),
            text: tl.join('\n'),
          });
        }
        return cues;
      },

      srtToVtt(srtText) {
        return (
          'WEBVTT\n\n' +
          srtText
            .replace(/\r+/g, '')
            .replace(/^\uFEFF/, '')
            .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2})/gm, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
        );
      },

      applySubtitleTracksForItem(item) {
        const video = this.el.video;
        Array.from(video.querySelectorAll('track')).forEach((t) => t.remove());
        item.tracks.forEach((track) => {
          const te = document.createElement('track');
          te.kind = 'subtitles';
          te.label = track.label;
          te.srclang = track.srclang || 'en';
          te.src = track.url;
          te.dataset.trackId = track.id;
          video.appendChild(te);
        });
        this.setActiveTrack(item.activeTrackId);
        this.renderCaptionsMenu();
        this.updateCaptionsButtonState();
        this.detectEmbeddedTracks();
      },

      /** Shows the audio-track and embedded-subtitle selectors when the media has more than one track. */
      detectEmbeddedTracks() {
        const video = this.el.video;
        const audioRow = this.el.audioTrackRow,
          audioSel = this.el.audioTrackSelect;
        if (audioRow && audioSel && video.audioTracks && video.audioTracks.length > 1) {
          audioRow.hidden = false;
          audioSel.innerHTML = '';
          const at = video.audioTracks;
          for (let i = 0; i < at.length; i++) {
            const t = at[i];
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = t.label || t.language || `Audio ${i + 1}`;
            if (t.enabled) o.selected = true;
            audioSel.appendChild(o);
          }
          audioSel.onchange = () => {
            const idx = Number(audioSel.value);
            for (let i = 0; i < at.length; i++) at[i].enabled = i === idx;
          };
        } else if (audioRow) audioRow.hidden = true;
        this.embeddedTracksCache = [];
        if (video.textTracks)
          for (let i = 0; i < video.textTracks.length; i++) {
            const tt = video.textTracks[i];
            const attached = Array.from(video.querySelectorAll('track')).find((t) => t.track === tt);
            if (!attached)
              this.embeddedTracksCache.push({ tt, label: tt.label || tt.language || `Embedded CC ${i + 1}` });
          }
      },

      renderEmbeddedTracksMenu() {
        const list = this.el.embeddedTextList;
        if (!list) return;
        list.innerHTML = '';
        const tracks = this.embeddedTracksCache || [];
        tracks.forEach(({ tt, label }) => {
          const row = document.createElement('div');
          row.className = 'cm-item' + (tt.mode !== 'disabled' ? ' active' : '');
          row.innerHTML = `<span>${PekoUtils.escapeHtml(label)}</span>`;
          row.addEventListener('click', () => {
            this.setActiveTrack(null);
            for (const t of this.embeddedTracksCache) t.tt.mode = t.tt === tt ? 'hidden' : 'disabled';
            this.bindCueRendering();
            this.closeCaptionsMenu();
          });
          list.appendChild(row);
        });
      },
    };
  })(),
);
