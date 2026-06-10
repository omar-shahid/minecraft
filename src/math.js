// Matrix / vector / noise utilities. Matrices are column-major Float32Array(16).

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) * nf; out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function multiply(out, a, b) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
  out.set(r);
  return out;
}

export function translate(out, m, x, y, z) {
  const t = mat4();
  t[12] = x; t[13] = y; t[14] = z;
  return multiply(out, m, t);
}

export function rotateX(out, m, a) {
  const r = mat4(), c = Math.cos(a), s = Math.sin(a);
  r[5] = c; r[6] = s; r[9] = -s; r[10] = c;
  return multiply(out, m, r);
}

export function rotateY(out, m, a) {
  const r = mat4(), c = Math.cos(a), s = Math.sin(a);
  r[0] = c; r[2] = -s; r[8] = s; r[10] = c;
  return multiply(out, m, r);
}

export function scale(out, m, x, y, z) {
  const r = mat4();
  r[0] = x; r[5] = y; r[10] = z;
  return multiply(out, m, r);
}

// view = Rx(-pitch) * Ry(-yaw) * T(-pos)
export function viewMatrix(out, pos, yaw, pitch) {
  let m = mat4();
  rotateX(m, m, -pitch);
  rotateY(m, m, -yaw);
  translate(m, m, -pos[0], -pos[1], -pos[2]);
  out.set(m);
  return out;
}

export function lookVector(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// Frustum planes from a combined projection*view matrix (Gribb-Hartmann).
export function frustumPlanes(m) {
  const p = [];
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const add = (a, b, s) => p.push([r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]]);
  add(r0, r3, 1); add(r0, r3, -1);
  add(r1, r3, 1); add(r1, r3, -1);
  add(r2, r3, 1); add(r2, r3, -1);
  return p;
}

export function boxInFrustum(planes, x0, y0, z0, x1, y1, z1) {
  for (const pl of planes) {
    const px = pl[0] > 0 ? x1 : x0;
    const py = pl[1] > 0 ? y1 : y0;
    const pz = pl[2] > 0 ? z1 : z0;
    if (pl[0] * px + pl[1] * py + pl[2] * pz + pl[3] < 0) return false;
  }
  return true;
}

// ---------- RNG / hashing ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2i(seed, x, y) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Perlin noise ----------
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

export class Noise {
  constructor(seed) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2(x, y) {
    const P = this.perm;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const g = (h, x, y) => {
      const gr = GRAD3[h % 12];
      return gr[0] * x + gr[1] * y;
    };
    const a = P[X] + Y, b = P[X + 1] + Y;
    return lerp(v,
      lerp(u, g(P[a], x, y), g(P[b], x - 1, y)),
      lerp(u, g(P[a + 1], x, y - 1), g(P[b + 1], x - 1, y - 1)));
  }

  noise3(x, y, z) {
    const P = this.perm;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const g = (h, x, y, z) => {
      const gr = GRAD3[h % 12];
      return gr[0] * x + gr[1] * y + gr[2] * z;
    };
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
    const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    return lerp(w,
      lerp(v,
        lerp(u, g(P[AA], x, y, z), g(P[BA], x - 1, y, z)),
        lerp(u, g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z))),
      lerp(v,
        lerp(u, g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1)),
        lerp(u, g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1))));
  }

  fbm2(x, y, octaves, lac = 2, gain = 0.5) {
    let amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x, y);
      norm += amp;
      amp *= gain; x *= lac; y *= lac;
    }
    return sum / norm;
  }

  fbm3(x, y, z, octaves, lac = 2, gain = 0.5) {
    let amp = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3(x, y, z);
      norm += amp;
      amp *= gain; x *= lac; y *= lac; z *= lac;
    }
    return sum / norm;
  }
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerpN = lerp;
