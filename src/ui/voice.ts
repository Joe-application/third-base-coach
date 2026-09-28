// 声（「回れー！」「セーフ！」など）。端末の日本語読み上げ（Web Speech API）を使う。
// 音声ファイルは持たないので、オフラインでも動く。声の質は端末によって変わる。

let enabled = true;
let jaVoice: SpeechSynthesisVoice | null = null;
let unlocked = false;

const synth = (): SpeechSynthesis | null => {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
};

/** 日本語の声を選ぶ（元気に聞こえやすいものを優先） */
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

export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) synth()?.cancel();
}

/** iOS はタップ中に一度しゃべらせないと、あとで声が出ない */
export function unlockVoice() {
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

export type SayOptions = { pitch?: number; rate?: number; volume?: number; interrupt?: boolean };

export function say(text: string, opts: SayOptions = {}) {
  const s = synth();
  if (!s || !enabled) return;
  try {
    // 前の声を切って、すぐにしゃべる（タイミングがずれないように）
    if (opts.interrupt ?? true) s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (jaVoice) u.voice = jaVoice;
    u.pitch = opts.pitch ?? 1.2;
    u.rate = opts.rate ?? 1.25;
    u.volume = opts.volume ?? 1;
    s.speak(u);
  } catch {
    // 読み上げに対応していない端末
  }
}
