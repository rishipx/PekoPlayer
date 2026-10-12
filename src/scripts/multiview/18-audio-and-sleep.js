// Multi-view: Tile audio graph, equalizer menu and sleep timer
PekoClassParts.install(
  MultiView,
  (function () {
    'use strict';
    return {
      ensureTileAudioGraph(tile) {
        if (tile._audioGraphReady) return true;
        if (tile.type !== 'local' || !tile.video) return false;
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return false;
          tile._audioCtx = new Ctx();
          const src = tile._audioCtx.createMediaElementSource(tile.video);
          const { filters, output } = PekoEq.buildChain(tile._audioCtx, src);
          tile._bassFilter = filters.bass;
          tile._midFilter = filters.mid;
          tile._trebleFilter = filters.treble;
          tile._bassFilter.gain.value = this.eq.bass;
          tile._midFilter.gain.value = this.eq.mid;
          tile._trebleFilter.gain.value = this.eq.treble;
          output.connect(tile._audioCtx.destination);
          tile._audioCtx.resume().catch(() => {});
          tile._audioGraphReady = true;
          return true;
        } catch {
          return false;
        }
      },

      setEqBass(d) {
        this.eq.bass = Math.min(12, Math.max(-12, d));
        this.tiles.forEach((t) => {
          if (this.ensureTileAudioGraph(t) && t._bassFilter) t._bassFilter.gain.value = this.eq.bass;
        });
        this.syncEqUI();
        this.saveMvSettings();
      },

      setEqMid(d) {
        this.eq.mid = Math.min(12, Math.max(-12, d));
        this.tiles.forEach((t) => {
          if (this.ensureTileAudioGraph(t) && t._midFilter) t._midFilter.gain.value = this.eq.mid;
        });
        this.syncEqUI();
        this.saveMvSettings();
      },

      setEqTreble(d) {
        this.eq.treble = Math.min(12, Math.max(-12, d));
        this.tiles.forEach((t) => {
          if (this.ensureTileAudioGraph(t) && t._trebleFilter) t._trebleFilter.gain.value = this.eq.treble;
        });
        this.syncEqUI();
        this.saveMvSettings();
      },

      setEqPreset(id) {
        const p = PekoEq.PRESETS.find((x) => x.id === id);
        if (!p) {
          this.syncEqUI();
          return;
        }
        this.eq = {
          bass: p.bass,
          mid: p.mid,
          treble: p.treble,
        };
        this.tiles.forEach((t) => {
          if (this.ensureTileAudioGraph(t) && t._bassFilter && t._midFilter && t._trebleFilter) {
            t._bassFilter.gain.value = this.eq.bass;
            t._midFilter.gain.value = this.eq.mid;
            t._trebleFilter.gain.value = this.eq.treble;
          }
        });
        this.syncEqUI();
        this.saveMvSettings();
      },

      resetEq() {
        this.eq = { ...PekoEq.DEFAULT };
        this.tiles.forEach((t) => {
          if (t._audioGraphReady && t._bassFilter && t._midFilter && t._trebleFilter) {
            t._bassFilter.gain.value = 0;
            t._midFilter.gain.value = 0;
            t._trebleFilter.gain.value = 0;
          }
        });
        this.syncEqUI();
        this.saveMvSettings();
      },

      syncEqUI() {
        const { mvEqBass, mvEqMid, mvEqTreble, mvEqBassValue, mvEqMidValue, mvEqTrebleValue, mvEqPreset } = this.el;
        if (!mvEqBass) return;
        mvEqBass.value = String(this.eq.bass);
        mvEqMid.value = String(this.eq.mid);
        mvEqTreble.value = String(this.eq.treble);
        mvEqBassValue.textContent = `${this.eq.bass > 0 ? '+' : ''}${this.eq.bass}dB`;
        mvEqMidValue.textContent = `${this.eq.mid > 0 ? '+' : ''}${this.eq.mid}dB`;
        mvEqTrebleValue.textContent = `${this.eq.treble > 0 ? '+' : ''}${this.eq.treble}dB`;
        if (mvEqPreset) {
          const m = PekoEq.matchPreset(this.eq);
          if (m === 'custom' && !mvEqPreset.querySelector('option[value="custom"]')) {
            const o = document.createElement('option');
            o.value = 'custom';
            o.textContent = 'Custom';
            mvEqPreset.appendChild(o);
          }
          mvEqPreset.value = m;
        }
      },

      toggleEqMenu() {
        const menu = this.el.mvEqMenu;
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        this.el.mvEqBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          this.closeSleepMenu();
          requestAnimationFrame(() => this.positionMvPopover(menu, this.el.mvEqBtn));
        }
      },

      closeEqMenu() {
        this.el.mvEqMenu.hidden = true;
        this.el.mvEqBtn.setAttribute('aria-expanded', 'false');
      },

      toggleSleepMenu() {
        const menu = this.el.mvSleepMenu;
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        this.el.mvSleepBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          this.closeEqMenu();
          requestAnimationFrame(() => this.positionMvPopover(menu, this.el.mvSleepBtn));
        }
      },

      closeSleepMenu() {
        this.el.mvSleepMenu.hidden = true;
        this.el.mvSleepBtn.setAttribute('aria-expanded', 'false');
      },

      setSleepMode(mode) {
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.sleepMode = mode;
        this.el.mvSleepMenu
          .querySelectorAll('[data-sleep]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-sleep') === mode));
        this.el.mvSleepBtn.classList.toggle('active', mode !== 'off');
        if (mode === 'off') return;
        const m = Number(mode);
        if (!m) return;
        this.sleepTimer = setTimeout(() => {
          this.forEachTile((t) => this.pauseTile(t));
          this.setSleepMode('off');
        }, m * 60000);
      },
    };
  })(),
);
