// Player: Fit, ratio, brightness, rotation, zoom and pan
PekoClassParts.install(
  PekoPlayer,
  (function () {
    'use strict';
    return {
      setVideoFit(m) {
        this.videoFit = m;
        this.applyVideoDisplay();
        this._applyShaderCanvasRect();
        this.syncVideoFitUI();
        this.saveSettings();
      },

      setVideoRatio(r) {
        this.videoRatio = r;
        this.applyVideoDisplay();
        this._applyShaderCanvasRect();
        this.syncVideoRatioUI();
        this.saveSettings();
      },

      syncVideoFitUI() {
        document
          .querySelectorAll('#videoFitGroup [data-fit]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-fit') === this.videoFit));
      },

      syncVideoRatioUI() {
        document
          .querySelectorAll('#videoRatioGroup [data-ratio]')
          .forEach((b) => b.classList.toggle('active', b.getAttribute('data-ratio') === this.videoRatio));
      },

      /** Sizes and positions the video inside the stage for the current zoom, pan, rotation and aspect settings. */
      applyVideoDisplay() {
        const v = this.el.video,
          stage = this.el.stage;
        const vw = v.videoWidth,
          vh = v.videoHeight;
        if (!vw || !vh) return;
        const sw = stage.clientWidth,
          sh = stage.clientHeight;
        if (!sw || !sh) return;
        const objectFit =
          this.videoFit === 'cover'
            ? 'cover'
            : this.videoFit === 'fill'
              ? 'fill'
              : this.videoFit === 'contain'
                ? 'contain'
                : 'scale-down';
        if (this.videoRatio === 'auto') {
          v.style.position = '';
          v.style.width = '100%';
          v.style.height = '100%';
          v.style.left = '';
          v.style.top = '';
          v.style.objectFit = objectFit;
          this._applyShaderCanvasRect();
          return;
        }
        const parts = this.videoRatio.split(':').map(Number);
        const aspect = parts[0] && parts[1] ? parts[0] / parts[1] : vw / vh;
        const stageAspect = sw / sh;
        let dw, dh;
        if (stageAspect > aspect) {
          dh = sh;
          dw = sh * aspect;
        } else {
          dw = sw;
          dh = sw / aspect;
        }
        v.style.position = 'absolute';
        v.style.width = `${dw}px`;
        v.style.height = `${dh}px`;
        v.style.left = `${(sw - dw) / 2}px`;
        v.style.top = `${(sh - dh) / 2}px`;
        v.style.objectFit = this.videoFit === 'cover' ? 'cover' : this.videoFit === 'fill' ? 'fill' : 'contain';
        this._applyShaderCanvasRect();
      },

      /** Keeps the effects canvas aligned with the displayed video. */
      _applyShaderCanvasRect() {
        const r = this.shaderRenderer;
        if (!r?.canvas) return;
        const v = this.el.video,
          stage = this.el.stage;
        const vw = v.videoWidth,
          vh = v.videoHeight;
        if (!vw || !vh) return;
        const sw = stage.clientWidth,
          sh = stage.clientHeight;
        if (!sw || !sh) return;
        let aspect;
        if (this.videoRatio === 'auto') aspect = vw / vh;
        else {
          const parts = this.videoRatio.split(':').map(Number);
          aspect = parts[0] && parts[1] ? parts[0] / parts[1] : vw / vh;
        }
        const fit = this.videoFit,
          stageAspect = sw / sh;
        let dw, dh;
        if (fit === 'fill') {
          dw = sw;
          dh = sh;
        } else if (fit === 'cover') {
          if (stageAspect > aspect) {
            dw = sw;
            dh = sw / aspect;
          } else {
            dh = sh;
            dw = sh * aspect;
          }
        } else if (fit === 'scale-down' && vw <= sw && vh <= sh) {
          dw = vw;
          dh = vh;
        } else {
          if (stageAspect > aspect) {
            dh = sh;
            dw = sh * aspect;
          } else {
            dw = sw;
            dh = sw / aspect;
          }
        }
        const c = r.canvas;
        c.style.position = 'absolute';
        c.style.left = `${(sw - dw) / 2}px`;
        c.style.top = `${(sh - dh) / 2}px`;
        c.style.width = `${dw}px`;
        c.style.height = `${dh}px`;
      },

      setBrightness(b) {
        this.brightness = Math.max(50, Math.min(200, b));
        this.applyBrightness();
        this.syncBrightnessUI();
        this.saveSettings();
      },

      applyBrightness() {
        const factor = this.brightness / 100;
        const filter = factor !== 1 ? `brightness(${factor})` : '';
        this.el.video.style.filter = filter;
        if (this.shaderRenderer?.canvas) this.shaderRenderer.canvas.style.filter = filter;
      },

      syncBrightnessUI() {
        if (this.el.brightnessSlider) this.el.brightnessSlider.value = String(this.brightness);
        if (this.el.brightnessValue) this.el.brightnessValue.textContent = `${this.brightness}%`;
      },

      rotateVideo() {
        this.state.rotation = (this.state.rotation + 90) % 360;
        this.applyRotation();
      },

      computeRotationFitScale() {
        const video = this.el.video,
          stage = this.el.stage,
          rot = this.state.rotation;
        if (!rot || rot === 180) return 1;
        const vw = video.videoWidth || 16,
          vh = video.videoHeight || 9;
        const cw = stage.clientWidth || 1,
          ch = stage.clientHeight || 1;
        const r = vw / vh;
        const renderedW = cw / ch > r ? ch * r : cw;
        const renderedH = cw / ch > r ? ch : cw / r;
        const targetW = cw / ch > 1 / r ? ch / r : cw;
        const targetH = cw / ch > 1 / r ? ch : cw * r;
        return Math.min(targetW / renderedH, targetH / renderedW);
      },

      applyRotation() {
        this.applyVideoTransform();
      },

      applyVideoTransform() {
        const video = this.el.video,
          rot = this.state.rotation;
        const scale = this.computeRotationFitScale() * this.state.zoom;
        const t = `translateZ(0) translate(${this.state.panX}px, ${this.state.panY}px) scale(${scale}) rotate(${rot}deg)`;
        video.style.transform = t;
        if (this.shaderRenderer?.canvas) this.shaderRenderer.canvas.style.transform = t;
      },

      handleZoomWheel(e) {
        if (!this.el.video.videoWidth) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const stage = this.el.stage,
          rect = stage.getBoundingClientRect();
        const anchorX = e.clientX - (rect.left + rect.width / 2);
        const anchorY = e.clientY - (rect.top + rect.height / 2);
        this.setZoom(this.state.zoom + delta, anchorX, anchorY);
      },

      setZoom(z, anchorX, anchorY) {
        const c = Math.min(4, Math.max(1, Math.round(z * 100) / 100));
        if (c === this.state.zoom) return;
        const oldZoom = this.state.zoom;
        if (typeof anchorX === 'number' && typeof anchorY === 'number' && oldZoom > 0) {
          const k = c / oldZoom;
          this.state.panX = anchorX - (anchorX - this.state.panX) * k;
          this.state.panY = anchorY - (anchorY - this.state.panY) * k;
        }
        this.state.zoom = c;
        if (c === 1) {
          this.state.panX = 0;
          this.state.panY = 0;
        } else this.clampPan();
        this.applyVideoTransform();
        this.el.stage.classList.toggle('zoomed', c > 1);
      },

      resetZoom() {
        if (this.state.zoom === 1 && !this.state.panX && !this.state.panY) return;
        this.state.zoom = 1;
        this.state.panX = 0;
        this.state.panY = 0;
        this.applyVideoTransform();
        this.el.stage.classList.remove('zoomed');
      },

      clampPan() {
        const stage = this.el.stage;
        const mx = (stage.clientWidth * (this.state.zoom - 1)) / 2;
        const my = (stage.clientHeight * (this.state.zoom - 1)) / 2;
        this.state.panX = Math.min(mx, Math.max(-mx, this.state.panX));
        this.state.panY = Math.min(my, Math.max(-my, this.state.panY));
      },

      /** Lets the user drag the zoomed video to pan it. */
      bindZoomPan() {
        const { stage, video } = this.el;
        let dragging = false,
          sx = 0,
          sy = 0,
          spx = 0,
          spy = 0;
        stage.addEventListener('mousedown', (e) => {
          if (this.state.zoom <= 1 || e.target.closest('.controls')) return;
          dragging = true;
          sx = e.clientX;
          sy = e.clientY;
          spx = this.state.panX;
          spy = this.state.panY;
          stage.classList.add('panning');
        });
        window.addEventListener('mousemove', (e) => {
          if (!dragging) return;
          this.state.panX = spx + (e.clientX - sx);
          this.state.panY = spy + (e.clientY - sy);
          this.clampPan();
          this.applyVideoTransform();
        });
        window.addEventListener('mouseup', () => {
          dragging = false;
          stage.classList.remove('panning');
        });
        video.addEventListener('dblclick', () => this.resetZoom());
      },
    };
  })(),
);
