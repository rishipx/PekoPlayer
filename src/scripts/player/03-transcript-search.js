// Transcript search client and chapter detection. The index itself is in src/shared/transcript-index.js.

/** Derives chapters from long pauses between cues: the largest gaps become chapter boundaries, within the given limits. */
function detectChapters(cues, duration, options = {}) {
  const minGap = options.minGap ?? 2.5,
    minChapterSec = options.minChapterSec ?? 45,
    maxChapters = options.maxChapters ?? 30;
  if (!cues || cues.length < 4) return [];
  const gaps = [];
  for (let i = 1; i < cues.length; i++) {
    const gap = cues[i].start - cues[i - 1].end;
    if (gap >= minGap) gaps.push({ gap, cueIndex: i });
  }
  if (!gaps.length) return [];
  gaps.sort((a, b) => b.gap - a.gap);
  const chosen = gaps.slice(0, maxChapters - 1).sort((a, b) => a.cueIndex - b.cueIndex);
  const chapters = [];
  let startCue = 0;
  for (const g of chosen) {
    chapters.push({ startCue, endCue: g.cueIndex - 1 });
    startCue = g.cueIndex;
  }
  chapters.push({ startCue, endCue: cues.length - 1 });

  // Merge chapters shorter than the minimum into a neighbour, shortest first. Chapters at the ends merge inward;
  // a chapter in the middle joins its shorter neighbour.
  const span = (c) => cues[c.endCue].end - cues[c.startCue].start;
  while (chapters.length > 1) {
    let shortest = -1;
    let shortestLength = Infinity;
    chapters.forEach((c, i) => {
      const length = span(c);
      if (length < minChapterSec && length < shortestLength) {
        shortest = i;
        shortestLength = length;
      }
    });
    if (shortest === -1) break;
    const i = shortest;
    if (i === 0) {
      chapters[1].startCue = chapters[0].startCue;
    } else if (i === chapters.length - 1) {
      chapters[i - 1].endCue = chapters[i].endCue;
    } else if (span(chapters[i - 1]) <= span(chapters[i + 1])) {
      chapters[i - 1].endCue = chapters[i].endCue;
    } else {
      chapters[i + 1].startCue = chapters[i].startCue;
    }
    chapters.splice(i, 1);
  }

  return chapters.map((c) => ({
    start: cues[c.startCue].start,
    end: cues[c.endCue].end,
    title: '',
    startCue: c.startCue,
    endCue: c.endCue,
  }));
}

/** Runs indexing and search in a worker so large transcripts do not block the page. Falls back to an in-page TranscriptIndex when workers are unavailable. */
class WorkerTranscriptClient {
  constructor() {
    this.worker = null;
    this.rpc = null;
    this.fallback = new TranscriptIndex();
    this.docCount = 0;
    this.usingWorker = false;
    this._initialized = false;
  }

  _ensureWorker() {
    if (this._initialized) return;
    this._initialized = true;
    this.worker = createPekoWorker('transcriptWorkerSrc');
    this.rpc = this.worker ? new WorkerRpc(this.worker) : null;
    this.usingWorker = !!this.rpc;
  }

  async index(cues) {
    this._ensureWorker();
    if (this.rpc && this.usingWorker) {
      try {
        const r = await this.rpc.call({ type: 'index', cues });
        this.docCount = r.count || 0;
        return;
      } catch (err) {
        this.usingWorker = false;
      }
    }
    this.fallback.index(cues);
    this.docCount = this.fallback.docs.length;
  }

  async search(query, limit = 40) {
    if (this.rpc && this.usingWorker) {
      try {
        const r = await this.rpc.call({
          type: 'search',
          query,
          limit,
        });
        return r.results || [];
      } catch (err) {
        this.usingWorker = false;
      }
    }
    return this.fallback.search(query, limit);
  }

  async clear() {
    if (this.rpc) {
      try {
        await this.rpc.call({ type: 'clear' });
      } catch {
        // The search worker is unavailable: the main-thread index is cleared below.
      }
    }
    this.fallback.index([]);
    this.docCount = 0;
  }

  isEmpty() {
    return this.docCount === 0;
  }

  terminate() {
    this.rpc?.terminate();
    this.rpc = null;
    this.worker = null;
    this._initialized = false;
  }
}
