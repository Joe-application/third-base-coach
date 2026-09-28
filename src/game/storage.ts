// localStorage の読み書き（§8）。壊れていても、空でも、初期状態で動くようにする。

import { EVAL } from '../sim/constants';
import type { Grade, Timing, Verdict } from '../sim/evaluate';
import type { OutCount, PlayResult, Scenario } from '../sim/types';

export const KEYS = {
  profiles: 'tbc:profiles',
  profile: (id: string) => `tbc:profile:${id}`,
  history: (id: string) => `tbc:history:${id}`,
  settings: 'tbc:settings',
  current: 'tbc:current',
};

export const MAX_PROFILES = 10;
export const MAX_HISTORY = 100;

export type ProfileRef = { id: string; nickname: string };

export type OutStats = {
  plays: number;
  great: number;
  ok: number;
  bad: number;
  /** 回すのが正解だったのに止めた */
  stoppedShouldSend: number;
  stops: number;
  /** 止めるのが正解だったのに回した */
  sentShouldStop: number;
  sends: number;
};

export type Stats = {
  plays: number;
  byOuts: Record<OutCount, OutStats>;
  /** 2アウトで ◎ */
  twoOutGreat: number;
  /** 0アウトで止めて ◎ */
  zeroOutStopGreat: number;
  /** 連続で迷いなし */
  noHesitateStreak: number;
  slideSafe: number;
  bestCombo: number;
  anohiCleared: boolean;
  tutorialDone: boolean;
};

export type Profile = {
  id: string;
  nickname: string;
  stars: number;
  badges: string[];
  stats: Stats;
  /** モードごとの最高★ */
  bestStars: Record<string, number>;
};

export type HistoryEntry = {
  mode: string;
  scenarioId?: string;
  scenario: Scenario;
  seed: number;
  decision: 'send' | 'stop';
  decisionTime: number;
  pSafe: number;
  threshold: number;
  grade: Grade;
  verdict: Verdict;
  timing: Timing;
  result: PlayResult;
  score: number;
  playedAt: number;
};

export type Settings = {
  /** auto = ランクに合わせる */
  speed: 'auto' | 'slow' | 'normal';
  sound: boolean;
  vibrate: boolean;
  /** 回すべき P_safe の基準（コーチ向け） */
  thresholds: Record<OutCount, number>;
  /** 点差・イニングの補正 */
  situational: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  speed: 'auto',
  sound: true,
  vibrate: true,
  thresholds: { ...EVAL.thresholds },
  situational: false,
};

const emptyOutStats = (): OutStats => ({
  plays: 0,
  great: 0,
  ok: 0,
  bad: 0,
  stoppedShouldSend: 0,
  stops: 0,
  sentShouldStop: 0,
  sends: 0,
});

export const emptyStats = (): Stats => ({
  plays: 0,
  byOuts: { 0: emptyOutStats(), 1: emptyOutStats(), 2: emptyOutStats() },
  twoOutGreat: 0,
  zeroOutStopGreat: 0,
  noHesitateStreak: 0,
  slideSafe: 0,
  bestCombo: 0,
  anohiCleared: false,
  tutorialDone: false,
});

// ---- 低レベル ----

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量不足・プライベートモードなど：保存できなくても遊べるようにする
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 何もしない
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

// ---- プロフィール ----

export function loadProfiles(): ProfileRef[] {
  const v = read(KEYS.profiles);
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is ProfileRef => isObj(p) && typeof p.id === 'string' && typeof p.nickname === 'string')
    .slice(0, MAX_PROFILES);
}

function normalizeOutStats(v: unknown): OutStats {
  const o = isObj(v) ? v : {};
  const e = emptyOutStats();
  for (const k of Object.keys(e) as (keyof OutStats)[]) e[k] = num(o[k], 0);
  return e;
}

function normalizeStats(v: unknown): Stats {
  const s = isObj(v) ? v : {};
  const e = emptyStats();
  const by = isObj(s.byOuts) ? s.byOuts : {};
  return {
    plays: num(s.plays, 0),
    byOuts: { 0: normalizeOutStats(by[0]), 1: normalizeOutStats(by[1]), 2: normalizeOutStats(by[2]) },
    twoOutGreat: num(s.twoOutGreat, 0),
    zeroOutStopGreat: num(s.zeroOutStopGreat, 0),
    noHesitateStreak: num(s.noHesitateStreak, 0),
    slideSafe: num(s.slideSafe, 0),
    bestCombo: num(s.bestCombo, 0),
    anohiCleared: bool(s.anohiCleared, e.anohiCleared),
    tutorialDone: bool(s.tutorialDone, e.tutorialDone),
  };
}

export function loadProfile(ref: ProfileRef): Profile {
  const v = read(KEYS.profile(ref.id));
  const o = isObj(v) ? v : {};
  const bestStars: Record<string, number> = {};
  if (isObj(o.bestStars)) for (const [k, x] of Object.entries(o.bestStars)) bestStars[k] = num(x, 0);
  return {
    id: ref.id,
    nickname: typeof o.nickname === 'string' ? o.nickname : ref.nickname,
    stars: Math.max(0, num(o.stars, 0)),
    badges: Array.isArray(o.badges) ? o.badges.filter((b): b is string => typeof b === 'string') : [],
    stats: normalizeStats(o.stats),
    bestStars,
  };
}

export function saveProfile(p: Profile): void {
  write(KEYS.profile(p.id), p);
}

export function createProfile(nickname: string): Profile | null {
  const list = loadProfiles();
  if (list.length >= MAX_PROFILES) return null;
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const name = nickname.trim().slice(0, 12) || 'コーチャー';
  const ref = { id, nickname: name };
  write(KEYS.profiles, [...list, ref]);
  const p: Profile = { id, nickname: name, stars: 0, badges: [], stats: emptyStats(), bestStars: {} };
  saveProfile(p);
  return p;
}

export function deleteProfile(id: string): void {
  write(
    KEYS.profiles,
    loadProfiles().filter((p) => p.id !== id),
  );
  remove(KEYS.profile(id));
  remove(KEYS.history(id));
  if (loadCurrentId() === id) remove(KEYS.current);
}

export function loadCurrentId(): string | null {
  const v = read(KEYS.current);
  return typeof v === 'string' ? v : null;
}

export function saveCurrentId(id: string): void {
  write(KEYS.current, id);
}

// ---- 履歴 ----

export function loadHistory(id: string): HistoryEntry[] {
  const v = read(KEYS.history(id));
  if (!Array.isArray(v)) return [];
  return v.filter(
    (h): h is HistoryEntry =>
      isObj(h) && isObj(h.scenario) && typeof h.pSafe === 'number' && typeof h.decision === 'string',
  );
}

export function appendHistory(id: string, entry: HistoryEntry): void {
  const list = loadHistory(id);
  list.push(entry);
  write(KEYS.history(id), list.slice(-MAX_HISTORY));
}

/** 記録を消す（プロフィールの★・バッジ・統計も初期化） */
export function clearRecords(p: Profile): Profile {
  remove(KEYS.history(p.id));
  const fresh: Profile = { ...p, stars: 0, badges: [], stats: emptyStats(), bestStars: {} };
  saveProfile(fresh);
  return fresh;
}

// ---- 設定 ----

export function loadSettings(): Settings {
  const v = read(KEYS.settings);
  const o = isObj(v) ? v : {};
  const th = isObj(o.thresholds) ? o.thresholds : {};
  const clamp = (x: number) => Math.min(0.95, Math.max(0.05, x));
  return {
    speed: o.speed === 'slow' || o.speed === 'normal' ? o.speed : 'auto',
    sound: bool(o.sound, DEFAULT_SETTINGS.sound),
    vibrate: bool(o.vibrate, DEFAULT_SETTINGS.vibrate),
    thresholds: {
      0: clamp(num(th[0], EVAL.thresholds[0])),
      1: clamp(num(th[1], EVAL.thresholds[1])),
      2: clamp(num(th[2], EVAL.thresholds[2])),
    },
    situational: bool(o.situational, false),
  };
}

export function saveSettings(s: Settings): void {
  write(KEYS.settings, s);
}
