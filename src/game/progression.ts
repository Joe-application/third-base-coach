// ランク・スター・コンボ・バッジ（§6）

import type { Difficulty } from '../sim/scenario';
import type { PlayScore } from '../sim/evaluate';
import type { PlayTimeline } from '../sim/play';
import type { Profile, Stats } from './storage';

export type RankInfo = {
  index: number;
  name: string;
  minStars: number;
  speed: number;
  hint: boolean;
  /** 足・肩を「？」にする */
  hideTraits: boolean;
  difficulty: Difficulty;
  /** 打球のバリエーションを増やす */
  variety: boolean;
};

export const RANKS: RankInfo[] = [
  { index: 0, name: '見習いコーチャー', minStars: 0, speed: 0.6, hint: true, hideTraits: false, difficulty: 'easy', variety: false },
  { index: 1, name: 'ベースコーチ', minStars: 10, speed: 0.8, hint: true, hideTraits: false, difficulty: 'normal', variety: false },
  { index: 2, name: 'レギュラーコーチャー', minStars: 25, speed: 1, hint: false, hideTraits: false, difficulty: 'normal', variety: false },
  { index: 3, name: '名コーチャー', minStars: 45, speed: 1, hint: false, hideTraits: true, difficulty: 'hard', variety: false },
  { index: 4, name: '監督の右腕', minStars: 70, speed: 1, hint: false, hideTraits: true, difficulty: 'expert', variety: true },
];

export function rankFor(stars: number): RankInfo {
  let r = RANKS[0];
  for (const x of RANKS) if (stars >= x.minStars) r = x;
  return r;
}

export function nextRank(stars: number): RankInfo | null {
  return RANKS.find((r) => r.minStars > stars) ?? null;
}

/** ◎ の連続数に応じた倍率（§6.3） */
export function comboMultiplier(greatStreak: number): number {
  if (greatStreak >= 5) return 2.0;
  if (greatStreak >= 3) return 1.5;
  if (greatStreak >= 2) return 1.2;
  return 1;
}

/** チャレンジ（10問）の★。1問の最高はおよそ 150 点 */
export function challengeStars(total: number, count: number): number {
  const avg = total / Math.max(1, count);
  if (avg >= 115) return 3;
  if (avg >= 85) return 2;
  if (avg >= 50) return 1;
  return 0;
}

/** ◎ の割合から★（アウトカウント比較・入門など少ない問題数のモード） */
export function gradeStars(greats: number, oks: number, count: number): number {
  const s = (greats + oks * 0.5) / Math.max(1, count);
  if (s >= 0.99) return 3;
  if (s >= 0.6) return 2;
  if (s >= 0.3) return 1;
  return 0;
}

// ---- バッジ（§6.4） ----

export type BadgeDef = { id: string; name: string; desc: string; icon: string; test: (s: Stats) => boolean };

export const BADGES: BadgeDef[] = [
  { id: 'first_nice', name: '初めてのナイス判断', desc: '◎ を1回とる', icon: '🌟', test: (s) => sumGreat(s) >= 1 },
  { id: 'two_out_master', name: '2アウト職人', desc: '2アウトの場面で ◎ を10回', icon: '🔥', test: (s) => s.twoOutGreat >= 10 },
  { id: 'careful', name: '石橋をたたく', desc: '0アウトで正しく止めて ◎ を10回', icon: '🪨', test: (s) => s.zeroOutStopGreat >= 10 },
  { id: 'no_hesitation', name: '迷わない男', desc: '10プレー連続で「迷い」なし', icon: '⚡', test: (s) => s.noHesitateStreak >= 10 },
  { id: 'slide', name: '滑り込め！', desc: 'スライディングの合図でセーフを5回', icon: '⬇️', test: (s) => s.slideSafe >= 5 },
  { id: 'revenge', name: 'あの日のリベンジ', desc: '「あの日の場面」で回して ◎', icon: '🏆', test: (s) => s.anohiCleared },
  { id: 'combo5', name: '5連続ナイス判断', desc: '◎ を5回続ける', icon: '🎯', test: (s) => s.bestCombo >= 5 },
];

const sumGreat = (s: Stats) => s.byOuts[0].great + s.byOuts[1].great + s.byOuts[2].great;

/** P_safe と基準から、どちらが正解だったか（ギリギリは null） */
function clearAnswer(score: PlayScore): 'send' | 'stop' | null {
  const d = score.pSafe - score.threshold;
  if (d >= 0.1) return 'send';
  if (d <= -0.1) return 'stop';
  return null;
}

/** 1プレーの結果を統計に反映し、新しく取ったバッジを返す */
export function applyPlay(
  profile: Profile,
  score: PlayScore,
  tl: PlayTimeline,
  ctx: { combo: number; presetId?: string },
): { profile: Profile; newBadges: BadgeDef[] } {
  const s: Stats = structuredClone(profile.stats);
  const outs = tl.scenario.outs;
  const o = s.byOuts[outs];
  s.plays++;
  o.plays++;
  o[score.grade.grade]++;
  const ans = clearAnswer(score);
  if (score.decision === 'stop') {
    o.stops++;
    if (ans === 'send') o.stoppedShouldSend++;
  } else {
    o.sends++;
    if (ans === 'stop') o.sentShouldStop++;
  }
  const great = score.grade.grade === 'great';
  if (great && outs === 2) s.twoOutGreat++;
  if (great && outs === 0 && score.decision === 'stop') s.zeroOutStopGreat++;
  s.noHesitateStreak = score.timing === 'hesitate' ? 0 : s.noHesitateStreak + 1;
  if (tl.slideHelped) s.slideSafe++;
  s.bestCombo = Math.max(s.bestCombo, ctx.combo);
  if (ctx.presetId === 'anohi' && great && score.decision === 'send') s.anohiCleared = true;

  const newBadges = BADGES.filter((b) => !profile.badges.includes(b.id) && b.test(s));
  return {
    profile: { ...profile, stats: s, badges: [...profile.badges, ...newBadges.map((b) => b.id)] },
    newBadges,
  };
}

/** モード終了時に★を加算。モードごとの最高★を超えた分だけ増える */
export function awardStars(
  profile: Profile,
  modeKey: string,
  stars: number,
  /** true なら何度でも★が増える（遊ぶほどランクが上がる）。false なら最高記録の更新分だけ */
  repeatable: boolean,
): { profile: Profile; gained: number } {
  const best = profile.bestStars[modeKey] ?? 0;
  const gained = repeatable ? stars : Math.max(0, stars - best);
  return {
    profile: {
      ...profile,
      stars: profile.stars + gained,
      bestStars: { ...profile.bestStars, [modeKey]: Math.max(best, stars) },
    },
    gained,
  };
}
