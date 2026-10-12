// Player: Initialization: element cache, boot sequence, reduced motion, equalizer options, shader renderer, storage
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      /** Looks up every player element by id once and returns them keyed by id. */
      cacheElements() {
        const ids = [
          'app',
          'stage',
          'video',
          'shaderCanvas',
          'stageTitle',
          'emptyState',
          'dropZone',
          'loading',
          'fileInput',
          'subtitleInput',
          'resumeToast',
          'resumeText',
          'resumeYes',
          'resumeNo',
          'resumeCountdown',
          'centerFlash',
          'centerFlashIcon',
          'centerFlashLabel',
          'actionBadge',
          'actionBadgeIcon',
          'actionBadgeLabel',
          'actionBadgeValue',
          'volumeOverlay',
          'volumeIcon',
          'volumeFill',
          'volumeText',
          'captionsCue',
          'controls',
          'controlBar',
          'progressContainer',
          'bufferedBar',
          'progressBar',
          'progressHandle',
          'progressTooltip',
          'progressTooltipTime',
          'progressThumb',
          'abLoopRange',
          'abLoopDuration',
          'abMarkerA',
          'abMarkerB',
          'abLoopBtn',
          'abLoopValue',
          'prevBtn',
          'rewindBtn',
          'playBtn',
          'forwardBtn',
          'nextBtn',
          'playlistQuickBtn',
          'currentTime',
          'currentTimeMini',
          'durationMini',
          'duration',
          'muteBtn',
          'volumeSlider',
          'playlistShuffleBtn',
          'captionsBtn',
          'captionsMenu',
          'captionsList',
          'captionsEmpty',
          'embeddedTextList',
          'searchSubsBtn',
          'transcriptSyncBtn',
          'speedSelect',
          'speedBtn',
          'speedMenu',
          'fullscreenBtn',
          'pipQuickBtn',
          'topbar',
          'topbarHideBtn',
          'topbarRevealBtn',
          'openBtn',
          'openFolderBtn',
          'castBtn',
          'playlistToggleBtn',
          'playlistPanel',
          'playlistItems',
          'playlistEmpty',
          'playlistCount',
          'playlistAddBtn',
          'playlistClearBtn',
          'helpBtn',
          'installPwaBtn',
          'shortcutsModal',
          'shortcutsCloseBtn',
          'srStatus',
          'srAlert',
          'downloadAnchor',
          'holdSpeedBadge',
          'holdSpeedText',
          'playlistSearch',
          'playlistSort',
          'playlistStats',
          'playlistCloseBtn',
          'searchPanel',
          'searchToggleBtn',
          'searchPanelCloseBtn',
          'searchInput',
          'searchStatus',
          'searchResults',
          'chapterList',
          'fxToggleRow',
          'fxState',
          'fxPreset',
          'fxExposure',
          'fxExposureValue',
          'fxContrast',
          'fxContrastValue',
          'fxSaturation',
          'fxSaturationValue',
          'fxTemperature',
          'fxTemperatureValue',
          'fxTint',
          'fxTintValue',
          'fxSharpen',
          'fxSharpenValue',
          'fxVignette',
          'fxVignetteValue',
          'fxResetBtn',
          'fxCurrentValue',
          'bookmarkBtn',
          'bookmarkLayer',
          'settingsBtn',
          'settingsMenu',
          'moreRotateBtn',
          'moreScreenshotBtn',
          'moreStepBackBtn',
          'moreStepForwardBtn',
          'moreSilenceSkipBtn',
          'silenceSkipRow',
          'silenceThreshold',
          'silenceThresholdValue',
          'silenceSkipBadge',
          'eqBass',
          'eqMid',
          'eqTreble',
          'eqBassValue',
          'eqMidValue',
          'eqTrebleValue',
          'eqPreset',
          'audioTrackRow',
          'audioTrackSelect',
          'videoFitGroup',
          'videoRatioGroup',
          'controlLayoutGroup',
          'controlLookGroup',
          'brightnessSlider',
          'brightnessValue',
          'subtitleSettingsPopover',
          'subNativeRow',
          'subPastelRow',
          'subDelaySlider',
          'subDelayValue',
          'subDelayBoxValue',
          'subDelayEarlier',
          'subDelayLater',
          'capFontGroup',
          'capSizeSlider',
          'capSizeValue',
          'capPositionSlider',
          'capPositionValue',
          'capBgToggleRow',
          'capColorSwatches',
          'capColorPicker',
          'capStyleResetBtn',
          'capSubtitleSettingsBtn',
          'multiviewOpenBtn',
          'showTitleRow',
          'compactSpeedRow',
          'reduceMotionRow',
          'fxNavValue',
          'eqNavValue',
          'themeSwatches',
          'themePicker',
          'abLoopBadge',
          'abLoopBadgeElapsed',
          'abLoopBadgeTotal',
          'abLoopBadgeRemaining',
          'playlistCarousel',
          'plcTrack',
          'plcPrevBtn',
          'plcNextBtn',
          'plcTitleBtn',
          'plcTitleText',
          'plcCloseBtn',
          'plcAddBtn',
          'plcClearBtn',
          'plcShuffleBtn',
          'plcSort',
          'plcListPopup',
          'plcList',
          'plcListSearch',
          'playlistBtnPlacementRow',
          'playlistStyleGroup',
        ];
        return ids.reduce((a, id) => {
          const n = document.getElementById(id);
          if (n) a[id] = n;
          return a;
        }, {});
      },

      /** Starts the player: opens storage, loads the saved settings and applies them. */
      init() {
        this.initDB().catch((err) => console.warn('Storage unavailable', err));
        this.buildEqPresetOptions();
        this.loadSettings();
        this.checkSystemReducedMotion();
        this.applyControlLayout(this.controlLayout, { silent: true });
        this.applyControlLook(this.controlLook, { silent: true });
        this.applyVolumeToMedia();
        this.bindEvents();
        this.renderPlaylist();
        this.syncVolumeUI();
        this.syncEffectsUI();
        this.syncSubtitleSettingsUI();
        this.syncInterfaceUI();
        this.syncSpeedBtn();
        this.syncVideoFitUI();
        this.syncVideoRatioUI();
        this.syncBrightnessUI();
        this.syncControlLayoutUI();
        this.syncControlLookUI();
        this.syncPlaylistButtonPlacement();
        this.syncPlaylistStyleUI();
        this._syncShuffleUI();
        this._syncSortUI();
        this.setupMediaSession();
        this.setupCast();
        this.bindPlaylistPreview();
        this.bindChapterPreview();
        this.bindWakeLock();
        this.bindPipState();
        this.applyVideoDisplay();
        this.applyBrightness();
        this.updateTimeDisplay();
        this._bindSyncPauseOnInteraction();
        setTimeout(() => this.ensureThumbnails(), 300);
      },

      /** Follows the system reduced-motion preference and reflects it in the settings menu. */
      checkSystemReducedMotion() {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const apply = (matches) => {
          this.systemReducedMotion = matches;
          const row = this.el.reduceMotionRow;
          if (!row) return;
          if (matches) {
            row.setAttribute('aria-disabled', 'true');
            row.setAttribute('tabindex', '-1');
            row.classList.add('on');
            row.setAttribute('aria-checked', 'true');
            const desc = row.querySelector('.settings-toggle-desc');
            if (desc) desc.textContent = 'Controlled by your system settings.';
            document.documentElement.classList.add('reduce-motion');
          } else {
            row.removeAttribute('aria-disabled');
            row.setAttribute('tabindex', '0');
            const desc = row.querySelector('.settings-toggle-desc');
            if (desc) desc.textContent = 'Minimize animations throughout the interface.';
          }
        };
        apply(mq.matches);
        mq.addEventListener?.('change', (e) => apply(e.matches));
      },

      buildEqPresetOptions() {
        const s = this.el.eqPreset;
        if (!s) return;
        s.innerHTML = '';
        PekoEq.PRESETS.forEach((p) => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name;
          s.appendChild(o);
        });
      },

      /** Creates the WebGL effects renderer on first use and returns it (null when there is no canvas). */
      lazyInitShaderRenderer() {
        if (this.shaderRenderer) return this.shaderRenderer;
        if (!this.el.shaderCanvas) return null;
        const video = this.el.video,
          canvas = this.el.shaderCanvas;
        const r = createShaderRenderer(video, canvas, this.el.stage);
        this.shaderRenderer = r;
        if (!r.supported) return r;
        video.addEventListener('play', () => r.setPlaying(true));
        video.addEventListener('pause', () => r.setPlaying(false));
        video.addEventListener('seeked', () => r.invalidate());
        video.addEventListener('loadedmetadata', () => {
          r.resize();
          this._applyShaderCanvasRect();
        });
        window.addEventListener(
          'resize',
          PekoUtils.debounce(() => {
            r.resize();
            this._applyShaderCanvasRect();
          }, 150),
          { passive: true },
        );
        r.apply(this.effects);
        this.applyBrightness();
        if (this.effects.enabled) r.setEnabled(true);
        return r;
      },

      async initDB() {
        this.db = await PekoDB.open();
        await this.restorePlaylistFromDB();
      },
    };
  })(),
);
