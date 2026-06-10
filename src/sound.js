// Tiny procedural sound effects via WebAudio — no audio assets.

let ctx = null;
let enabled = true;

export function setSoundEnabled(v) { enabled = v; }

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.15, slide = 0) {
  if (!enabled) return;
  try {
    const a = ac();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}

function noise(dur, vol = 0.2, low = 800) {
  if (!enabled) return;
  try {
    const a = ac();
    const len = (a.sampleRate * dur) | 0;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = low;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  } catch (e) { /* audio unavailable */ }
}

export function playSound(name) {
  switch (name) {
    case 'break': noise(0.12, 0.25, 1200); break;
    case 'place': tone(220, 0.08, 'square', 0.1, -60); break;
    case 'hit': tone(160, 0.1, 'sawtooth', 0.12, -60); break;
    case 'hurt': tone(110, 0.25, 'sawtooth', 0.2, -50); break;
    case 'eat': tone(330, 0.06, 'square', 0.08, 40); setTimeout(() => tone(290, 0.06, 'square', 0.08, 40), 90); break;
    case 'explode': noise(0.7, 0.5, 400); tone(60, 0.5, 'sine', 0.3, -30); break;
    case 'bow': tone(440, 0.12, 'sine', 0.1, 300); break;
    case 'click': tone(600, 0.03, 'square', 0.05); break;
    case 'pickup': tone(520, 0.07, 'sine', 0.1, 250); break;
    case 'portal': tone(90, 1.2, 'sine', 0.18, 160); break;
    case 'craft': tone(380, 0.07, 'square', 0.08); setTimeout(() => tone(500, 0.07, 'square', 0.08), 80); break;
    case 'fuse': noise(0.3, 0.12, 3000); break;
    case 'death': tone(200, 0.8, 'sawtooth', 0.2, -160); break;
  }
}
