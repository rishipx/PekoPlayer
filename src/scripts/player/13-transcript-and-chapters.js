// Player: Transcript indexing and search, chapter list, thumbnails and real-time transcript sync
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Indexes the cues of the active subtitle track for transcript search, or clears the index when there is none. */
      async indexActiveTranscript() {
        const item = this.playlist[this.currentIndex];
        if (!item) {
          await this._clearTranscriptIndex();
          return;
        }
        const activeTrackId = item.activeTrackId;
        if (!activeTrackId) {
          await this._clearTranscriptIndex();
          return;
        }
        const trackEl = Array.from(this.el.video.querySelectorAll('track')).find(
          (t) => t.dataset.trackId === activeTrackId,
        );
        if (!trackEl?.track) {
          await this._clearTranscriptIndex();
          return;
        }
        const build = async () => {
          const cues = Array.from(trackEl.track?.cues || []).map((c) => ({
            start: c.startTime,
            end: c.endTime,
            text: c.text.replace(/<[^>]+>/g, ''),
          }));
          this._transcriptCues = cues;
          if (!cues.length) {
            await this._clearTranscriptIndex();
            return;
          }
          await this.transcriptIndex.index(cues);
          if (!item.chapters || !item.chapters.length)
            this.chapters = detectChapters(cues, this.el.video.duration || 0);
          else this.chapters = item.chapters.slice();
          this._renderChapters();
          this._updateSearchStatus();
          if (this.state.searchTab === 'search') this._runSearch();
        };
        if (trackEl.readyState === 2) await build();
        else
          trackEl.addEventListener(
            'load',
            () => {
              build();
            },
            { once: true },
          );
      },

      async _clearTranscriptIndex() {
        await this.transcriptIndex.clear();
        this._transcriptCues = [];
        this.chapters = [];
        this._activeSyncCueIdx = -1;
        this._renderChapters();
        this._updateSearchStatus();
        this._renderSearchResults([]);
      },

      toggleSearchPanel(force, opts = {}) {
        const open = force ?? !this.state.searchPanelOpen;
        if (open) this._closeOthersFor(['search']);
        this.state.searchPanelOpen = open;
        this.el.searchPanel.classList.toggle('open', open);
        this.el.searchPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
        this.el.searchToggleBtn.classList.toggle('active', open);
        this.el.searchToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          this.indexActiveTranscript();
          this._trapSearch = this._trapSearch || createFocusTrap(this.el.searchPanel);
          this._trapSearch.activate();
          setTimeout(() => this.el.searchInput.focus(), 250);
        } else if (this._trapSearch) {
          this._trapSearch.deactivate({ restoreFocus: opts.restoreFocus !== false });
        }
        if (!open) this._releaseFocusFrom(this.el.searchPanel);
        this.showControls(true);
      },

      setSearchTab(tab) {
        this.state.searchTab = tab;
        document.querySelectorAll('.search-tab').forEach((b) => {
          const a = b.getAttribute('data-tab') === tab;
          b.classList.toggle('active', a);
          b.setAttribute('aria-selected', a ? 'true' : 'false');
        });
        document.querySelectorAll('.search-tab-content').forEach((c) => {
          c.hidden = c.getAttribute('data-tab') !== tab;
        });
        if (tab === 'chapters') this._renderChapters(this.el.searchInput.value.trim());
        else this._runSearch();
      },

      _updateSearchStatus() {
        const n = this.transcriptIndex.docCount,
          ch = this.chapters.length;
        if (!n && !ch) {
          this.el.searchStatus.textContent = 'No transcript or chapters — load a subtitle or yt-dlp .info.json';
          return;
        }
        const p = [];
        if (n) p.push(`${n} cues indexed`);
        if (ch) p.push(`${ch} chapters`);
        this.el.searchStatus.textContent = p.join(' · ');
      },

      async _runSearch() {
        const q = this.el.searchInput.value.trim();
        if (this.state.searchTab === 'chapters') {
          this._renderChapters(q);
          return;
        }
        const token = ++this._searchQueryToken;
        if (!q) {
          if (this._transcriptCues.length) this._renderTranscriptPreview();
          else this._renderSearchResults([]);
          return;
        }
        if (this.transcriptIndex.isEmpty()) {
          this._renderSearchResults([]);
          return;
        }
        const results = await this.transcriptIndex.search(q, 40);
        if (token !== this._searchQueryToken) return;
        this._renderSearchResults(results, q);
      },

      /** Renders the transcript list of the active track. */
      _renderTranscriptPreview() {
        const ul = this.el.searchResults;
        ul.innerHTML = '';
        if (!this._transcriptCues.length) {
          this._renderSearchResults([]);
          return;
        }
        const frag = document.createDocumentFragment();
        this._transcriptCues.forEach((cue) => {
          const li = document.createElement('li');
          li.className = 'search-result-item';
          li.dataset.time = String(cue.start);
          const stamp = document.createElement('span');
          stamp.className = 'sr-timestamp';
          stamp.textContent = PekoUtils.formatTime(cue.start);
          const body = document.createElement('div');
          body.className = 'sr-body';
          const text = document.createElement('div');
          text.className = 'sr-text';
          text.textContent = cue.text;
          body.appendChild(text);
          li.appendChild(stamp);
          li.appendChild(body);
          li.addEventListener('click', () => {
            const v = this.el.video;
            v.currentTime = Math.max(0, cue.start);
            if (v.paused) v.play().catch(() => {});
          });
          frag.appendChild(li);
        });
        ul.appendChild(frag);
      },

      /** Renders search hits with the matched terms highlighted. */
      _renderSearchResults(results, query) {
        const ul = this.el.searchResults;
        ul.innerHTML = '';
        if (this.transcriptIndex.isEmpty()) {
          const li = document.createElement('li');
          li.className = 'search-empty';
          li.innerHTML =
            '<div class="panel-empty"><div class="panel-empty-glyph"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a2 2 0 0 1 2-2h2M4 17v2a2 2 0 0 0 2 2h2M20 7V5a2 2 0 0 0-2-2h-2M20 17v2a2 2 0 0 1-2 2h-2"/><path d="M8 11h8M8 15h5"/></svg></div><div class="panel-empty-title">No transcript</div><div class="panel-empty-desc">Load a <code>.vtt</code> or <code>.srt</code> subtitle file to enable search.</div></div>';
          ul.appendChild(li);
          return;
        }
        if (!results.length) {
          const li = document.createElement('li');
          li.className = 'search-empty';
          li.textContent = query ? `No matches for "${query}"` : 'Type to search.';
          ul.appendChild(li);
          return;
        }
        const frag = document.createDocumentFragment();
        results.forEach((r) => {
          const li = document.createElement('li');
          li.className = 'search-result-item';
          li.dataset.time = String(r.start);
          const stamp = document.createElement('span');
          stamp.className = 'sr-timestamp';
          stamp.textContent = PekoUtils.formatTime(r.start);
          const body = document.createElement('div');
          body.className = 'sr-body';
          const text = document.createElement('div');
          text.className = 'sr-text';
          let html = PekoUtils.escapeHtml(r.text);
          r.matches.forEach((term) => {
            const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Tags and entities are matched first and returned untouched, so a term such as "amp" or "mark"
            // cannot match inside "&amp;" or "<mark>".
            html = html.replace(
              new RegExp(`(<[^>]*>|&(?:[a-z]+|#\\d+);)|\\b(${safe}\\w*)`, 'gi'),
              (match, markup, hit) => (markup ? match : `<mark>${hit}</mark>`),
            );
          });
          text.innerHTML = html;
          body.appendChild(text);
          li.appendChild(stamp);
          li.appendChild(body);
          li.addEventListener('click', () => {
            const v = this.el.video;
            v.currentTime = Math.max(0, r.start);
            if (v.paused) v.play().catch(() => {});
          });
          frag.appendChild(li);
        });
        ul.appendChild(frag);
      },

      /** Renders the chapter list with timestamps and thumbnails. */
      _renderChapters(query = '') {
        const ul = this.el.chapterList;
        if (!ul) return;
        ul.innerHTML = '';
        if (!this.chapters.length) {
          const li = document.createElement('li');
          li.className = 'search-empty';
          li.innerHTML =
            '<div class="panel-empty"><div class="panel-empty-glyph"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/></svg></div><div class="panel-empty-title">No chapters</div><div class="panel-empty-desc">Drop a yt-dlp <code>.info.json</code> or load a subtitle for auto-detection.</div></div>';
          ul.appendChild(li);
          return;
        }
        let list = this.chapters;
        const q = (query || '').toLowerCase();
        if (q) list = list.filter((ch) => ((ch.title || ch.preview || '') + '').toLowerCase().includes(q));
        if (!list.length) {
          const li = document.createElement('li');
          li.className = 'search-empty';
          li.textContent = `No chapters match "${query}"`;
          ul.appendChild(li);
          return;
        }
        if (!this._chapterObserver && typeof IntersectionObserver !== 'undefined') {
          this._chapterObserver = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                this._chapterObserver.unobserve(el);
                const data = el._chapterData;
                if (data) this.queueChapterThumb(data.item, data.chapter, el, data.key);
              });
            },
            { root: ul, rootMargin: '120px' },
          );
        }
        const item = this.playlist[this.currentIndex];
        const frag = document.createDocumentFragment();
        list.forEach((ch, i) => {
          const li = document.createElement('li');
          li.className = 'chapter-item';
          li.dataset.time = String(ch.start);
          const thumb = document.createElement('div');
          thumb.className = 'chapter-thumb';
          thumb.textContent = `CH ${i + 1}`;
          const stamp = document.createElement('span');
          stamp.className = 'sr-timestamp';
          stamp.textContent = PekoUtils.formatTime(ch.start);
          const body = document.createElement('div');
          body.className = 'sr-body';
          const text = document.createElement('div');
          text.className = 'sr-text';
          text.textContent = ch.title || ch.preview || `Chapter ${i + 1}`;
          body.appendChild(text);
          li.appendChild(thumb);
          li.appendChild(stamp);
          li.appendChild(body);
          li.addEventListener('click', () => {
            this.el.video.currentTime = Math.max(0, ch.start);
          });
          if (item) {
            const key = `${item.id}::${ch.start.toFixed(1)}`;
            if (this._chapterThumbCache.has(key))
              thumb.innerHTML = `<img src="${this._chapterThumbCache.get(key)}" alt="">`;
            else if (this._chapterObserver) {
              li._chapterData = {
                item,
                chapter: ch,
                key,
              };
              this._chapterObserver.observe(li);
            }
          }
          frag.appendChild(li);
        });
        ul.appendChild(frag);
      },

      queueChapterThumb(item, chapter, liEl, key) {
        if (this._chapterThumbCache.has(key)) return;
        this._chapterThumbQueue = this._chapterThumbQueue
          .then(() => this._genChapterThumb(item, chapter, liEl, key))
          .catch(() => {});
      },

      /** Captures a chapter thumbnail from a hidden video element and caches it. */
      async _genChapterThumb(item, chapter, liEl, key) {
        if (this._chapterThumbCache.has(key)) {
          const url = this._chapterThumbCache.get(key);
          const img = liEl.querySelector('.chapter-thumb');
          if (img && liEl.isConnected) img.innerHTML = `<img src="${url}" alt="">`;
          return;
        }
        if (!liEl.isConnected) return;
        try {
          if (!this._chapterProbe) {
            const v = document.createElement('video');
            v.muted = true;
            v.preload = 'metadata';
            v.style.display = 'none';
            document.body.appendChild(v);
            this._chapterProbe = v;
          }
          const probe = this._chapterProbe;
          if (probe.dataset.src !== item.url) {
            probe.dataset.src = item.url;
            probe.src = item.url;
          }
          await new Promise((res) => {
            if (probe.readyState >= 1) return res();
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              res();
            };
            probe.addEventListener('loadedmetadata', done, { once: true });
            probe.addEventListener('error', done, { once: true });
            setTimeout(done, 5000);
          });
          const dur = probe.duration || 0;
          const target = Math.min(chapter.start + 2, Math.max(0, dur - 0.5));
          if (target < 0 || !probe.videoWidth) return;
          await new Promise((res) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              res();
            };
            probe.addEventListener('seeked', done, { once: true });
            try {
              probe.currentTime = target;
            } catch {
              done();
            }
            setTimeout(done, 2500);
          });
          if (!probe.videoWidth) return;
          const W = 160,
            H = Math.max(1, Math.round(W * (probe.videoHeight / probe.videoWidth)));
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          c.getContext('2d').drawImage(probe, 0, 0, W, H);
          const url = c.toDataURL('image/jpeg', 0.7);
          this._chapterThumbCache.set(key, url);
          if (liEl.isConnected) {
            const img = liEl.querySelector('.chapter-thumb');
            if (img) img.innerHTML = `<img src="${url}" alt="">`;
          }
        } catch {
          // Thumbnail generation failed: the chapter keeps its placeholder.
        }
      },

      toggleTranscriptSync() {
        const on = !this.state.syncTranscriptOn;
        this.state.syncTranscriptOn = on;
        this.el.transcriptSyncBtn.classList.toggle('active', on);
        this.el.transcriptSyncBtn.setAttribute('aria-pressed', String(on));
        this.announce(on ? 'Sync on' : 'Sync off');
        if (on) {
          this._activeSyncCueIdx = -1;
          this._doRealtimeSync(true);
        } else {
          this.el.searchResults
            .querySelectorAll('.search-result-item.active')
            .forEach((el) => el.classList.remove('active'));
          this.el.chapterList.querySelectorAll('.chapter-item.active').forEach((el) => el.classList.remove('active'));
        }
      },

      /** Pauses automatic scrolling of the transcript and chapter panels while the user interacts with them. */
      _bindSyncPauseOnInteraction() {
        const panels = [this.el.searchResults, this.el.chapterList];
        panels.forEach((p) => {
          if (!p) return;
          const pause = () => {
            this._syncUserPaused = true;
            clearTimeout(this._syncResumeTimer);
            this._syncResumeTimer = setTimeout(() => {
              this._syncUserPaused = false;
            }, 2500);
          };
          p.addEventListener('wheel', pause, { passive: true });
          p.addEventListener('touchmove', pause, { passive: true });
          p.addEventListener('mousedown', pause);
          p.addEventListener(
            'scroll',
            () => {
              if (this._syncScrollingProgrammatically) return;
              pause();
            },
            { passive: true },
          );
        });
      },

      /** Scrolls the transcript and chapter lists to the cue and chapter at the current playback time. */
      _doRealtimeSync(force) {
        if (!this.state.syncTranscriptOn) return;
        if (this._syncUserPaused && !force) return;
        const rawT = this.el.video.currentTime;
        if (!isFinite(rawT) || rawT < 0) return;
        const scrollOnce = (container, target) => {
          if (!target || !container) return;
          this._syncScrollingProgrammatically = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          clearTimeout(this._syncScrollEndTimer);
          this._syncScrollEndTimer = setTimeout(() => {
            this._syncScrollingProgrammatically = false;
          }, 800);
        };
        if (this.state.searchTab === 'chapters') {
          if (!this.chapters.length) return;
          let nearestIdx = 0,
            bestDist = Infinity;
          this.chapters.forEach((ch, i) => {
            const d = Math.abs(ch.start - rawT);
            if (d < bestDist) {
              bestDist = d;
              nearestIdx = i;
            }
          });
          if (nearestIdx === this._activeSyncCueIdx && !force) return;
          this._activeSyncCueIdx = nearestIdx;
          const items = this.el.chapterList.querySelectorAll('.chapter-item');
          items.forEach((el) => el.classList.remove('active'));
          const target = items[nearestIdx];
          if (target) {
            target.classList.add('active');
            scrollOnce(this.el.chapterList, target);
          }
          return;
        }
        if (!this._transcriptCues.length) return;
        if (this.el.searchInput.value.trim() && document.activeElement !== this.el.searchInput) {
          this.el.searchInput.value = '';
          this._runSearch();
        }
        const delay = this.subtitleStyle.delay || 0;
        const t = rawT - delay;
        let active = -1;
        for (let i = 0; i < this._transcriptCues.length; i++) {
          const c = this._transcriptCues[i];
          if (t >= c.start && t <= c.end) {
            active = i;
            break;
          }
        }
        if (active < 0)
          for (let i = this._transcriptCues.length - 1; i >= 0; i--) {
            if (this._transcriptCues[i].start <= t) {
              active = i;
              break;
            }
          }
        if (active < 0) active = 0;
        if (active === this._activeSyncCueIdx && !force) return;
        this._activeSyncCueIdx = active;
        const items = this.el.searchResults.querySelectorAll('.search-result-item');
        items.forEach((el) => el.classList.remove('active'));
        const target = items[active];
        if (target) {
          target.classList.add('active');
          scrollOnce(this.el.searchResults, target);
        }
      },
    };
  })(),
);
