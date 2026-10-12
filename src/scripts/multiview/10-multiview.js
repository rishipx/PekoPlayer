// Multi-view wall controller: constructor and state. Methods are installed by the files that follow.
class MultiView {
  constructor() {
    this.el = this.cacheElements();
    if (!this.el.mvView) {
      document.documentElement.classList.remove('mv-boot');
      return;
    }
    this.tiles = [];
    this.layoutMode = 'grid';
    this.cols = 2;
    this.colFr = [];
    this.rowFr = [];
    this._splitSig = null;
    this.gridSizes = null;
    this._gridLayout = null;
    this._gutterEls = new Map();
    this._reorder = null;
    this.zCounter = 1;
    this.allMuted = false;
    this.isOpen = false;
    this.db = null;
    this.activeTileId = null;
    this.eq = {
      bass: 0,
      mid: 0,
      treble: 0,
    };
    this.sleepMode = 'off';
    this.sleepTimer = null;
    this._ytApiPromise = null;
    this.initDB();
    this.loadMvSettings();
    this.buildMvEqPresetOptions();
    this.bindEvents();
    this.applyMvUiFromState();
    this._tickerTimer = null;
    if (this.isOpen) {
      this.el.mvView.hidden = false;
      this.startTicker();
    }
    document.documentElement.classList.remove('mv-boot');
  }
}
