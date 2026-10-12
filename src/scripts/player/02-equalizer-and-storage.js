// Audio equalizer presets and the IndexedDB playlist store

/** Equalizer model: the three filter bands, the presets, and the Web Audio filter chain they drive. */
const PekoEq = {
  BANDS: {
    bass: {
      type: 'lowshelf',
      freq: 200,
      q: 0,
    },
    mid: {
      type: 'peaking',
      freq: 1000,
      q: 1,
    },
    treble: {
      type: 'highshelf',
      freq: 3000,
      q: 0,
    },
  },
  PRESETS: [
    {
      id: 'flat',
      name: 'Flat',
      bass: 0,
      mid: 0,
      treble: 0,
    },
    {
      id: 'bass',
      name: 'Bass Boost',
      bass: 8,
      mid: 0,
      treble: -2,
    },
    {
      id: 'vocal',
      name: 'Vocal',
      bass: -3,
      mid: 4,
      treble: 1,
    },
    {
      id: 'treble',
      name: 'Treble Boost',
      bass: -2,
      mid: 0,
      treble: 8,
    },
    {
      id: 'loudness',
      name: 'Loudness',
      bass: 6,
      mid: -1,
      treble: 4,
    },
    {
      id: 'podcast',
      name: 'Podcast',
      bass: -4,
      mid: 3,
      treble: 1,
    },
  ],
  DEFAULT: {
    bass: 0,
    mid: 0,
    treble: 0,
  },
  /** Returns the name of the preset that matches the given bass, mid and treble values, or 'custom'. */
  matchPreset(eq) {
    const p = this.PRESETS.find((pr) => pr.bass === eq.bass && pr.mid === eq.mid && pr.treble === eq.treble);
    return p ? p.id : 'custom';
  },
  /** Creates the lowshelf, peaking and highshelf filters, connects them in series after `source`, and returns the filters by band plus the last node. */
  buildChain(ctx, source) {
    const filters = {};
    let node = source;
    for (const [key, band] of Object.entries(this.BANDS)) {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      if (band.q) f.Q.value = band.q;
      f.gain.value = 0;
      node.connect(f);
      node = f;
      filters[key] = f;
    }
    return { filters, output: node };
  },
};

/** Promise wrapper around the IndexedDB store that keeps opened videos (and multi-view tiles) between visits. */
const PekoDB = {
  NAME: PekoConfig.STORAGE.database,
  VERSION: 5,
  STORE: 'playlist',
  MV_STORE: 'multiview',
  QUOTA_WARNED: false,
  /** Opens (and upgrades, if needed) the IndexedDB database that stores saved videos and multi-view tiles. */
  open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(this.NAME, this.VERSION);
      req.onupgradeneeded = () => {
        const db = req.result,
          tx = req.transaction;
        if (!tx) return;
        let store;
        if (!db.objectStoreNames.contains(this.STORE)) store = db.createObjectStore(this.STORE, { keyPath: 'id' });
        else store = tx.objectStore(this.STORE);
        if (!store.indexNames.contains('by_name_size'))
          store.createIndex('by_name_size', ['name', 'size'], { unique: false });
        if (!store.indexNames.contains('by_addedAt')) store.createIndex('by_addedAt', 'addedAt', { unique: false });
        if (!db.objectStoreNames.contains(this.MV_STORE))
          store = db.createObjectStore(this.MV_STORE, { keyPath: 'id' });
        else store = tx.objectStore(this.MV_STORE);
        if (!store.indexNames.contains('by_name_size'))
          store.createIndex('by_name_size', ['name', 'size'], { unique: false });
        if (db.objectStoreNames.contains('handles')) db.deleteObjectStore('handles');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  tx(db, mode, store = this.STORE) {
    return db.transaction(store, mode).objectStore(store);
  },
  getAll(db, store = this.STORE) {
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readonly', store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  findByNameSize(db, store, name, size) {
    return new Promise((resolve, reject) => {
      if (!name || !Number.isFinite(size)) {
        resolve(undefined);
        return;
      }
      const req = this.tx(db, 'readonly', store).index('by_name_size').get([name, size]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  /** Awaits a database write. When the browser reports that storage is full it warns the user once and does not throw. */
  async guardWrite(promise, announce) {
    try {
      await promise;
    } catch (err) {
      if ((err?.name === 'QuotaExceededError' || err?.code === 22) && !this.QUOTA_WARNED) {
        this.QUOTA_WARNED = true;
        announce?.("Storage is full — new videos won't be saved for next time.");
      }
      throw err;
    }
  },
  put(db, record, store = this.STORE) {
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readwrite', store).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  remove(db, id, store = this.STORE) {
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readwrite', store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  clear(db, store = this.STORE) {
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readwrite', store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
  async updateRecord(db, id, fields, store = this.STORE) {
    const os = this.tx(db, 'readwrite', store);
    const existing = await new Promise((resolve, reject) => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const merged = existing ? Object.assign(existing, fields) : Object.assign({ id }, fields);
    await new Promise((resolve, reject) => {
      const req = os.put(merged);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};
