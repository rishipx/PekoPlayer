let gl = null,
  program = null,
  uniforms = {},
  tex = null,
  effects = {},
  bufW = 0,
  bufH = 0;

const VERT = `#version 300 es
out vec2 vUv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FRAG = `#version 300 es
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

function compileShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Compile failed: ' + gl.getShaderInfoLog(sh));
  return sh;
}

self.onmessage = function (e) {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      gl = msg.canvas.getContext('webgl2', {
        alpha: false,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) {
        self.postMessage({ type: 'error', error: 'no-webgl2' });
        return;
      }
      const vs = compileShader(gl.VERTEX_SHADER, VERT);
      const fs = compileShader(gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Link failed: ' + gl.getProgramInfoLog(program));
      gl.useProgram(program);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      uniforms = {
        video: gl.getUniformLocation(program, 'uVideo'),
        texelSize: gl.getUniformLocation(program, 'uTexelSize'),
        exposure: gl.getUniformLocation(program, 'uExposure'),
        contrast: gl.getUniformLocation(program, 'uContrast'),
        saturation: gl.getUniformLocation(program, 'uSaturation'),
        temperature: gl.getUniformLocation(program, 'uTemperature'),
        tint: gl.getUniformLocation(program, 'uTint'),
        sharpen: gl.getUniformLocation(program, 'uSharpen'),
        vignette: gl.getUniformLocation(program, 'uVignette'),
      };
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'resize') {
      if (!gl) return;
      bufW = msg.width;
      bufH = msg.height;
      if (gl.canvas.width !== bufW) gl.canvas.width = bufW;
      if (gl.canvas.height !== bufH) gl.canvas.height = bufH;
    } else if (msg.type === 'effects') {
      effects = msg.effects || {};
    } else if (msg.type === 'frame') {
      if (!gl || !msg.bitmap) return;
      const vw = msg.videoWidth || 1,
        vh = msg.videoHeight || 1;
      gl.viewport(0, 0, bufW || gl.canvas.width, bufH || gl.canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, msg.bitmap);
      } catch {
        // The frame could not be uploaded (for example while the context is lost): skip it.
      }
      msg.bitmap.close();
      gl.useProgram(program);
      gl.uniform1i(uniforms.video, 0);
      gl.uniform2f(uniforms.texelSize, 1 / vw, 1 / vh);
      gl.uniform1f(uniforms.exposure, effects.exposure != null ? effects.exposure : 0);
      gl.uniform1f(uniforms.contrast, effects.contrast != null ? effects.contrast : 1);
      gl.uniform1f(uniforms.saturation, effects.saturation != null ? effects.saturation : 1);
      gl.uniform1f(uniforms.temperature, effects.temperature != null ? effects.temperature : 0);
      gl.uniform1f(uniforms.tint, effects.tint != null ? effects.tint : 0);
      gl.uniform1f(uniforms.sharpen, effects.sharpen != null ? effects.sharpen : 0);
      gl.uniform1f(uniforms.vignette, effects.vignette != null ? effects.vignette : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (msg.type === 'dispose') {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // The context is already lost: nothing to release.
      }
      self.close();
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
};
