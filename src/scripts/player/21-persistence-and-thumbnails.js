// Player: Playlist persistence and video thumbnail generation
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      getPlaylistOrderMeta() {
        try {
          return JSON.parse(localStorage.getItem(PekoConfig.STORAGE.order) || '{}');
        } catch {
          return {};
        }
      },

      savePlaylistOrderMeta() {
        try {
          localStorage.setItem(
            PekoConfig.STORAGE.order,
            JSON.stringify({
              ids: this.playlist.map((i) => i.id),
              currentId: this.currentIndex >= 0 ? this.playlist[this.currentIndex]?.id : null,
            }),
          );
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      /** Rebuilds the playlist from the files saved in IndexedDB, in the saved order. */
      async restorePlaylistFromDB() {
        if (!this.db) return;
        const records = await PekoDB.getAll(this.db);
        if (!records.length) return;
        const orderMeta = this.getPlaylistOrderMeta();
        if (orderMeta.ids?.length)
          records.sort((a, b) => {
            const ia = orderMeta.ids.indexOf(a.id),
              ib = orderMeta.ids.indexOf(b.id);
            if (ia === -1 && ib === -1) return (a.addedAt || 0) - (b.addedAt || 0);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
        else records.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        this.playlist = records.map((rec) => ({
          id: rec.id,
          name: rec.name,
          size: rec.size,
          file: rec.blob,
          url: URL.createObjectURL(rec.blob),
          duration: rec.duration || null,
          thumbnail: rec.thumbnail || null,
          tracks: (rec.tracks || []).map((t) => ({
            id: t.id,
            label: t.label,
            url: URL.createObjectURL(t.blob),
            blob: t.blob,
          })),
          activeTrackId: rec.activeTrackId || null,
          chapters: rec.chapters || null,
          addedAt: rec.addedAt || Date.now(),
        }));
        this.renderPlaylist();
        this.announce(`Restored ${this.playlist.length} item${this.playlist.length > 1 ? 's' : ''}`);
        let wantIndex = -1;
        if (orderMeta.currentId) wantIndex = this.playlist.findIndex((i) => i.id === orderMeta.currentId);
        if (wantIndex !== -1) this.loadItemSilently(wantIndex);
        this.probeMissingDurations();
        this.ensureThumbnails();
      },

      /** Selects a restored item and loads its source without starting playback. */
      loadItemSilently(index) {
        const item = this.playlist[index];
        if (!item) return;
        this.currentIndex = index;
        const video = this.el.video;
        this.el.stage.classList.add('has-media');
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
        this.renderBookmarks();
        if (item.chapters && item.chapters.length) {
          this.chapters = item.chapters.slice();
          this._renderChapters();
        }
        const resumeMap = this.getResumeMap();
        const saved = resumeMap[this.resumeKey(item)];
        if (saved && saved.time > 5 && saved.duration && saved.time < saved.duration - 5)
          this.showResumeToast(item, saved.time);
        this.renderPlaylist();
        this.resetSilenceState();
        this._indexDebounced();
        this.updateStageTitle();
        this.updateSearchSubsLink();
      },

      /** Reads the duration of items that lack one, using a hidden video element. */
      async probeMissingDurations() {
        const pending = this.playlist.filter((i) => !i.duration);
        if (!pending.length) return;
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        for (const item of pending) {
          if (item.duration) continue;
          await new Promise((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              probe.removeEventListener('loadedmetadata', onMeta);
              probe.removeEventListener('error', done);
              resolve();
            };
            const onMeta = () => {
              item.duration = probe.duration;
              this.persistItemField(item.id, { duration: probe.duration });
              done();
            };
            probe.addEventListener('loadedmetadata', onMeta, { once: true });
            probe.addEventListener('error', done, { once: true });
            try {
              probe.src = item.url;
            } catch {
              done();
            }
            setTimeout(done, 15000);
          });
        }
        probe.removeAttribute('src');
        probe.load();
        probe.remove();
        this._renderPlaylistDebounced();
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) this.renderPlaylistCarousel();
      },

      queueThumbnail(item) {
        if (item.thumbnail || item._thumbQueued || item._thumbPromise) return;
        item._thumbQueued = true;
        const run = () => {
          item._thumbQueued = false;
          this.generateThumbnail(item);
        };
        if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2500 });
        else setTimeout(run, 250);
      },

      /** Captures a thumbnail frame for an item, once, and saves it with the item. Gives up after a timeout. */
      generateThumbnail(item) {
        if (item.thumbnail || item._thumbPromise || !item.url) return item._thumbPromise || Promise.resolve(null);
        const promise = new Promise((resolve) => {
          let video,
            timeout,
            finished = false;
          const finish = (result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            try {
              if (video) {
                video.removeAttribute('src');
                video.load();
              }
            } catch {
              // Best-effort teardown: the object may already be released.
            }
            item._thumbPromise = null;
            resolve(result);
          };
          try {
            video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.src = item.url;
            const capture = async () => {
              try {
                if (!video.videoWidth) {
                  finish(null);
                  return;
                }
                const W = 240;
                const H = Math.max(1, Math.round(W * (video.videoHeight / video.videoWidth)));
                const dataUrl = await this._encodeThumbnail(video, W, H);
                if (!dataUrl) {
                  finish(null);
                  return;
                }
                item.thumbnail = dataUrl;
                this.persistItemField(item.id, { thumbnail: dataUrl });
                this.updateItemThumbnailInDOM(item);
                finish(dataUrl);
              } catch (err) {
                finish(null);
              }
            };
            const seekToFrame = () => {
              const d = video.duration;
              if (!isFinite(d) || d <= 0) {
                capture();
                return;
              }
              const target = Math.min(Math.max(d * 0.1, 1), 5, Math.max(0.1, d - 0.2));
              try {
                video.currentTime = target;
              } catch {
                capture();
              }
            };
            video.addEventListener('loadeddata', () => seekToFrame(), { once: true });
            video.addEventListener('seeked', capture, { once: true });
            video.addEventListener('error', () => finish(null), { once: true });
            if (video.readyState >= 2 && video.videoWidth) seekToFrame();
            timeout = setTimeout(() => finish(null), 10000);
          } catch {
            finish(null);
          }
        });
        item._thumbPromise = promise;
        return promise;
      },

      /** Encodes a captured frame as a data URL, off the main thread when the browser allows it. */
      async _encodeThumbnail(video, w, h) {
        if (
          typeof createImageBitmap === 'function' &&
          typeof OffscreenCanvas !== 'undefined' &&
          typeof Worker !== 'undefined'
        ) {
          try {
            const bitmap = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h });
            const blob = await this._encodeBitmapInWorker(bitmap, w, h, 0.72);
            if (blob)
              return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
          } catch {
            // Thumbnail encoding failed: the item simply has no thumbnail.
          }
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.72);
      },

      /** Sends a bitmap to the thumbnail worker and returns the encoded data URL (null when workers are unavailable). */
      async _encodeBitmapInWorker(bitmap, w, h, q) {
        if (!this._thumbRpc) {
          const worker = createPekoWorker('thumbnailWorkerSrc');
          if (!worker) {
            bitmap.close();
            return null;
          }
          this._thumbRpc = new WorkerRpc(worker);
        }
        try {
          const msg = await this._thumbRpc.call({
            type: 'encode',
            bitmap,
            width: w,
            height: h,
            quality: q,
          });
          return msg.ok ? msg.blob : null;
        } catch (err) {
          try {
            bitmap.close();
          } catch {
            // Best-effort teardown: the object may already be released.
          }
          return null;
        }
      },

      ensureThumbnails() {
        this.playlist.forEach((item) => {
          if (!item.thumbnail && !item._thumbPromise) this.queueThumbnail(item);
        });
      },

      updateItemThumbnailInDOM(item) {
        if (!item.thumbnail) return;
        const list = this.el.playlistItems;
        if (!list) return;
        const li = list.querySelector(`.playlist-item[data-id="${CSS.escape(item.id)}"]`);
        if (!li) return;
        const thumb = li.querySelector('.pi-thumb');
        if (!thumb || thumb.querySelector('img')) return;
        const fb = thumb.querySelector('.pi-thumb-fallback');
        if (fb) fb.remove();
        const img = document.createElement('img');
        img.src = item.thumbnail;
        img.alt = '';
        img.draggable = false;
        thumb.insertBefore(img, thumb.firstChild);
        if (this.el.playlistCarousel && !this.el.playlistCarousel.hidden) {
          this.renderPlaylistCarousel();
          this.renderCarouselList();
        }
      },

      /** Saves a newly added file in IndexedDB so it is still there next visit, unless an identical file is already stored. */
      async persistNewItem(item) {
        if (!this.db) return;
        try {
          const dupe = await PekoDB.findByNameSize(this.db, PekoDB.STORE, item.name, item.size);
          if (dupe) return;
          await PekoDB.guardWrite(
            PekoDB.put(this.db, {
              id: item.id,
              name: item.name,
              size: item.size,
              blob: item.file,
              tracks: [],
              activeTrackId: null,
              duration: item.duration,
              thumbnail: item.thumbnail || null,
              chapters: item.chapters || null,
              addedAt: item.addedAt || Date.now(),
            }),
            (msg) => this.announce(msg),
          );
        } catch {
          // Saving the file for later failed (quota or blocked): playback is unaffected.
        }
      },

      async persistItemField(id, fields) {
        if (!this.db) return;
        PekoDB.guardWrite(PekoDB.updateRecord(this.db, id, fields), (msg) => this.announce(msg)).catch(() => {});
      },

      async persistRemoveItem(id) {
        if (!this.db) return;
        PekoDB.remove(this.db, id).catch(() => {});
      },
    };
  })(),
);
