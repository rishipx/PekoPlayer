// Multi-view: Element cache, play-all button and popover positioning
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      /** Looks up every multi-view element by id once and returns them keyed by id. */
      cacheElements() {
        const ids = [
          'mvView',
          'mvToolbar',
          'mvBackBtn',
          'mvFileInput',
          'mvYtForm',
          'mvYtInput',
          'mvYtAddBtn',
          'mvCanvas',
          'mvEmpty',
          'mvColsStepper',
          'mvColsMinus',
          'mvColsPlus',
          'mvColsValue',
          'mvPlayPauseAllBtn',
          'mvMuteAllBtn',
          'mvClearAllBtn',
          'multiviewOpenBtn',
          'mvSyncStartBtn',
          'mvHideBarBtn',
          'mvFullscreenBtn',
          'mvBarTab',
          'mvFolderBtn',
          'mvSleepBtn',
          'mvSleepMenu',
          'mvEqBtn',
          'mvEqMenu',
          'mvEqPreset',
          'mvEqBass',
          'mvEqMid',
          'mvEqTreble',
          'mvEqBassValue',
          'mvEqMidValue',
          'mvEqTrebleValue',
          'mvEqResetBtn',
        ];
        return ids.reduce((a, id) => {
          const n = document.getElementById(id);
          if (n) a[id] = n;
          return a;
        }, {});
      },

      updatePlayPauseAllBtn() {
        const btn = this.el.mvPlayPauseAllBtn;
        if (!btn) return;
        const anyPaused = this.tiles.some((t) => {
          if (t.player && t.ytReady) {
            try {
              return t.player.getPlayerState() !== 1;
            } catch {
              return true;
            }
          }
          if (t.type === 'local' && t.video) return t.video.paused;
          return false;
        });
        const empty = this.tiles.length === 0;
        const showPlay = empty || anyPaused;
        btn.innerHTML = showPlay ? MV_ICON_PLAY : MV_ICON_PAUSE;
        btn.setAttribute('aria-label', showPlay ? 'Play all' : 'Pause all');
        btn.setAttribute('data-tip', showPlay ? 'Play all' : 'Pause all');
      },

      positionMvPopover(menu, anchor) {
        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const margin = 8;
        let top = rect.bottom + 10;
        if (top + menuRect.height > window.innerHeight - margin)
          top = Math.max(margin, rect.top - menuRect.height - 10);
        menu.style.top = `${top}px`;
        menu.style.left = 'auto';
        menu.style.right = `${Math.max(margin, window.innerWidth - rect.right)}px`;
        menu.style.bottom = 'auto';
      },
    };
  })(),
);
