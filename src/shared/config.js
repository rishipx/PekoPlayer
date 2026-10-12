// Constants that more than one file depends on: where data is stored and how long things take. Each is defined once here,
// so renaming a storage key or tuning a delay is a one-line change. The build adds this file to the player bundle.

const PekoConfig = Object.freeze({
  /** localStorage keys and the IndexedDB name. Renaming one discards what users have saved under the old name. */
  STORAGE: Object.freeze({
    settings: 'pekoplayer:settings',
    resume: 'pekoplayer:resume',
    order: 'pekoplayer:order',
    bookmarks: 'pekoplayer:bookmarks',
    topbarHidden: 'pekoplayer:topbar-hidden',
    multiViewSettings: 'pekoplayer:mv-settings',
    database: 'pekoplayer-db',
  }),

  /** Delays, in milliseconds. */
  TIMING: Object.freeze({
    /** How long a multi-view tile keeps its controls visible without pointer activity. */
    tileControlsHideMs: 2200,
    /** How often the open multi-view wall refreshes progress bars and enforces loops. */
    wallTickMs: 250,
  }),
});
