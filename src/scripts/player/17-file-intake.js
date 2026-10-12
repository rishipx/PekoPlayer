// Player: File type detection, picker and drop handling, sidecar attachment
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      isPlayableVideoFile(f) {
        if (f.type.startsWith('video/')) return true;
        return /\.(mp4|webm|ogg|ogv|mov|mkv|m4v|3gp|ts|avi|flv|wmv)$/i.test(f.name);
      },

      isSubtitleFile(f) {
        return /\.(vtt|srt)$/i.test(f.name);
      },

      isInfoJson(f) {
        return /\.info\.json$/i.test(f.name) || (f.name.endsWith('.json') && !this.isSubtitleFile(f));
      },

      isChaptersTxt(f) {
        return /\.chapters\.(txt|json)$/i.test(f.name) || (f.name.endsWith('.txt') && !this.isSubtitleFile(f));
      },

      handleFilesChosen(fileList) {
        const intent = this._fileInputIntent || 'play';
        this._fileInputIntent = null;
        this.addFilesToPlaylistWithSidecars(Array.from(fileList), { playFirst: intent === 'play' });
        this.el.fileInput.value = '';
      },

      async handleDroppedFiles(entries, flatFiles) {
        let dropped = flatFiles;
        if (entries && entries.some((en) => en.isDirectory)) {
          const out = [];
          for (const entry of entries) await this.traverseFileTree(entry, out);
          dropped = out;
        }
        this.addFilesToPlaylistWithSidecars(dropped, { playFirst: true });
      },

      /** Adds dropped or chosen files to the playlist and attaches matching subtitle, chapter and info.json files to their videos by name. */
      addFilesToPlaylistWithSidecars(files, opts = {}) {
        const videos = files.filter((f) => this.isPlayableVideoFile(f));
        const subs = files.filter((f) => this.isSubtitleFile(f));
        const infos = files.filter((f) => this.isInfoJson(f) && !this.isSubtitleFile(f));
        const chapterTxts = files.filter(
          (f) => this.isChaptersTxt(f) && !this.isInfoJson(f) && !this.isSubtitleFile(f),
        );
        if (!videos.length) {
          if (subs.length) this.handleSubtitleChosen(subs[0]);
          else if (files.length) this.announce('No playable video or subtitle files found');
          return;
        }
        const subsByBase = new Map(),
          infosByBase = new Map(),
          chaptersByBase = new Map();
        subs.forEach((f) => {
          const k = baseName(f.name);
          if (!subsByBase.has(k)) subsByBase.set(k, []);
          subsByBase.get(k).push(f);
        });
        infos.forEach((f) => infosByBase.set(baseName(f.name).replace(/\.info$/, ''), f));
        chapterTxts.forEach((f) => chaptersByBase.set(baseName(f.name).replace(/\.chapters$/, ''), f));
        const startIndex = this.playlist.length;
        let addedCount = 0;
        const newItems = [];
        const existingKeys = new Set(this.playlist.map((it) => `${it.name}::${it.size}`));
        videos.forEach((file) => {
          const key = `${file.name}::${file.size}`;
          if (existingKeys.has(key)) return;
          existingKeys.add(key);
          const k = baseName(file.name);
          const item = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            size: file.size,
            file,
            url: URL.createObjectURL(file),
            duration: null,
            thumbnail: null,
            tracks: [],
            activeTrackId: null,
            chapters: null,
            addedAt: Date.now(),
          };
          this.playlist.push(item);
          newItems.push(item);
          addedCount++;
          this.persistNewItem(item);
          const infoFile = infosByBase.get(k) || infosByBase.get(file.name);
          const chFile = chaptersByBase.get(k) || chaptersByBase.get(file.name);
          if (infoFile) this.attachInfoJson(item, infoFile);
          else if (chFile) this.attachChaptersFile(item, chFile);
          const subList = subsByBase.get(k) || subsByBase.get(file.name);
          if (subList) subList.forEach((sf) => this.attachSubtitleFile(item, sf));
        });
        this.savePlaylistOrderMeta();
        this.renderPlaylist();
        this.renderPlaylistCarousel();
        this.probeMissingDurations();
        newItems.forEach((item) => this.queueThumbnail(item));
        if (addedCount && opts.playFirst) {
          this.playItemAtIndex(startIndex, { autoResume: true });
          this.el.stage.classList.add('has-media');
        }
        if (addedCount) this.announce(`${addedCount} file${addedCount > 1 ? 's' : ''} added`);
      },

      async attachInfoJson(item, infoFile) {
        try {
          const text = await infoFile.text();
          const { chapters } = parseYtDlpInfoJson(text);
          if (chapters.length) {
            item.chapters = chapters;
            this.persistItemField(item.id, { chapters });
            if (item === this.playlist[this.currentIndex]) {
              this.chapters = chapters.slice();
              this._renderChapters();
              this._updateSearchStatus();
            }
            this.announce(`Imported ${chapters.length} chapters from ${infoFile.name}`);
          }
        } catch {
          // Unreadable or invalid file: ignore it so playback is unaffected.
        }
      },

      async attachChaptersFile(item, chFile) {
        try {
          const text = await chFile.text();
          const chapters = parseChaptersTxt(text);
          if (chapters.length) {
            item.chapters = chapters;
            this.persistItemField(item.id, { chapters });
            if (item === this.playlist[this.currentIndex]) {
              this.chapters = chapters.slice();
              this._renderChapters();
              this._updateSearchStatus();
            }
            this.announce(`Imported ${chapters.length} chapters from ${chFile.name}`);
          }
        } catch {
          // Unreadable or invalid file: ignore it so playback is unaffected.
        }
      },

      /** Reads a subtitle file, converts it to WebVTT and attaches it to the current video as a track. */
      async attachSubtitleFile(item, subFile) {
        try {
          const text = await subFile.text();
          const { vttText } = this.parseSubtitleText(text, subFile.name);
          const blob = new Blob([vttText], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          const track = {
            id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: subFile.name.replace(/\.(vtt|srt)$/i, ''),
            url,
            blob,
          };
          item.tracks.push(track);
          item.activeTrackId = item.activeTrackId || track.id;
          this.persistItemField(item.id, {
            tracks: item.tracks.map((t) => ({
              id: t.id,
              label: t.label,
              blob: t.blob,
            })),
            activeTrackId: item.activeTrackId,
          });
          if (item === this.playlist[this.currentIndex]) {
            this.applySubtitleTracksForItem(item);
            this.renderCaptionsMenu();
            this.updateSearchSubsLink();
          }
          this.announce(`Subtitle "${track.label}" added`);
        } catch {
          // Unreadable or invalid file: ignore it so playback is unaffected.
        }
      },

      async traverseFileTree(entry, out) {
        if (entry.isFile)
          await new Promise((resolve) =>
            entry.file(
              (f) => {
                out.push(f);
                resolve();
              },
              () => resolve(),
            ),
          );
        else if (entry.isDirectory) {
          const reader = entry.createReader();
          const readBatch = () => new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
          let batch;
          do {
            batch = await readBatch();
            for (const child of batch) await this.traverseFileTree(child, out);
          } while (batch.length > 0);
        }
      },

      handleSubtitleChosen(file) {
        if (!file) return;
        const ti = this.currentIndex;
        if (ti === -1) {
          this.announce('Load a video before adding subtitles');
          this.el.subtitleInput.value = '';
          return;
        }
        this.attachSubtitleFile(this.playlist[ti], file);
        this.el.subtitleInput.value = '';
      },
    };
  })(),
);
