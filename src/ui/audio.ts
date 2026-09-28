// 効果音は Web Audio API で合成する（外部の音源ファイルは使わない）。

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** ユーザー操作のタイミングで呼ぶ（iOS は操作中でないと音が出ない） */
export function unlockAudio() {
  ac();
}

function noise(c: AudioContext, dur: number, gain: number, freq: number, q = 1, at = c.currentTime) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(at);
}

function tone(c: AudioContext, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', at = c.currentTime, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export const sfx = {
  bat() {
    const c = ac();
    if (!c) return;
    noise(c, 0.12, 0.9, 2400, 0.8);
    tone(c, 1400, 0.08, 0.25, 'triangle');
  },
  glove() {
    const c = ac();
    if (!c) return;
    noise(c, 0.06, 0.6, 900, 1.5);
  },
  signal() {
    const c = ac();
    if (!c) return;
    tone(c, 880, 0.09, 0.2, 'square');
  },
  safe() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 520, 0.18, 0.25, 'sawtooth', t, 700);
    tone(c, 700, 0.35, 0.25, 'sawtooth', t + 0.18, 520);
  },
  out() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 300, 0.12, 0.3, 'sawtooth', t);
    tone(c, 220, 0.4, 0.3, 'sawtooth', t + 0.12, 160);
  },
  fanfare() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i === 3 ? 0.5 : 0.14, 0.18, 'triangle', t + i * 0.12));
  },
  soft() {
    const c = ac();
    if (!c) return;
    tone(c, 440, 0.25, 0.15, 'sine', c.currentTime, 392);
  },
};

let vibrateOn = true;
export function setVibrateEnabled(on: boolean) {
  vibrateOn = on;
}
export function vibrate(pattern: number | number[]) {
  if (!vibrateOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 対応していない端末
  }
}
