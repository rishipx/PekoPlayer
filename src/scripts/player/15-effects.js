// Player: Visual effects presets and interface synchronisation
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      applyEffectsPreset(name) {
        const p = EFFECTS_PRESETS[name];
        if (!p) return;
        this.effects = {
          ...this.effects,
          ...p,
          preset: name,
        };
        this.syncEffectsUI();
        if (name === 'none') {
          if (this.shaderRenderer) this.setEffectsEnabled(false, { silent: true });
          return;
        }
        this.lazyInitShaderRenderer()?.apply(this.effects);
        if (!this.effects.enabled) this.setEffectsEnabled(true, { silent: true });
        else this.shaderRenderer?.apply(this.effects);
        this.saveSettings();
      },

      setEffectField(name, value) {
        this.effects[name] = value;
        const m = Object.entries(EFFECTS_PRESETS).find(
          ([, p]) =>
            p.exposure === this.effects.exposure &&
            p.contrast === this.effects.contrast &&
            p.saturation === this.effects.saturation &&
            p.temperature === this.effects.temperature &&
            p.tint === this.effects.tint &&
            p.sharpen === this.effects.sharpen &&
            p.vignette === this.effects.vignette,
        );
        this.effects.preset = m ? m[0] : 'custom';
        this.syncEffectsUI();
        if (!this.effects.enabled) this.setEffectsEnabled(true, { silent: true });
        else this.shaderRenderer?.apply(this.effects);
        this.saveSettings();
      },

      setEffectsEnabled(on, opts = {}) {
        const r = this.lazyInitShaderRenderer();
        if (!r || !r.supported) return;
        this.effects.enabled = !!on;
        r.setEnabled(this.effects.enabled);
        r.apply(this.effects);
        this.applyBrightness();
        this._applyShaderCanvasRect();
        if (!opts.silent) this.announce(this.effects.enabled ? 'Video effects on' : 'Video effects off');
        this.syncEffectsUI();
        this.saveSettings();
      },

      cycleEffects() {
        const cur = this.effects.preset || 'none';
        let idx = EFFECTS_CYCLE_ORDER.indexOf(cur);
        if (idx === -1) idx = 0;
        const next = EFFECTS_CYCLE_ORDER[(idx + 1) % EFFECTS_CYCLE_ORDER.length];
        this.applyEffectsPreset(next);
        const name = EFFECTS_FRIENDLY_NAMES[next] || next;
        this.showActionBadge(next === 'none' ? BADGE_ICON_OFF : BADGE_ICON_EFFECTS, 'Effects', name, next !== 'none');
        this.announce(next === 'none' ? 'Effects off' : `Effects ${name}`);
      },

      cycleLoopModeWithBadge() {
        const order = ['off', 'all', 'one'];
        this.loopMode = order[(order.indexOf(this.loopMode) + 1) % order.length];
        this.syncLoopUI();
        this.saveSettings();
        const labels = {
          off: 'Off',
          all: 'All',
          one: 'One',
        };
        this.showActionBadge(BADGE_ICON_LOOP, 'Loop', labels[this.loopMode], this.loopMode !== 'off');
        this.announce(`Loop ${labels[this.loopMode]}`);
      },

      toggleEffects() {
        this.setEffectsEnabled(!this.effects.enabled);
      },

      resetEffects() {
        this.effects = {
          ...this.effects,
          ...EFFECTS_PRESETS.none,
          preset: 'none',
        };
        this.syncEffectsUI();
        if (this.effects.enabled) this.shaderRenderer?.apply(this.effects);
        this.saveSettings();
      },

      /** Reflects the current effects settings in the settings-menu controls. */
      syncEffectsUI() {
        const el = this.el;
        if (!el.fxToggleRow) return;
        el.fxToggleRow.classList.toggle('on', this.effects.enabled);
        el.fxToggleRow.setAttribute('aria-checked', String(this.effects.enabled));
        el.fxPreset.value = this.effects.preset;
        el.fxExposure.value = String(this.effects.exposure);
        el.fxContrast.value = String(this.effects.contrast);
        el.fxSaturation.value = String(this.effects.saturation);
        el.fxTemperature.value = String(this.effects.temperature);
        el.fxTint.value = String(this.effects.tint);
        el.fxSharpen.value = String(this.effects.sharpen);
        el.fxVignette.value = String(this.effects.vignette);
        el.fxExposureValue.textContent = this.effects.exposure.toFixed(2);
        el.fxContrastValue.textContent = this.effects.contrast.toFixed(2);
        el.fxSaturationValue.textContent = this.effects.saturation.toFixed(2);
        el.fxTemperatureValue.textContent = this.effects.temperature.toFixed(2);
        el.fxTintValue.textContent = this.effects.tint.toFixed(2);
        el.fxSharpenValue.textContent = this.effects.sharpen.toFixed(2);
        el.fxVignetteValue.textContent = this.effects.vignette.toFixed(2);
        const name = EFFECTS_FRIENDLY_NAMES[this.effects.preset] || this.effects.preset;
        if (el.fxNavValue) el.fxNavValue.textContent = this.effects.enabled ? name : 'Off';
        if (el.fxCurrentValue) el.fxCurrentValue.textContent = this.effects.enabled ? name : 'Off';
      },

      /** Reflects the interface preferences in the settings-menu controls. */
      syncInterfaceUI() {
        const el = this.el;
        if (el.showTitleRow) {
          el.showTitleRow.classList.toggle('on', this.showStageTitle);
          el.showTitleRow.setAttribute('aria-checked', String(this.showStageTitle));
        }
        if (el.compactSpeedRow) {
          el.compactSpeedRow.classList.toggle('on', this.compactSpeedBtn);
          el.compactSpeedRow.setAttribute('aria-checked', String(this.compactSpeedBtn));
        }
        if (el.reduceMotionRow) {
          el.reduceMotionRow.classList.toggle('on', this.reduceMotion || this.systemReducedMotion);
          el.reduceMotionRow.setAttribute('aria-checked', String(this.reduceMotion || this.systemReducedMotion));
        }
        document.documentElement.classList.toggle('reduce-motion', this.reduceMotion || this.systemReducedMotion);
        document.body.classList.toggle('stage-title-hidden', !this.showStageTitle);
        if (!this.showStageTitle && el.stageTitle) el.stageTitle.classList.remove('visible');
        if (el.themeSwatches)
          el.themeSwatches
            .querySelectorAll('button[data-theme]')
            .forEach((b) =>
              b.classList.toggle('active', (b.getAttribute('data-theme') || '').toLowerCase() === this.themeColor),
            );
        if (el.themePicker) el.themePicker.value = this.themeColor;
      },
    };
  })(),
);
