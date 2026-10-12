// Player: Resume positions and bookmarks
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      resumeKey(item) {
        return `${item.name}::${item.size}`;
      },

      getResumeMap() {
        try {
          return JSON.parse(localStorage.getItem(PekoConfig.STORAGE.resume) || '{}');
        } catch {
          return {};
        }
      },

      saveResumePosition() {
        const item = this.playlist[this.currentIndex];
        const video = this.el.video;
        if (!item || !video.duration || video.currentTime < 1) return;
        if (Math.abs((this._lastResumeWrite || 0) - video.currentTime) < 1.5) return;
        this._lastResumeWrite = video.currentTime;
        try {
          const map = this.getResumeMap();
          if (video.currentTime > video.duration - 3) delete map[this.resumeKey(item)];
          else
            map[this.resumeKey(item)] = {
              time: video.currentTime,
              duration: video.duration,
              ts: Date.now(),
            };
          localStorage.setItem(PekoConfig.STORAGE.resume, JSON.stringify(map));
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      clearResumeFor(item) {
        if (!item) return;
        try {
          const map = this.getResumeMap();
          delete map[this.resumeKey(item)];
          localStorage.setItem(PekoConfig.STORAGE.resume, JSON.stringify(map));
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      getBookmarks(key) {
        try {
          const all = JSON.parse(localStorage.getItem(PekoConfig.STORAGE.bookmarks) || '{}');
          return all[key] || [];
        } catch {
          return [];
        }
      },

      setBookmarks(key, list) {
        try {
          const all = JSON.parse(localStorage.getItem(PekoConfig.STORAGE.bookmarks) || '{}');
          all[key] = list;
          localStorage.setItem(PekoConfig.STORAGE.bookmarks, JSON.stringify(all));
        } catch {
          // Storage is unavailable or full: skip saving, the app keeps working.
        }
      },

      toggleBookmark() {
        const item = this.playlist[this.currentIndex];
        if (!item) return;
        const video = this.el.video;
        if (!video.duration) return;
        const t = video.currentTime;
        const key = this.resumeKey(item);
        const list = this.getBookmarks(key).slice();
        const ex = list.findIndex((b) => Math.abs(b.t - t) < 2);
        if (ex >= 0) {
          list.splice(ex, 1);
          this.announce('Bookmark removed');
        } else {
          list.push({ t, label: this.formatTime(t) });
          list.sort((a, b) => a.t - b.t);
          this.announce(`Bookmark added at ${this.formatTime(t)}`);
        }
        this.setBookmarks(key, list);
        this.renderBookmarks();
      },

      // Removes the bookmark closest to a horizontal screen position, if one is within reach of the pointer.
      // Used for right-clicks on the progress bar, where the scrubber handle can sit on top of a marker.
      removeBookmarkNear(clientX) {
        const item = this.playlist[this.currentIndex];
        const video = this.el.video;
        if (!item || !video.duration) return false;
        const rect = this.el.progressContainer.getBoundingClientRect();
        const key = this.resumeKey(item);
        const list = this.getBookmarks(key);
        let nearest = -1;
        let nearestDistance = 8;
        list.forEach((b, i) => {
          const distance = Math.abs(rect.left + (b.t / video.duration) * rect.width - clientX);
          if (distance <= nearestDistance) {
            nearest = i;
            nearestDistance = distance;
          }
        });
        if (nearest < 0) return false;
        this.setBookmarks(
          key,
          list.filter((_, i) => i !== nearest),
        );
        this.renderBookmarks();
        this.announce('Bookmark removed');
        return true;
      },

      /** Draws the current item's bookmark markers on the progress bar. */
      renderBookmarks() {
        const layer = this.el.bookmarkLayer;
        if (!layer) return;
        layer.innerHTML = '';
        const item = this.playlist[this.currentIndex];
        const video = this.el.video;
        if (!item || !video.duration) return;
        const list = this.getBookmarks(this.resumeKey(item));
        const frag = document.createDocumentFragment();
        list.forEach((b) => {
          const el = document.createElement('div');
          el.className = 'bookmark-marker';
          el.style.left = `${(b.t / video.duration) * 100}%`;
          el.dataset.label = `${this.formatTime(b.t)} · click to jump, right-click to remove`;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            video.currentTime = b.t;
            this.shaderRenderer?.invalidate();
          });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setBookmarks(
              this.resumeKey(item),
              list.filter((x) => x.t !== b.t),
            );
            this.renderBookmarks();
            this.announce('Bookmark removed');
          });
          frag.appendChild(el);
        });
        layer.appendChild(frag);
      },
    };
  })(),
);
