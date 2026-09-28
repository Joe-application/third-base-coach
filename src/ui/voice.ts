// 声（「回れー！回れー！」「セーフ！」など）。
// AI 音声で作った音声ファイル（public/voice/*.m4a）を AudioContext で鳴らす。
// ファイルが読めないとき（古い端末・読み込み前）は、端末の日本語読み上げ（Web Speech API）で代わりにしゃべる。

import { audioContext } from './audio';

export type VoiceKey = 'send' | 'stop' | 'slide' | 'bsend' | 'bstop' | 'autostop' | 'contact' | 'safe' | 'out' | 'nice';

const KEYS: VoiceKey[] = ['send', 'stop', 'slide', 'bsend', 'bstop', 'autostop', 'contact', 'safe', 'out', 'nice'];

let enabled = true;
let unlocked = false;
let loading = false;
const buffers = new Map<VoiceKey, AudioBuffer>();
let current: AudioBufferSourceNode | null = null;

// ---- 読み上げ（音声ファイルが使えないときの代わり） ----

let jaVoice: SpeechSynthesisVoice | null = null;

const synth = (): SpeechSynthesis | null => {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
};

function pickVoice() {
  const s = synth();
  if (!s) return;
  const voices = s.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  const prefer = ['Otoya', 'Google 日本語', 'Kyoko', 'Hattori', 'O-Ren'];
  jaVoice = prefer.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ?? voices[0] ?? null;
}

if (synth()) {
  pickVoice();
  synth()!.addEventListener?.('voiceschanged', pickVoice);
}

function speak(text: string) {
  const s = synth();
  if (!s) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.pitch = 1.2;
    u.rate = 1.25;
    s.speak(u);
  } catch {
    // 読み上げに対応していない端末
  }
}

// ---- 音声ファイル ----

/** 声のファイルを読み込んでおく（最初のタップのときに呼ぶ） */
function preload(ctx: AudioContext) {
  if (loading) return;
  loading = true;
  for (const key of KEYS) {
    fetch(`${import.meta.env.BASE_URL}voice/${key}.m4a`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => buffers.set(key, buf))
      .catch(() => {
        // 読めなければ読み上げで代わりにしゃべる
      });
  }
}

export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    synth()?.cancel();
    try {
      current?.stop();
    } catch {
      // すでに止まっている
    }
  }
}

/** ユーザー操作のタイミングで呼ぶ（iOS は操作中でないと音が出ない） */
export function unlockVoice() {
  const ctx = audioContext();
  if (ctx) preload(ctx);
  const s = synth();
  if (!s || unlocked || !enabled) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
  } catch {
    // 何もしない
  }
}

/** 声を出す。前の声は止めて、すぐにしゃべる。fallback は音声ファイルがないときに読み上げる文 */
export function playVoice(key: VoiceKey, fallback: string) {
  if (!enabled) return;
  const ctx = audioContext();
  const buf = buffers.get(key);
  if (ctx && buf) {
    try {
      current?.stop();
    } catch {
      // すでに止まっている
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    current = src;
    return;
  }
  if (ctx && !loading) preload(ctx);
  speak(fallback);
}
