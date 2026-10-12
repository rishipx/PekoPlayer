// Player: Playlist playback, navigation, rendering, carousel and ordering
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Switches to a playlist item: saves the resume position of the current one, then loads the new source. */
      playItemAtIndex(index, opts = {}) {
        if (index < 0 || index >= this.playlist.length) return;
        const autoResume = opts.autoResume === true;
        this.saveResumePosition();
        this.resetSilenceState();
        this.hideResumeToast();
        this.currentIndex = index;
        const item = this.playlist[index];
        const video = this.el.video;
        const stage = this.el.stage;
        stage.classList.add('has-media');
        video.src = item.url;
        video.load();
        this.el.captionsCue.classList.remove('visible');
        this.el.captionsCue.textContent = '';
        this.applySubtitleTracksForItem(item);
        this.state.rotation = 0;
        this.state.zoom = 1;
        this.state.panX = 0;
        this.state.panY = 0;
        this.el.stage.classList.remove('zoomed');
        this.applyRotation();
        this.clearAbLoop();
        this._clearTranscriptIndex();
        this.renderBookmarks();
        if (item.chapters && item.chapters.length) {
          this.chapters = item.chapters.slice();
          this._renderChapters();
          this._updateSearchStatus();
        }
        const resumeMap = this.getResumeMap();
        const saved = resumeMap[this.resumeKey(item)];
        const hasValidResume = saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5;
        const tryPlay = () => video.play().catch(() => {});
        if (hasValidResume && autoResume)
          video.addEventListener(
            'loadedmetadata',
            () => {
              if (video.duration && saved.time < video.duration - 1) video.currentTime = saved.time;
              video.play().catch(() => {});
            },
            { once: true },
          );
        else if (hasValidResume) {
          this.showResumeToast(item, saved.time);
          video.addEventListener('loadedmetadata', tryPlay, { once: true });
        } else video.addEventListener('loadedmetadata', tryPlay, { once: true });
        this.updateStageTitle();
        this.renderPlaylist();
        this.renderPlaylistCarousel();
        this.savePlaylistOrderMeta();
        this.updateSearchSubsLink();
      },

      updateStageTitle() {
        const el = this.el.stageTitle;
        if (!el) return;
        const item = this.playlist[this.currentIndex];
        el.textContent = item ? item.name.replace(/\.[^.]+$/, '') : '';
      },

      showResumeToast(item, time) {
        const { resumeText, resumeToast, resumeCountdown } = this.el;
        this.state.resumeCandidateTime = time;
        resumeText.textContent = `Resume "${this.truncate(item.name, 28)}" from ${this.formatTime(time)}?`;
        resumeToast.hidden = false;
        clearInterval(this.state.resumeCountdownTimer);
        let s = 6;
        resumeCountdown.textContent = s;
        this.state.resumeCountdownTimer = setInterval(() => {
          s--;
          if (s <= 0) {
            clearInterval(this.state.resumeCountdownTimer);
            this.state.resumeCountdownTimer = null;
            if (!resumeToast.hidden) this.applyResume(false);
            return;
          }
          resumeCountdown.textContent = s;
        }, 1000);
      },

      hideResumeToast() {
        this.el.resumeToast.hidden = true;
        clearInterval(this.state.resumeCountdownTimer);
        this.state.resumeCountdownTimer = null;
      },

      applyResume(sr) {
        const video = this.el.video;
        if (sr) video.currentTime = this.state.resumeCandidateTime;
        this.el.resumeToast.hidden = true;
        clearInterval(this.state.resumeCountdownTimer);
        this.state.resumeCountdownTimer = null;
      },

      playNext(ui) {
        if (!this.playlist.length) return;
        let ni;
        if (this.shuffleOn) ni = this.pickShuffleIndex();
        else {
          ni = this.currentIndex + 1;
          if (ni >= this.playlist.length) {
            if (this.loopMode === 'all') ni = 0;
            else {
              if (ui) this.announce('End of playlist');
              return;
            }
          }
        }
        this.playItemAtIndex(ni, { autoResume: true });
      },

      playPrevious() {
        if (!this.playlist.length) return;
        if (this.el.video.currentTime > 3) {
          this.el.video.currentTime = 0;
          return;
        }
        let p = this.currentIndex - 1;
        if (p < 0) p = this.loopMode === 'all' ? this.playlist.length - 1 : 0;
        this.playItemAtIndex(p, { autoResume: true });
      },

      pickShuffleIndex() {
        if (this.playlist.length === 1) return 0;
        if (this.playbackOrder.length !== this.playlist.length) {
          this.playbackOrder = [...Array(this.playlist.length).keys()];
          for (let i = this.playbackOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playbackOrder[i], this.playbackOrder[j]] = [this.playbackOrder[j], this.playbackOrder[i]];
          }
          this.playbackOrderIndex = -1;
        }
        this.playbackOrderIndex++;
        if (this.playbackOrderIndex >= this.playbackOrder.length) this.playbackOrderIndex = 0;
        const c = this.playbackOrder[this.playbackOrderIndex];
        return c === this.currentIndex ? this.pickShuffleIndex() : c;
      },

      onEnded() {
        this.resetSilenceState();
        if (this.state.sleepMode === 'end') {
          this.pauseForSleep();
          return;
        }
        if (this.loopMode === 'one') {
          this.el.video.currentTime = 0;
          this.el.video.play().catch(() => {});
          return;
        }
        this.clearResumeFor(this.playlist[this.currentIndex]);
        this.playNext(false);
      },

      /** Removes an item and releases its object URLs and cached chapter thumbnails. */
      removeFromPlaylist(index) {
        const item = this.playlist[index];
        if (!item) return;
        URL.revokeObjectURL(item.url);
        item.tracks.forEach((t) => URL.revokeObjectURL(t.url));
        for (const k of [...this._chapterThumbCache.keys()])
          if (k.startsWith(item.id + '::')) this._chapterThumbCache.delete(k);
        this.persistRemoveItem(item.id);
        this.clearResumeFor(item);
        this.playlist.splice(index, 1);
        if (index === this.currentIndex) {
          const video = this.el.video;
          video.pause();
          video.removeAttribute('src');
          this.currentIndex = -1;
          if (this.playlist.length)
            this.playItemAtIndex(Math.min(index, this.playlist.length - 1), { autoResume: true });
          else {
            this.el.stage.classList.remove('has-media');
            video.load();
            this._clearTranscriptIndex();
            this.updateStageTitle();
          }
        } else if (index < this.currentIndex) this.currentIndex--;
        this.renderPlaylist();
        this.renderPlaylistCarousel();
        this.renderCarouselList();
        this.savePlaylistOrderMeta();
      },

      /** Empties the playlist and releases every object URL and the saved order. */
      clearPlaylist() {
        this.playlist.forEach((item) => {
          URL.revokeObjectURL(item.url);
          item.tracks.forEach((t) => URL.revokeObjectURL(t.url));
        });
        this.playlist = [];
        this.currentIndex = -1;
        this._chapterThumbCache.clear();
        const video = this.el.video;
        video.pause();
        video.removeAttribute('src');
        video.load();
        this.el.stage.classList.remove('has-media');
        this.hideResumeToast();
        if (this.db) PekoDB.clear(this.db).catch(() => {});
        try {
          localStorage.removeItem(PekoConfig.STORAGE.order);
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
        this.renderPlaylist();
        this.renderPlaylistCarousel();
        this.renderCarouselList();
        this._clearTranscriptIndex();
        this.updateStageTitle();
        this.announce('Playlist cleared');
      },

      /** Renders the side-panel playlist with the active filter and sort. */
      renderPlaylist() {
        const { playlistItems, playlistEmpty, playlistCount, playlistPanel, playlistStats } = this.el;
        const ps = playlistItems.scrollTop;
        playlistItems.innerHTML = '';
        playlistCount.hidden = this.playlist.length === 0;
        playlistCount.textContent = this.playlist.length;
        playlistPanel.classList.toggle('has-items', this.playlist.length > 0);
        playlistEmpty.style.display = this.playlist.length ? 'none' : '';
        if (this.playlist.length) {
          const ts = this.playlist.reduce((s, i) => s + (i.duration || 0), 0);
          const tb = this.playlist.reduce((s, i) => s + (i.size || 0), 0);
          playlistStats.hidden = false;
          playlistStats.textContent = `${this.playlist.length} video${this.playlist.length > 1 ? 's' : ''} · ${this.formatDurationLong(ts)} · ${this.formatBytes(tb)}`;
        } else playlistStats.hidden = true;
        let rows = this.playlist.map((item, index) => ({ item, index }));
        const q = this.filterText.trim().toLowerCase();
        if (q) rows = rows.filter(({ item }) => item.name.toLowerCase().includes(q));
        if (this.sortMode === 'name') rows.sort((a, b) => a.item.name.localeCompare(b.item.name));
        else if (this.sortMode === 'duration') rows.sort((a, b) => (b.item.duration || 0) - (a.item.duration || 0));
        else if (this.sortMode === 'size') rows.sort((a, b) => (b.item.size || 0) - (a.item.size || 0));
        else if (this.sortMode === 'added') rows.sort((a, b) => (b.item.addedAt || 0) - (a.item.addedAt || 0));
        const manualOrder = this.sortMode === 'manual' && !q;
        if (this.playlist.length && !rows.length) {
          const none = document.createElement('li');
          none.className = 'playlist-no-results';
          none.textContent = `No videos match "${this.filterText}"`;
          playlistItems.appendChild(none);
          playlistItems.scrollTop = ps;
          return;
        }
        const rm = this.getResumeMap();
        const video = this.el.video;
        const frag = document.createDocumentFragment();
        rows.forEach(({ item, index: i }) => {
          const li = document.createElement('li');
          const ic = i === this.currentIndex;
          li.className = 'playlist-item' + (ic ? ' playing' : '');
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', ic ? 'true' : 'false');
          li.draggable = manualOrder;
          li.dataset.index = String(i);
          li.dataset.id = item.id;
          li.title = item.name;
          const dl = item.duration ? this.formatTime(item.duration) : '';
          let pr = 0;
          if (ic) {
            if (video.duration > 0) pr = (video.currentTime / video.duration) * 100;
          } else {
            const saved = rm[this.resumeKey(item)];
            if (saved && saved.duration > 0) pr = (saved.time / saved.duration) * 100;
          }
          const sp = ic || pr > 0.5;
          const th = item.thumbnail
            ? `<img src="${item.thumbnail}" alt="" draggable="false">`
            : `<div class="pi-thumb-fallback">${ic ? '▶' : i + 1}</div>`;
          const badges = [];
          if (item.tracks.length) badges.push('CC');
          if (item.chapters && item.chapters.length) badges.push(`${item.chapters.length} ch`);
          li.innerHTML = `<span class="pi-thumb">${th}<span class="pi-index-badge">${ic ? '▶' : i + 1}</span><span class="pi-thumb-play" aria-hidden="true">${ic ? '❚❚' : '▶'}</span></span><span class="pi-body"><span class="pi-name">${this.escapeHtml(item.name)}</span><span class="pi-meta">${dl ? dl + ' · ' : ''}${this.formatBytes(item.size)}${badges.length ? ' · ' + badges.join(' · ') : ''}</span><span class="pi-progress${sp ? ' is-active' : ''}"><span class="pi-progress-fill" style="width:${pr}%"></span></span></span><span class="pi-actions"><button class="pi-remove" aria-label="Remove" title="Remove">✕</button></span>`;
          li.addEventListener('click', (e) => {
            if (e.target.closest('.pi-actions')) return;
            this.playItemAtIndex(i, { autoResume: true });
          });
          li.querySelector('.pi-remove')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromPlaylist(i);
          });
          if (manualOrder) {
            li.addEventListener('dragstart', (e) => {
              e.dataTransfer?.setData('text/plain', String(i));
            });
            li.addEventListener('dragover', (e) => {
              e.preventDefault();
              li.classList.add('drag-over');
            });
            li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
            li.addEventListener('drop', (e) => {
              e.preventDefault();
              li.classList.remove('drag-over');
              const from = Number(e.dataTransfer?.getData('text/plain'));
              this.reorderPlaylist(from, i);
            });
          }
          frag.appendChild(li);
        });
        playlistItems.appendChild(frag);
        playlistItems.scrollTop = ps;
        this.updateStageTitle();
        this._syncSortUI();
      },

      _carouselBadge(item, index) {
        const m = (item.name || '').match(/[Ss](\d+)[\s._-]*[Ee](\d+)/);
        if (m) return `S${m[1]}E${m[2]}`;
        const m2 = (item.name || '').match(/(?:^|[\s._-])(\d{1,3})(?:[\s._-]|$)/);
        if (m2 && Number(m2[1]) <= 999) return `#${m2[1]}`;
        return `#${index + 1}`;
      },

      /** Renders the carousel of playlist cards, including drag to reorder. */
      renderPlaylistCarousel() {
        const track = this.el.plcTrack;
        if (!track) return;
        track.innerHTML = '';
        const titleText = this.el.plcTitleText;
        if (titleText)
          titleText.textContent = this.playlist.length
            ? `Playlist · ${this.playlist.length} item${this.playlist.length > 1 ? 's' : ''}`
            : 'Playlist';
        if (!this.playlist.length) {
          const empty = document.createElement('div');
          empty.className = 'plc-empty';
          empty.textContent = 'Queue is empty — drop video files anywhere to start.';
          track.appendChild(empty);
          this._syncSortUI();
          return;
        }
        const rm = this.getResumeMap();
        const video = this.el.video;
        const frag = document.createDocumentFragment();
        const rows = this._getSortedPlaylist();
        const manual = this.sortMode === 'manual';
        rows.forEach(({ item, index: i }) => {
          const ic = i === this.currentIndex;
          const card = document.createElement('div');
          card.className = 'plc-card' + (ic ? ' playing' : '');
          card.dataset.index = String(i);
          card.dataset.id = item.id;
          card.setAttribute('role', 'listitem');
          card.setAttribute('tabindex', '0');
          card.draggable = manual;
          card.title = item.name;
          const dur = item.duration ? this.formatTime(item.duration) : '';
          const size = this.formatBytes(item.size);
          const meta = [dur, size].filter(Boolean).join(' · ');
          const extra = [];
          if (item.tracks.length) extra.push('CC');
          if (item.chapters && item.chapters.length) extra.push(`${item.chapters.length} ch`);
          const desc = [meta, extra.join(' · ')].filter(Boolean).join(' · ');
          const thumbInner = item.thumbnail
            ? `<img src="${item.thumbnail}" alt="" draggable="false">`
            : `<div class="plc-thumb-fallback">${ic ? '▶' : i + 1}</div>`;
          let pr = 0;
          if (ic) {
            if (video.duration > 0) pr = (video.currentTime / video.duration) * 100;
          } else {
            const saved = rm[this.resumeKey(item)];
            if (saved && saved.duration > 0) pr = (saved.time / saved.duration) * 100;
          }
          card.innerHTML = `
        <div class="plc-thumb">
          ${thumbInner}
          <span class="plc-badge">${this._carouselBadge(item, i)}${ic ? ' · Now Playing' : ''}</span>
          <button class="plc-remove" aria-label="Remove from playlist" title="Remove" draggable="false">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <div class="plc-play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg></div>
          <div class="plc-progress"><div class="plc-progress-fill" style="width:${pr}%"></div></div>
        </div>
        <div class="plc-info">
          <div class="plc-name">${this.escapeHtml(item.name.replace(/\.[^.]+$/, ''))}</div>
          <div class="plc-desc">${this.escapeHtml(desc || 'Ready to play')}</div>
        </div>`;
          card.addEventListener('click', (e) => {
            if (e.target.closest('.plc-remove')) return;
            if (i === this.currentIndex) {
              const v = this.el.video;
              if (v.paused) v.play().catch(() => {});
              else v.pause();
            } else this.playItemAtIndex(i, { autoResume: true });
          });
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              card.click();
            }
          });
          card.querySelector('.plc-remove')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromPlaylist(i);
          });
          if (manual) {
            card.addEventListener('dragstart', (e) => {
              if (e.target.closest('.plc-remove')) {
                e.preventDefault();
                return;
              }
              card.classList.add('dragging');
              try {
                e.dataTransfer.setData('text/plain', String(i));
                e.dataTransfer.effectAllowed = 'move';
              } catch {
                // Some drag sources do not allow setting drag data: the drag still works.
              }
            });
            card.addEventListener('dragend', () => card.classList.remove('dragging'));
            card.addEventListener('dragover', (e) => {
              e.preventDefault();
              try {
                e.dataTransfer.dropEffect = 'move';
              } catch {
                // Some drag sources do not allow setting the drop effect.
              }
              card.classList.add('drag-over');
            });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', (e) => {
              e.preventDefault();
              card.classList.remove('drag-over');
              const from = Number(e.dataTransfer?.getData('text/plain'));
              if (Number.isFinite(from) && from !== i) {
                this.reorderPlaylist(from, i);
                this.renderPlaylistCarousel();
                this.renderCarouselList();
                this.renderPlaylist();
              }
            });
          }
          frag.appendChild(card);
        });
        track.appendChild(frag);
        this._syncSortUI();
      },

      /** Renders the carousel's searchable list view. */
      renderCarouselList() {
        const list = this.el.plcList;
        if (!list) return;
        list.innerHTML = '';
        if (!this.playlist.length) {
          const li = document.createElement('li');
          li.className = 'plc-empty';
          li.style.minHeight = '60px';
          li.textContent = 'Queue is empty';
          list.appendChild(li);
          return;
        }
        const q = (this.el.plcListSearch?.value || '').trim().toLowerCase();
        const rows = this._getSortedPlaylist().filter(({ item }) => !q || item.name.toLowerCase().includes(q));
        const manual = this.sortMode === 'manual';
        const frag = document.createDocumentFragment();
        rows.forEach(({ item, index: i }) => {
          const li = document.createElement('li');
          li.className = 'plc-list-item' + (i === this.currentIndex ? ' playing' : '');
          li.dataset.index = String(i);
          li.dataset.id = item.id;
          li.draggable = manual;
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', i === this.currentIndex ? 'true' : 'false');
          const th = item.thumbnail
            ? `<img src="${item.thumbnail}" alt="" draggable="false">`
            : `<div class="plc-list-thumb-fb">${i + 1}</div>`;
          const dur = item.duration ? this.formatTime(item.duration) : '';
          const size = this.formatBytes(item.size);
          const meta = [dur, size].filter(Boolean).join(' · ');
          li.innerHTML = `
        <span class="plc-list-thumb">${th}</span>
        <span class="plc-list-body">
          <span class="plc-list-name">${this.escapeHtml(item.name.replace(/\.[^.]+$/, ''))}</span>
          <span class="plc-list-meta">${this.escapeHtml(meta)}</span>
        </span>
        <button class="plc-list-remove" aria-label="Remove">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>`;
          li.addEventListener('click', (e) => {
            if (e.target.closest('.plc-list-remove')) return;
            this.playItemAtIndex(i, { autoResume: true });
          });
          li.querySelector('.plc-list-remove')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromPlaylist(i);
          });
          if (manual) {
            li.addEventListener('dragstart', (e) => {
              e.dataTransfer?.setData('text/plain', String(i));
              e.dataTransfer.effectAllowed = 'move';
            });
            li.addEventListener('dragover', (e) => {
              e.preventDefault();
              li.classList.add('drag-over');
            });
            li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
            li.addEventListener('drop', (e) => {
              e.preventDefault();
              li.classList.remove('drag-over');
              const from = Number(e.dataTransfer?.getData('text/plain'));
              if (Number.isFinite(from) && from !== i) {
                this.reorderPlaylist(from, i);
                this.renderPlaylistCarousel();
                this.renderCarouselList();
                this.renderPlaylist();
              }
            });
          }
          frag.appendChild(li);
        });
        list.appendChild(frag);
        // Scroll the active item into view when the popup opens.
        requestAnimationFrame(() => {
          const active = list.querySelector('.plc-list-item.playing');
          if (active) active.scrollIntoView({ block: 'nearest' });
        });
      },

      toggleCarouselList(force) {
        const popup = this.el.plcListPopup;
        if (!popup) return;
        const open = typeof force === 'boolean' ? force : popup.hidden;
        if (open) {
          this.renderCarouselList();
          popup.hidden = false;
          this.el.plcTitleBtn.setAttribute('aria-expanded', 'true');
          setTimeout(() => this.el.plcListSearch?.focus(), 60);
        } else {
          popup.hidden = true;
          this.el.plcTitleBtn.setAttribute('aria-expanded', 'false');
          if (this.el.plcListSearch) this.el.plcListSearch.value = '';
        }
      },

      scrollCarouselToCurrent() {
        const track = this.el.plcTrack;
        if (!track || this.currentIndex < 0) return;
        const card = track.querySelector(`.plc-card[data-index="${this.currentIndex}"]`);
        if (!card) return;
        const target = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        track.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      },

      scrollCarouselBy(dir) {
        const track = this.el.plcTrack;
        if (!track) return;
        const card = track.querySelector('.plc-card');
        const step = card ? (card.offsetWidth + 12) * 2 : track.clientWidth * 0.8;
        track.scrollBy({ left: dir * step, behavior: 'smooth' });
      },

      updateCarouselNav() {
        const track = this.el.plcTrack,
          prev = this.el.plcPrevBtn,
          next = this.el.plcNextBtn;
        if (!track || !prev || !next) return;
        const max = track.scrollWidth - track.clientWidth;
        prev.toggleAttribute('disabled', track.scrollLeft <= 2);
        next.toggleAttribute('disabled', track.scrollLeft >= max - 2);
      },

      _updateCarouselProgress() {
        const track = this.el.plcTrack;
        if (!track || !this.el.playlistCarousel || this.el.playlistCarousel.hidden || this.currentIndex < 0) return;
        const card = track.querySelector(`.plc-card[data-index="${this.currentIndex}"]`);
        if (!card) return;
        const fill = card.querySelector('.plc-progress-fill');
        const video = this.el.video;
        if (!fill || !video.duration) return;
        fill.style.width = `${Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100))}%`;
      },

      togglePlaylistPanel(force, opts = {}) {
        if (this.playlistStyle === 'carousel') return this.togglePlaylistCarousel(force, opts);
        return this.togglePlaylistSidebar(force, opts);
      },

      togglePlaylistSidebar(force, opts = {}) {
        const panel = this.el.playlistPanel;
        const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
        if (open) this._closeOthersFor(['sidebar']);
        panel.classList.toggle('open', open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        this.el.playlistToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.el.playlistToggleBtn.classList.toggle('active', open);
        this.el.playlistQuickBtn?.classList.toggle('active', open);
        if (open) {
          this._trapPlaylist = this._trapPlaylist || createFocusTrap(panel);
          this._trapPlaylist.activate();
        } else if (this._trapPlaylist) {
          this._trapPlaylist.deactivate({ restoreFocus: opts.restoreFocus !== false });
        }
        if (!open) this._releaseFocusFrom(panel);
        if (this.state.rotation) setTimeout(() => this.applyRotation(), 260);
        this.shaderRenderer?.resize();
        this.showControls(true);
      },

      /** Opens or closes the playlist carousel. */
      togglePlaylistCarousel(force, opts = {}) {
        const car = this.el.playlistCarousel;
        if (!car) return;
        const open = typeof force === 'boolean' ? force : car.hidden;
        if (open) this._closeOthersFor(['carousel']);
        if (open) {
          this.renderPlaylistCarousel();
          car.hidden = false;
          requestAnimationFrame(() => {
            car.classList.add('open');
            this.scrollCarouselToCurrent();
            this.updateCarouselNav();
          });
        } else {
          car.classList.remove('open');
          this.toggleCarouselList(false);
          const done = () => {
            car.hidden = true;
            car.removeEventListener('transitionend', done);
          };
          car.addEventListener('transitionend', done);
          setTimeout(done, 320);
        }
        if (!open) this._releaseFocusFrom(car);
        car.setAttribute('aria-hidden', open ? 'false' : 'true');
        this.el.playlistToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.el.playlistToggleBtn.classList.toggle('active', open);
        this.el.playlistQuickBtn?.classList.toggle('active', open);
        if (this.state.rotation) setTimeout(() => this.applyRotation(), 260);
        this.shaderRenderer?.resize();
        this.showControls(true);
      },

      updatePlaylistProgress() {
        this._updateCarouselProgress();
        if (this.currentIndex < 0) return;
        const li = this.el.playlistItems.querySelector('.playlist-item.playing');
        if (!li) return;
        const bar = li.querySelector('.pi-progress');
        if (!bar) return;
        if (!bar.classList.contains('is-active')) bar.classList.add('is-active');
        const fill = bar.querySelector('.pi-progress-fill');
        if (!fill) return;
        const video = this.el.video;
        if (!video.duration) return;
        fill.style.width = `${Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100))}%`;
      },

      reorderPlaylist(from, to) {
        if (from === to || from < 0 || to < 0 || from >= this.playlist.length || to >= this.playlist.length) return;
        const [m] = this.playlist.splice(from, 1);
        this.playlist.splice(to, 0, m);
        if (this.currentIndex === from) this.currentIndex = to;
        else if (from < this.currentIndex && to >= this.currentIndex) this.currentIndex--;
        else if (from > this.currentIndex && to <= this.currentIndex) this.currentIndex++;
        this.renderPlaylist();
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) {
          this.renderPlaylistCarousel();
          this.renderCarouselList();
        }
        this.savePlaylistOrderMeta();
      },

      shufflePlaylistOrder() {
        if (this.playlist.length < 2) return;
        const cur = this.currentIndex >= 0 ? this.playlist[this.currentIndex] : null;
        for (let i = this.playlist.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
        }
        if (cur) this.currentIndex = this.playlist.indexOf(cur);
        this.sortMode = 'manual';
        this._syncSortUI();
        this.saveSettings();
        this.renderPlaylist();
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) {
          this.renderPlaylistCarousel();
          this.renderCarouselList();
        }
        this.savePlaylistOrderMeta();
        this.announce('Playlist order shuffled');
      },
    };
  })(),
);
