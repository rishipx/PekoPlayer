// WebGL2 effects renderers (main thread and worker)

const SHADER_VERT_SRC = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const SHADER_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVideo;
uniform vec2 uTexelSize;
uniform float uExposure, uContrast, uSaturation, uTemperature, uTint, uSharpen, uVignette;
void main() {
  vec3 c = texture(uVideo, vUv).rgb;
  if (uSharpen > 0.001) {
    vec3 n = texture(uVideo, vUv + vec2(0.0, -uTexelSize.y)).rgb;
    vec3 s = texture(uVideo, vUv + vec2(0.0, uTexelSize.y)).rgb;
    vec3 e = texture(uVideo, vUv + vec2(uTexelSize.x, 0.0)).rgb;
    vec3 w = texture(uVideo, vUv + vec2(-uTexelSize.x, 0.0)).rgb;
    vec3 blur = (n + s + e + w) * 0.25;
    c += (c - blur) * uSharpen * 4.0;
  }
  c *= pow(2.0, uExposure);
  c = (c - 0.5) * uContrast + 0.5;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  c.r += uTemperature * 0.1; c.b -= uTemperature * 0.1; c.g += uTint * 0.1;
  if (uVignette > 0.001) { vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVignette * 2.2; c *= clamp(v, 0.0, 1.0); }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** WebGL2 video effects drawn on the main thread. Used when OffscreenCanvas workers are unsupported. */
class MainThreadShaderRenderer {
  constructor(video, canvas, stage) {
    this.video = video;
    this.canvas = canvas;
    this.stage = stage;
    this.supported = false;
    this.enabled = false;
    this._rvfc = null;
    this._raf = null;
    this.effects = {};
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
      });
      if (!gl) return;
      this.gl = gl;
      this.supported = true;
      this._compile();
      this._createTexture();
      this._cacheLocations();
    } catch (err) {
      this.supported = false;
    }
  }

  /** Compiles the vertex and fragment shaders and links the program. */
  _compile() {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, SHADER_VERT_SRC),
      fs = compile(gl.FRAGMENT_SHADER, SHADER_FRAG_SRC);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.supported = false;
      return;
    }
    this.program = prog;
    gl.useProgram(prog);
  }

  _createTexture() {
    const gl = this.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  _cacheLocations() {
    const gl = this.gl;
    this.u = {
      video: gl.getUniformLocation(this.program, 'uVideo'),
      texelSize: gl.getUniformLocation(this.program, 'uTexelSize'),
      exposure: gl.getUniformLocation(this.program, 'uExposure'),
      contrast: gl.getUniformLocation(this.program, 'uContrast'),
      saturation: gl.getUniformLocation(this.program, 'uSaturation'),
      temperature: gl.getUniformLocation(this.program, 'uTemperature'),
      tint: gl.getUniformLocation(this.program, 'uTint'),
      sharpen: gl.getUniformLocation(this.program, 'uSharpen'),
      vignette: gl.getUniformLocation(this.program, 'uVignette'),
    };
  }

  setEnabled(on) {
    if (!this.supported) return;
    this.enabled = on;
    this.canvas.hidden = !on;
    this.stage.classList.toggle('shader-active', on);
    if (on) {
      this._resize();
      this._draw();
      if (!this.video.paused) this._startLoop();
    } else this._stopLoop();
  }

  _resize() {
    const vw = this.video.videoWidth,
      vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.min(1, 1920 / Math.max(vw, vh));
    const bw = Math.max(1, Math.round(vw * scale)),
      bh = Math.max(1, Math.round(vh * scale));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
  }

  resize() {
    if (this.enabled) {
      this._resize();
      this._draw();
    }
  }

  /** Stores new effect values and redraws. */
  apply(effects) {
    this.effects = { ...effects };
    if (this.enabled) this._draw();
  }

  /** Redraws on every video frame (requestVideoFrameCallback, or requestAnimationFrame as a fallback) while playing. */
  _startLoop() {
    if (this._rvfc != null || this._raf != null) return;
    const hasRVFC = typeof this.video.requestVideoFrameCallback === 'function';
    const tick = () => {
      if (!this.enabled) {
        this._rvfc = null;
        this._raf = null;
        return;
      }
      this._draw();
      if (hasRVFC) this._rvfc = this.video.requestVideoFrameCallback(tick);
      else this._raf = requestAnimationFrame(tick);
    };
    if (hasRVFC) this._rvfc = this.video.requestVideoFrameCallback(tick);
    else this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._rvfc != null) {
      this.video.cancelVideoFrameCallback?.(this._rvfc);
      this._rvfc = null;
    }
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  invalidate() {
    if (this.enabled) this._draw();
  }

  /** Uploads the current video frame as a texture and draws it with the active effects. */
  _draw() {
    const gl = this.gl,
      v = this.video;
    if (!v.videoWidth || v.readyState < 2) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch {
      return;
    }
    gl.useProgram(this.program);
    gl.uniform1i(this.u.video, 0);
    gl.uniform2f(this.u.texelSize, 1 / v.videoWidth, 1 / v.videoHeight);
    const e = this.effects || {};
    gl.uniform1f(this.u.exposure, e.exposure ?? 0);
    gl.uniform1f(this.u.contrast, e.contrast ?? 1);
    gl.uniform1f(this.u.saturation, e.saturation ?? 1);
    gl.uniform1f(this.u.temperature, e.temperature ?? 0);
    gl.uniform1f(this.u.tint, e.tint ?? 0);
    gl.uniform1f(this.u.sharpen, e.sharpen ?? 0);
    gl.uniform1f(this.u.vignette, e.vignette ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  setPlaying(playing) {
    if (!this.enabled) return;
    if (playing) this._startLoop();
    else {
      this._stopLoop();
      this._draw();
    }
  }

  dispose() {
    this._stopLoop();
  }
}

/** WebGL2 video effects drawn in a worker on an OffscreenCanvas, with video frames transferred as bitmaps. */
class WorkerShaderRenderer {
  constructor(video, canvas, stage) {
    this.video = video;
    this.canvas = canvas;
    this.stage = stage;
    this.supported = false;
    this.enabled = false;
    this._rvfc = null;
    this._raf = null;
    this._ready = false;
    this._readyCbs = [];
    this._disposed = false;
    this._pending = false;
    this._bufW = 0;
    this._bufH = 0;
    this._videoW = 0;
    this._videoH = 0;
    this.effects = {};
    if (!WorkerShaderRenderer.isSupported()) return;
    const w = createPekoWorker('shaderWorkerSrc');
    if (!w) return;
    this.worker = w;
    w.onmessage = (e) => this._onMessage(e.data);
    w.onerror = () => {
      this.supported = false;
    };
    try {
      const offscreen = canvas.transferControlToOffscreen();
      w.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
      this.supported = true;
    } catch (err) {
      try {
        w.terminate();
      } catch {
        // Best-effort teardown: the object may already be released.
      }
      this.worker = null;
      this.supported = false;
    }
  }

  static isSupported() {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function' &&
      typeof createImageBitmap === 'function'
    );
  }

  _onMessage(msg) {
    if (msg.type === 'ready') {
      this._ready = true;
      this._readyCbs.forEach((cb) => cb());
      this._readyCbs = [];
    }
  }

  _whenReady(cb) {
    if (this._ready) cb();
    else this._readyCbs.push(cb);
  }

  setEnabled(on) {
    if (!this.supported) return;
    this.enabled = on;
    this.canvas.hidden = !on;
    this.stage.classList.toggle('shader-active', on);
    if (on) {
      this._resize();
      this._startLoop();
      this._pumpForce();
    } else this._stopLoop();
  }

  _resize() {
    const vw = this.video.videoWidth,
      vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.min(1, 1920 / Math.max(vw, vh));
    this._bufW = Math.max(1, Math.round(vw * scale));
    this._bufH = Math.max(1, Math.round(vh * scale));
    this._videoW = vw;
    this._videoH = vh;
    this._whenReady(() => {
      if (!this.worker || this._disposed) return;
      this.worker.postMessage({
        type: 'resize',
        width: this._bufW,
        height: this._bufH,
      });
    });
  }

  resize() {
    if (this.enabled) this._resize();
  }

  apply(effects) {
    this.effects = { ...effects };
    if (!this.enabled || !this.worker) return;
    this._whenReady(() => {
      if (!this.worker || this._disposed) return;
      this.worker.postMessage({ type: 'effects', effects: this.effects });
      if (this.video.paused) this._pumpForce();
    });
  }

  async _pumpForce() {
    this._whenReady(async () => {
      if (this._disposed || !this.enabled) return;
      if (this._pending) {
        setTimeout(() => this._pumpForce(), 60);
        return;
      }
      await this._pump();
      if (this.video.paused)
        setTimeout(() => {
          if (this.enabled) this._pump();
        }, 90);
    });
  }

  /** Sends a bitmap of every new video frame to the worker while playing. */
  _startLoop() {
    if (this._rvfc != null || this._raf != null) return;
    const hasRVFC = typeof this.video.requestVideoFrameCallback === 'function';
    const tick = () => {
      if (!this.enabled) {
        this._rvfc = null;
        this._raf = null;
        return;
      }
      this._pump();
      if (hasRVFC) this._rvfc = this.video.requestVideoFrameCallback(tick);
      else this._raf = requestAnimationFrame(tick);
    };
    if (hasRVFC) this._rvfc = this.video.requestVideoFrameCallback(tick);
    else this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._rvfc != null) {
      this.video.cancelVideoFrameCallback?.(this._rvfc);
      this._rvfc = null;
    }
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  /** Transfers the current video frame to the worker as a bitmap, one frame in flight at a time. */
  async _pump() {
    if (this._pending || !this._ready || !this.worker || this._disposed) return;
    const v = this.video;
    if (!v.videoWidth || v.readyState < 2) return;
    this._pending = true;
    try {
      const bitmap = await createImageBitmap(v, { resizeWidth: this._bufW, resizeHeight: this._bufH });
      if (this._disposed || !this.enabled) {
        bitmap.close();
        this._pending = false;
        return;
      }
      try {
        this.worker.postMessage(
          {
            type: 'frame',
            bitmap,
            videoWidth: this._videoW,
            videoHeight: this._videoH,
          },
          [bitmap],
        );
      } catch {
        try {
          bitmap.close();
        } catch {
          // Best-effort teardown: the object may already be released.
        }
      }
    } catch {
      // Best-effort teardown: the object may already be released.
    }
    this._pending = false;
  }

  invalidate() {
    if (this.enabled && this.video.paused) this._pumpForce();
  }

  setPlaying(playing) {
    if (!this.enabled) return;
    if (playing) this._startLoop();
    else {
      this._stopLoop();
      this._pumpForce();
    }
  }

  dispose() {
    this._disposed = true;
    this._stopLoop();
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'dispose' });
      } catch {
        // Best-effort teardown: the object may already be released.
      }
      try {
        this.worker.terminate();
      } catch {
        // Best-effort teardown: the object may already be released.
      }
    }
  }
}

/** Picks the worker-based renderer when the browser supports it, otherwise the main-thread renderer. */
function createShaderRenderer(video, canvas, stage) {
  if (WorkerShaderRenderer.isSupported()) {
    const wr = new WorkerShaderRenderer(video, canvas, stage);
    if (wr.supported) return wr;
  }
  return new MainThreadShaderRenderer(video, canvas, stage);
}
