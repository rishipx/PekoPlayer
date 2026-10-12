// Player controller: constructor and state. Methods are installed by the files that follow.
class PekoPlayer {
  constructor() {
    this.el = this.cacheElements();
    this.playlist = [];
    this.currentIndex = -1;
    this.shuffleOn = false;
    this.loopMode = 'off';
    this.playbackOrder = [];
    this.playbackOrderIndex = -1;
    this.filterText = '';
    this.sortMode = 'manual';
    this.db = null;
    this.volumeLevel = 1;
    this.isMuted = false;
    this.audioGraphReady = false;
    this.audioCtx = null;
    this.audioSource = null;
    this.gainNode = null;
    this.bassFilter = null;
    this.midFilter = null;
    this.trebleFilter = null;
    this.eq = {
      bass: 0,
      mid: 0,
      treble: 0,
    };
    this.silenceSkip = {
      enabled: false,
      thresholdDb: -45,
      skipRate: 8,
      activateAfterMs: 600,
      silentFor: 0,
      active: false,
      preSkipRate: 1,
      interval: null,
      analyser: null,
      buffer: null,
    };
    this.effects = {
      enabled: false,
      preset: 'none',
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
      sharpen: 0,
      vignette: 0,
    };
    this._thumbVideo = null;
    this._thumbToken = 0;
    this._lastThumbRequest = 0;
    this._fileInputIntent = null;
    this._lastMenuCloseAt = 0;
    this._playlistPreviewEl = null;
    this._playlistPreviewTimer = null;
    this._wakeLock = null;
    this._lastResumeWrite = 0;
    this._lastAppliedNative = false;
    this._actionBadgeTimer = null;
    this.themeColor = '#FF6B00';
    this.reduceMotion = false;
    this.systemReducedMotion = false;
    this.videoFit = 'none';
    this.videoRatio = 'auto';
    this.brightness = 100;
    this.controlLayout = 'minimal';
    this.controlLook = 'frost';
    this.subtitleStyle = {
      size: 100,
      color: '#ffffff',
      bg: 'semi',
      edge: 'outline',
      position: 12,
      font: 'inter',
      pastel: false,
      native: false,
      delay: 0,
    };
    this.showStageTitle = true;
    this.compactSpeedBtn = false;
    this.playlistButtonInControlBar = true;
    this.playlistStyle = 'carousel';
    this._trackSnapTimer = null;
    this.settingsPage = 'main';
    this._mainScrollTop = 0;
    this.transcriptIndex = new WorkerTranscriptClient();
    this.chapters = [];
    this._transcriptCues = [];
    this._activeSyncCueIdx = -1;
    this._syncUserPaused = false;
    this._syncResumeTimer = null;
    this._syncScrollingProgrammatically = false;
    this._syncScrollEndTimer = null;
    this._chapterThumbCache = new Map();
    this._chapterThumbQueue = Promise.resolve();
    this._chapterProbe = null;
    this._chapterObserver = null;
    this._searchDebounced = PekoUtils.debounce(() => this._runSearch(), 120);
    this._indexDebounced = PekoUtils.debounce(() => this.indexActiveTranscript(), 80);
    this._renderPlaylistDebounced = PekoUtils.debounce(() => this.renderPlaylist(), 100);
    this._progressUpdateThrottled = PekoUtils.throttle(() => this.updatePlaylistProgress(), 200);
    this._syncScrollThrottled = PekoUtils.throttle(() => this._doRealtimeSync(), 140);
    this._trapShortcuts = null;
    this._trapSearch = null;
    this._trapPlaylist = null;
    this.shaderRenderer = null;
    this._searchQueryToken = 0;
    this._pendingTimeUpdate = false;
    this._bufferedUpdateThrottled = PekoUtils.throttle(() => this.updateBuffered(), 250);
    this.state = {
      isDragging: false,
      wasPlaying: false,
      resumeCandidateTime: 0,
      resumeCountdownTimer: null,
      spaceHoldTimer: null,
      spaceHoldActive: false,
      spaceHoldWasPaused: false,
      preHoldSpeed: 1,
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      loopA: null,
      loopB: null,
      sleepMode: 'off',
      sleepTimer: null,
      searchPanelOpen: false,
      searchTab: 'search',
      timeDisplayMode: 'normal',
      syncTranscriptOn: false,
      abLoopActiveIdx: null,
    };
    this.timers = { volumeOverlay: null };
    this.throttledSaveResume = PekoUtils.throttle(this.saveResumePosition.bind(this), 4000);
    this.debouncedHideControls = PekoUtils.debounce(() => this.maybeHideControls(), 2400);
    this.init();
  }

  _thumbRpc = null;
}
