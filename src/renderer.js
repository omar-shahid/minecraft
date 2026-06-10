// WebGL2 renderer: chunk geometry, procedural sky (sun/moon/stars/clouds),
// entity boxes, selection wireframe.

import { mat4, multiply, perspective, viewMatrix, frustumPlanes, boxInFrustum } from './math.js';
import { CX, CZ, H } from './worldgen.js';

const CHUNK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aSky;
layout(location=3) in float aBlock;
layout(location=4) in float aShade;
uniform mat4 uMVP;
uniform vec3 uCam;
out vec2 vUV; out float vSky; out float vBlock; out float vShade; out float vDist;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV; vSky = aSky; vBlock = aBlock; vShade = aShade;
  vDist = distance(aPos.xz, uCam.xz);
}`;

const CHUNK_FS = `#version 300 es
precision highp float;
in vec2 vUV; in float vSky; in float vBlock; in float vShade; in float vDist;
uniform sampler2D uAtlas;
uniform float uDay, uMin, uCutoff, uFogStart, uFogEnd;
uniform vec3 uFogColor, uTint;
out vec4 frag;
void main() {
  vec4 tex = texture(uAtlas, vUV);
  if (tex.a < uCutoff) discard;
  float l = max(vSky / 15.0 * uDay, vBlock / 15.0);
  l = max(l, uMin);
  float b = pow(l, 1.6) * 0.97 + 0.03;
  vec3 c = tex.rgb * vShade * b * uTint;
  float fog = smoothstep(uFogStart, uFogEnd, vDist);
  frag = vec4(mix(c, uFogColor, fog), tex.a);
}`;

const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vNDC;
void main() { vNDC = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNDC;
uniform vec3 uFwd, uRight, uUp, uSunDir;
uniform float uTanFov, uAspect, uDay, uNether, uTime;
out vec4 frag;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(vec3(i,1.0)), b=hash(vec3(i+vec2(1,0),1.0));
  float c=hash(vec3(i+vec2(0,1),1.0)), d=hash(vec3(i+vec2(1,1),1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
void main() {
  vec3 dir = normalize(uFwd + uRight*vNDC.x*uTanFov*uAspect + uUp*vNDC.y*uTanFov);
  vec3 col;
  if (uNether > 0.5) {
    col = mix(vec3(0.25,0.05,0.04), vec3(0.10,0.02,0.03), clamp(dir.y*1.5+0.6,0.0,1.0));
    float em = vnoise(dir.xz/max(abs(dir.y),0.2)*8.0 + uTime*0.05);
    col += vec3(0.25,0.05,0.0) * smoothstep(0.75, 0.95, em);
  } else {
    vec3 dayZen = vec3(0.22,0.45,0.85), dayHor = vec3(0.65,0.80,0.95);
    vec3 nightZen = vec3(0.01,0.01,0.04), nightHor = vec3(0.03,0.04,0.10);
    float duskGlow = exp(-abs(uSunDir.y)*8.0);
    vec3 zen = mix(nightZen, dayZen, uDay), hor = mix(nightHor, dayHor, uDay);
    hor = mix(hor, vec3(0.95,0.55,0.25), duskGlow*0.7*max(0.0,dot(normalize(dir.xz),normalize(uSunDir.xz))*0.5+0.5));
    col = mix(hor, zen, smoothstep(-0.05, 0.5, dir.y));
    float s = dot(dir, uSunDir);
    col += vec3(1.0,0.95,0.7) * smoothstep(0.9990, 0.9994, s) * 3.0;
    col += vec3(1.0,0.8,0.4) * pow(max(s,0.0), 200.0) * 0.35;
    float m = dot(dir, -uSunDir);
    col += vec3(0.9,0.93,1.0) * smoothstep(0.9995, 0.9997, m) * 1.6;
    if (uDay < 0.5 && dir.y > 0.0) {
      vec3 sp = floor(dir*230.0);
      float st = hash(sp);
      if (st > 0.9975) col += vec3(0.8) * (1.0-uDay*2.0) * fract(st*100.0);
    }
    if (dir.y > 0.04) {
      vec2 p = dir.xz/dir.y*3.0 + vec2(uTime*0.012, 0.0);
      float n = vnoise(p)*0.55 + vnoise(p*2.7)*0.3 + vnoise(p*6.1)*0.15;
      float a = smoothstep(0.55, 0.8, n) * 0.65 * smoothstep(0.04, 0.15, dir.y);
      col = mix(col, mix(vec3(0.10,0.10,0.14), vec3(1.0), uDay), a);
    }
  }
  frag = vec4(col, 1.0);
}`;

const ENT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
uniform mat4 uVP, uModel;
out vec3 vNorm; out float vDist;
uniform vec3 uCam;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * w;
  vNorm = mat3(uModel) * aNorm;
  vDist = distance(w.xz, uCam.xz);
}`;

const ENT_FS = `#version 300 es
precision highp float;
in vec3 vNorm; in float vDist;
uniform vec3 uColor, uFogColor;
uniform float uLight, uFlash, uFogStart, uFogEnd;
out vec4 frag;
void main() {
  vec3 n = normalize(vNorm);
  float shade = 0.55 + 0.45*max(0.0,n.y) + 0.15*abs(n.x) + 0.08*abs(n.z) - 0.25*max(0.0,-n.y);
  vec3 c = uColor * shade * uLight;
  c = mix(c, vec3(1.0,0.3,0.3), uFlash);
  float fog = smoothstep(uFogStart, uFogEnd, vDist);
  frag = vec4(mix(c, uFogColor, fog), 1.0);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uMVP;
void main(){ gl_Position = uMVP * vec4(aPos, 1.0); }`;
const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 frag;
void main(){ frag = uColor; }`;

function compile(gl, vsSrc, fsSrc) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { prog: p, u: uniforms };
}

export class Renderer {
  constructor(canvas, atlasCanvas) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.canvas = canvas;

    this.chunkShader = compile(gl, CHUNK_VS, CHUNK_FS);
    this.skyShader = compile(gl, SKY_VS, SKY_FS);
    this.entShader = compile(gl, ENT_VS, ENT_FS);
    this.lineShader = compile(gl, LINE_VS, LINE_FS);

    // atlas texture
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.meshes = new Map();

    // fullscreen triangle-pair for sky
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // unit cube (centered on x/z, base at y=0) with normals
    const cube = [];
    const faces = [
      [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
      [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
      [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
      [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
      [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
      [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
    ];
    for (const [n, vs] of faces)
      for (const i of [0, 1, 2, 0, 2, 3])
        cube.push(vs[i][0] - 0.5, vs[i][1], vs[i][2] - 0.5, n[0], n[1], n[2]);
    this.cubeVao = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVao);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    // selection wireframe
    const e = 0.002;
    const c0 = -e, c1 = 1 + e;
    const corners = [
      [c0, c0, c0], [c1, c0, c0], [c1, c0, c1], [c0, c0, c1],
      [c0, c1, c0], [c1, c1, c0], [c1, c1, c1], [c0, c1, c1],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const lines = [];
    for (const [a, b] of edges) lines.push(...corners[a], ...corners[b]);
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    const lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.proj = mat4();
    this.view = mat4();
    this.mvp = mat4();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = (this.canvas.clientWidth * dpr) | 0, h = (this.canvas.clientHeight * dpr) | 0;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  _makeChunkVao(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 32;
    const attrs = [[0, 3, 0], [1, 2, 12], [2, 1, 20], [3, 1, 24], [4, 1, 28]];
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
    }
    gl.bindVertexArray(null);
    return { vao, buf, count: data.length / 8 };
  }

  updateChunk(key, cx, cz, mesh) {
    this.deleteChunk(key);
    const entry = { cx, cz, opaque: null, trans: null };
    if (mesh.opaque.length) entry.opaque = this._makeChunkVao(mesh.opaque);
    if (mesh.trans.length) entry.trans = this._makeChunkVao(mesh.trans);
    this.meshes.set(key, entry);
  }

  deleteChunk(key) {
    const m = this.meshes.get(key);
    if (!m) return;
    const gl = this.gl;
    for (const part of [m.opaque, m.trans]) {
      if (part) { gl.deleteBuffer(part.buf); gl.deleteVertexArray(part.vao); }
    }
    this.meshes.delete(key);
  }

  render(s) {
    // s: { camPos, yaw, pitch, fov, renderDist, dayFactor, sunDir, dim, time,
    //      selection, entityDraws, underwater }
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    perspective(this.proj, s.fov * Math.PI / 180, aspect, 0.08, 1000);
    viewMatrix(this.view, s.camPos, s.yaw, s.pitch);
    multiply(this.mvp, this.proj, this.view);
    const planes = frustumPlanes(this.mvp);

    const nether = s.dim === 'nether';
    const day = s.dayFactor;
    const fogEnd = s.renderDist * 16 - 8;
    const fogStart = fogEnd * 0.7;
    let fogColor = nether ? [0.22, 0.05, 0.04]
      : [0.65 * day + 0.03, 0.8 * day + 0.04, 0.95 * day + 0.1];
    if (s.underwater) fogColor = [0.05, 0.15, 0.4];

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- sky ----
    const sky = this.skyShader;
    gl.useProgram(sky.prog);
    const cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
    const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
    const fwd = [-sy * cp, sp, -cy * cp];
    const right = [cy, 0, -sy];
    const up = [sy * sp, cp, cy * sp];
    gl.uniform3fv(sky.u.uFwd, fwd);
    gl.uniform3fv(sky.u.uRight, right);
    gl.uniform3fv(sky.u.uUp, up);
    gl.uniform3fv(sky.u.uSunDir, s.sunDir);
    gl.uniform1f(sky.u.uTanFov, Math.tan(s.fov * Math.PI / 360));
    gl.uniform1f(sky.u.uAspect, aspect);
    gl.uniform1f(sky.u.uDay, day);
    gl.uniform1f(sky.u.uNether, nether ? 1 : 0);
    gl.uniform1f(sky.u.uTime, s.time);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // ---- chunks: opaque ----
    const ch = this.chunkShader;
    gl.useProgram(ch.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(ch.u.uAtlas, 0);
    gl.uniformMatrix4fv(ch.u.uMVP, false, this.mvp);
    gl.uniform3fv(ch.u.uCam, s.camPos);
    gl.uniform1f(ch.u.uDay, nether ? 0 : day);
    gl.uniform1f(ch.u.uMin, nether ? 0.12 : 0.025);
    gl.uniform1f(ch.u.uFogStart, fogStart);
    gl.uniform1f(ch.u.uFogEnd, fogEnd);
    gl.uniform3fv(ch.u.uFogColor, fogColor);
    gl.uniform3fv(ch.u.uTint, nether ? [1.05, 0.92, 0.9] : [1, 1, 1]);
    gl.uniform1f(ch.u.uCutoff, 0.5);

    const visible = [];
    for (const [key, m] of this.meshes) {
      const x0 = m.cx * CX, z0 = m.cz * CZ;
      const dx = x0 + 8 - s.camPos[0], dz = z0 + 8 - s.camPos[2];
      const dist = Math.hypot(dx, dz);
      if (dist > s.renderDist * 16 + 24) continue;
      if (!boxInFrustum(planes, x0, 0, z0, x0 + CX, H, z0 + CZ)) continue;
      visible.push([dist, m]);
      if (m.opaque) {
        gl.bindVertexArray(m.opaque.vao);
        gl.drawArrays(gl.TRIANGLES, 0, m.opaque.count);
      }
    }

    // ---- entities ----
    if (s.entityDraws && s.entityDraws.length) {
      const es = this.entShader;
      gl.useProgram(es.prog);
      gl.uniformMatrix4fv(es.u.uVP, false, this.mvp);
      gl.uniform3fv(es.u.uCam, s.camPos);
      gl.uniform1f(es.u.uFogStart, fogStart);
      gl.uniform1f(es.u.uFogEnd, fogEnd);
      gl.uniform3fv(es.u.uFogColor, fogColor);
      gl.bindVertexArray(this.cubeVao);
      for (const d of s.entityDraws) {
        gl.uniformMatrix4fv(es.u.uModel, false, d.model);
        gl.uniform3fv(es.u.uColor, d.color);
        gl.uniform1f(es.u.uLight, d.light);
        gl.uniform1f(es.u.uFlash, d.flash || 0);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
      }
    }

    // ---- selection box ----
    if (s.selection) {
      const ls = this.lineShader;
      gl.useProgram(ls.prog);
      let m = mat4();
      m[12] = s.selection.x; m[13] = s.selection.y; m[14] = s.selection.z;
      const mvp2 = mat4();
      multiply(mvp2, this.mvp, m);
      gl.uniformMatrix4fv(ls.u.uMVP, false, mvp2);
      gl.uniform4fv(ls.u.uColor, [0, 0, 0, 0.8]);
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, 24);
    }

    // ---- chunks: translucent (far to near) ----
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(ch.prog);
    gl.uniform1f(ch.u.uCutoff, 0.0);
    visible.sort((a, b) => b[0] - a[0]);
    for (const [, m] of visible) {
      if (m.trans) {
        gl.bindVertexArray(m.trans.vao);
        gl.drawArrays(gl.TRIANGLES, 0, m.trans.count);
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
