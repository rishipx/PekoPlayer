// Shared helpers: utilities, worker plumbing, focus trap and chapter parsing

const PekoUtils = {
  formatTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = Math.floor(s % 60);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  },

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  },

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  debounce(fn, wait) {
    let t = null;
    return (...args) => {
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  throttle(fn, wait) {
    let last = 0,
      t = null;
    return (...args) => {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn(...args);
      } else {
        if (t !== null) clearTimeout(t);
        t = setTimeout(
          () => {
            last = Date.now();
            fn(...args);
          },
          wait - (now - last),
        );
      }
    };
  },

  /** True when the page can offer a Folder button: the File System Access API, or the desktop app's own folder dialog. */
  hasFolderPicker() {
    return Boolean(window.pekoDesktop) || 'showDirectoryPicker' in window;
  },

  /** Recursively collects the files of a directory picked with showDirectoryPicker(), skipping any that cannot be read. */
  async collectFilesFromDirectoryHandle(dirHandle, out) {
    for await (const handle of dirHandle.values()) {
      if (handle.kind === 'file') {
        try {
          out.push(await handle.getFile());
        } catch {
          // The file was moved or is no longer readable: skip it and keep scanning.
        }
      } else if (handle.kind === 'directory') {
        await PekoUtils.collectFilesFromDirectoryHandle(handle, out);
      }
    }
  },
};

const PekoWorkerBlobUrls = new Map();

/** Creates a Worker from an inline <script type="text/worker"> element, so the app needs no extra file requests. Returns null when workers are unavailable. */
function createPekoWorker(srcId) {
  if (typeof Worker === 'undefined') return null;
  try {
    let url = PekoWorkerBlobUrls.get(srcId);
    if (!url) {
      const el = document.getElementById(srcId);
      if (!el) return null;
      const src = el.textContent || '';
      const blob = new Blob([src], { type: 'application/javascript' });
      url = URL.createObjectURL(blob);
      PekoWorkerBlobUrls.set(srcId, url);
    }
    return new Worker(url);
  } catch (err) {
    return null;
  }
}

/** Request/response wrapper around a Worker: call() posts a message and resolves with the worker's reply to it. */
class WorkerRpc {
  constructor(worker) {
    this.worker = worker;
    this._pending = new Map();
    this._nextId = 1;
    worker.onmessage = (e) => {
      const msg = e.data || {};
      const p = this._pending.get(msg.requestId);
      if (!p) return;
      this._pending.delete(msg.requestId);
      if (msg.type === 'error') p.reject(new Error(String(msg.error || 'worker error')));
      else p.resolve(msg);
    };
    worker.onerror = (e) => {
      this._pending.forEach((p) => p.reject(new Error(e.message || 'worker error')));
      this._pending.clear();
    };
  }

  call(msg) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      msg.requestId = id;
      this._pending.set(id, { resolve, reject });
      this.worker.postMessage(msg);
    });
  }

  terminate() {
    try {
      this.worker.terminate();
    } catch {
      // Best-effort teardown: the object may already be released.
    }
  }
}

/** Keeps keyboard focus inside a modal container while it is active and restores the previous focus on deactivate(). */
function createFocusTrap(container) {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let active = false,
    prev = null;
  const handler = (e) => {
    if (e.key !== 'Tab' || !active) return;
    const f = Array.from(container.querySelectorAll(selector)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return {
    activate() {
      if (active) return;
      active = true;
      prev = document.activeElement;
      document.addEventListener('keydown', handler, true);
    },

    deactivate(opts) {
      if (!active) return;
      active = false;
      document.removeEventListener('keydown', handler, true);
      const restore = !opts || opts.restoreFocus !== false;
      if (restore && prev && prev.focus) prev.focus();
      prev = null;
    },
  };
}

/** Extracts the chapter list from a yt-dlp .info.json file. */
function parseYtDlpInfoJson(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    const chapters = [];
    if (Array.isArray(data.chapters))
      data.chapters.forEach((ch) => {
        if (typeof ch.start_time === 'number' && typeof ch.end_time === 'number')
          chapters.push({
            start: ch.start_time,
            end: ch.end_time,
            title: ch.title || `Chapter ${chapters.length + 1}`,
            preview: ch.title,
          });
      });
    if (!chapters.length && Array.isArray(data.sections))
      data.sections.forEach((sec, i) => {
        if (typeof sec.section_start === 'number')
          chapters.push({
            start: sec.section_start,
            end: sec.section_end ?? sec.section_start,
            title: sec.section_title || `Section ${i + 1}`,
            preview: sec.section_title,
          });
      });
    return { chapters, raw: data };
  } catch (err) {
    return { chapters: [], raw: null };
  }
}

/** Parses a plain-text chapter list with one `timestamp title` pair per line. */
function parseChaptersTxt(text) {
  const chapters = [];
  const lines = text.split(/\r?\n/);
  const mp4 = {};
  lines.forEach((line) => {
    const m = line.match(/^CHAPTER(\d+)=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
    if (m) {
      mp4[m[1]] = { start: timecodeToSeconds(m[2]) };
      return;
    }
    const n = line.match(/^CHAPTER(\d+)NAME=(.+)$/);
    if (n && mp4[n[1]]) mp4[n[1]].title = n[2];
  });
  const mp4List = Object.keys(mp4)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => mp4[k]);
  if (mp4List.length) {
    mp4List.forEach((ch, i) =>
      chapters.push({
        start: ch.start,
        end: mp4List[i + 1] ? mp4List[i + 1].start : null,
        title: ch.title || `Chapter ${i + 1}`,
        preview: ch.title,
      }),
    );
    return chapters;
  }
  lines.forEach((line) => {
    const m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+(.+)$/);
    if (m)
      chapters.push({
        start: timecodeToSeconds(m[1]),
        end: null,
        title: m[2],
        preview: m[2],
      });
  });
  for (let i = 0; i < chapters.length; i++) if (i + 1 < chapters.length) chapters[i].end = chapters[i + 1].start;
  return chapters;
}

/** Converts a timecode such as 1:02:03 or 02:03.5 into seconds. */
function timecodeToSeconds(tc) {
  const parts = tc.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

/** Returns a file name without its extension. */
function baseName(filename) {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/\.info$/, '')
    .replace(/\.chapters$/, '')
    .replace(/\.vtt$/i, '')
    .replace(/\.srt$/i, '');
}
