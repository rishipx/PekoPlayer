// Player: Caption track selection, cue rendering and caption menu
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      updateCaptionsButtonState() {
        const item = this.playlist[this.currentIndex];
        const active =
          !!(item && item.activeTrackId) ||
          !!(this.embeddedTracksCache && this.embeddedTracksCache.some((t) => t.tt.mode !== 'disabled'));
        this.el.captionsBtn.classList.toggle('active', active);
        this.el.captionsBtn.setAttribute('aria-pressed', String(active));
      },

      /** Makes a subtitle track the active one (or turns captions off) and saves the choice. */
      setActiveTrack(trackId) {
        const video = this.el.video;
        const item = this.playlist[this.currentIndex];
        if (!item) return;
        item.activeTrackId = trackId;
        this.persistItemField(item.id, { activeTrackId: trackId });
        Array.from(video.textTracks).forEach((tt) => {
          const trackEl = Array.from(video.querySelectorAll('track')).find((t) => t.track === tt);
          const id = trackEl?.dataset.trackId;
          const isThis = id === trackId;
          if (this.subtitleStyle.native) tt.mode = isThis ? 'showing' : 'disabled';
          else tt.mode = isThis ? 'hidden' : 'disabled';
        });
        if (this.embeddedTracksCache)
          this.embeddedTracksCache.forEach((t) => {
            t.tt.mode = 'disabled';
          });
        this.bindCueRendering();
        if (!trackId) {
          this.el.captionsCue.classList.remove('visible');
          this.el.captionsCue.textContent = '';
        }
        this.renderCaptionsMenu();
        this.updateCaptionsButtonState();
        this._indexDebounced();
        const trackEl = Array.from(video.querySelectorAll('track')).find((t) => t.dataset.trackId === trackId);
        if (trackEl) trackEl.dataset.appliedDelay = '0';
        if (this.subtitleStyle.delay !== 0) setTimeout(() => this._applySubtitleDelayToCues(), 50);
      },

      bindCueRendering() {
        const video = this.el.video,
          captionsCue = this.el.captionsCue;
        Array.from(video.textTracks).forEach((tt) => {
          tt.oncuechange = null;
          if (tt.mode === 'hidden')
            tt.oncuechange = () => {
              const cues = tt.activeCues;
              if (cues && cues.length) {
                captionsCue.textContent = Array.from(cues)
                  .map((c) => c.text.replace(/<[^>]+>/g, ''))
                  .join('\n');
                captionsCue.classList.add('visible');
              } else captionsCue.classList.remove('visible');
            };
        });
      },

      /** Renders the list of subtitle tracks in the captions menu. */
      renderCaptionsMenu() {
        const { captionsList, captionsEmpty, captionsMenu } = this.el;
        const item = this.playlist[this.currentIndex];
        captionsList.innerHTML = '';
        const offBtn = captionsMenu.querySelector('[data-track="off"]');
        if (!item || item.tracks.length === 0) {
          captionsEmpty.style.display = '';
          offBtn?.classList.add('active');
        } else {
          captionsEmpty.style.display = 'none';
          offBtn?.classList.toggle('active', !item.activeTrackId);
          item.tracks.forEach((track) => {
            const row = document.createElement('div');
            row.className = 'cm-item' + (item.activeTrackId === track.id ? ' active' : '');
            row.setAttribute('role', 'menuitemradio');
            row.innerHTML = `<span>${this.escapeHtml(track.label)}</span><button class="cm-remove" aria-label="Remove">✕</button>`;
            row.addEventListener('click', () => {
              this.setActiveTrack(track.id);
              this.closeCaptionsMenu();
            });
            row.querySelector('.cm-remove')?.addEventListener('click', (e) => {
              e.stopPropagation();
              this.removeSubtitleTrack(track.id);
            });
            captionsList.appendChild(row);
          });
        }
        if (offBtn)
          offBtn.onclick = () => {
            this.setActiveTrack(null);
            if (this.embeddedTracksCache) this.embeddedTracksCache.forEach((t) => (t.tt.mode = 'disabled'));
            this.closeCaptionsMenu();
          };
      },

      /** Removes a subtitle track from the current item and releases its object URL. */
      removeSubtitleTrack(trackId) {
        const item = this.playlist[this.currentIndex];
        if (!item) return;
        const wasActive = item.activeTrackId === trackId;
        const track = item.tracks.find((t) => t.id === trackId);
        if (track) URL.revokeObjectURL(track.url);
        item.tracks = item.tracks.filter((t) => t.id !== trackId);
        if (wasActive) item.activeTrackId = null;
        this.persistItemField(item.id, {
          tracks: item.tracks.map((t) => ({
            id: t.id,
            label: t.label,
            blob: t.blob,
          })),
          activeTrackId: item.activeTrackId,
        });
        this.applySubtitleTracksForItem(item);
        this.renderPlaylist();
        this.updateCaptionsButtonState();
        if (wasActive || !item.activeTrackId) {
          this.el.captionsCue.classList.remove('visible');
          this.el.captionsCue.textContent = '';
        }
        this._indexDebounced();
      },
    };
  })(),
);
