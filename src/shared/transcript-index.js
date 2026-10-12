// Transcript index shared by the page and the transcript worker. The build adds this file to the player bundle and to the
// worker script, so there is a single implementation. It must not touch the DOM or any worker-only API.

/**
 * In-memory inverted index over subtitle cues, with ranked search. Exact word matches outrank prefix matches, and when a
 * query finds fewer than three cues it also accepts words that are one typo away.
 */
class TranscriptIndex {
  constructor() {
    this.docs = [];
    this.postings = new Map();
    this.lengthBuckets = new Map();
  }

  /** Splits text into lowercase search tokens, dropping punctuation, single characters and bare numbers. */
  static tokenize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !/^\d+$/.test(t));
  }

  /** True when the Levenshtein distance between two words is at most `max`. */
  static withinEditDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    const m = a.length;
    const n = b.length;
    if (m === 0) return n <= max;
    if (n === 0) return m <= max;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      let rowMin = curr[0];
      for (let k = 1; k <= n; k++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
        if (curr[k] < rowMin) rowMin = curr[k];
      }
      if (rowMin > max) return false;
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n] <= max;
  }

  /** Builds the token index for a list of cues, replacing any previous index. */
  index(cues) {
    this.docs = [];
    this.postings = new Map();
    this.lengthBuckets = new Map();
    cues.forEach((cue, i) => {
      const text = String(cue.text || '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!text) return;
      const doc = { id: i, text, start: cue.start, end: cue.end };
      this.docs.push(doc);
      const seen = new Set();
      TranscriptIndex.tokenize(text).forEach((token) => {
        if (seen.has(token)) return;
        seen.add(token);
        if (!this.postings.has(token)) {
          this.postings.set(token, new Set());
          const bucket = this.lengthBuckets.get(token.length) || new Set();
          bucket.add(token);
          this.lengthBuckets.set(token.length, bucket);
        }
        this.postings.get(token).add(doc.id);
      });
    });
  }

  isEmpty() {
    return this.docs.length === 0;
  }

  /** Returns the cues that match a query, best matches first. */
  search(query, limit = 40) {
    const terms = TranscriptIndex.tokenize(query);
    if (!terms.length) return [];
    const scores = new Map();
    const matched = new Map();
    const add = (id, weight, term) => {
      scores.set(id, (scores.get(id) || 0) + weight);
      if (!matched.has(id)) matched.set(id, new Set());
      matched.get(id).add(term);
    };

    for (const term of terms) {
      for (const [token, docIds] of this.postings) {
        let weight = 0;
        if (token === term) weight = 3;
        else if (token.startsWith(term)) weight = 2;
        if (weight) docIds.forEach((id) => add(id, weight, term));
      }
    }

    // Few hits: also accept words that differ by one edit, which covers most typos.
    if (scores.size < 3) {
      for (const term of terms) {
        const candidates = new Set();
        for (const length of [term.length - 1, term.length, term.length + 1]) {
          this.lengthBuckets.get(length)?.forEach((token) => candidates.add(token));
        }
        candidates.forEach((token) => {
          if (token === term || token.startsWith(term)) return;
          if (!TranscriptIndex.withinEditDistance(term, token, 1)) return;
          this.postings.get(token)?.forEach((id) => add(id, 1, term));
        });
      }
    }

    const results = [];
    for (const [id, score] of scores) {
      const doc = this.docs[id];
      if (!doc) continue;
      results.push({
        start: doc.start,
        end: doc.end,
        text: doc.text,
        score,
        matches: Array.from(matched.get(id) || []),
      });
    }
    results.sort((a, b) => b.score - a.score || a.start - b.start);
    return results.slice(0, limit);
  }
}
