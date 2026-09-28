// 判断の評価（§5）。P_safe はモンテカルロで求める。

import { EVAL } from './constants';
import { drawsFromSeed, mixDraws, type Draws, type KnownFacts } from './draws';
import { createBallPath } from './ball';
import { hashSeed } from './rng';
import { simulatePlay, type PlayTimeline } from './play';
import { simulateRunner } from './runner';
import type { Command, OutCount, Scenario } from './types';

export type Thresholds = Record<OutCount, number>;

export type ThresholdOptions = {
  thresholds?: Thresholds;
  /** 点差・イニングの補正（§5.2 フェーズ2） */
  situational?: boolean;
  lastInning?: number;
};

/** 回すべき P_safe の基準 */
export function thresholdFor(sc: Scenario, opts: ThresholdOptions = {}): number {
  const base = (opts.thresholds ?? EVAL.thresholds)[sc.outs];
  if (!opts.situational) return base;
  let th = base;
  const last = opts.lastInning ?? 6;
  const diff = sc.scoreDiff;
  if (diff !== undefined) {
    if (sc.outs === 2 && (sc.inning ?? 0) >= last && (diff === 0 || diff === -1)) th -= 0.05;
    if (diff >= 5) th += 0.1;
  }
  return Math.min(0.95, Math.max(0.05, th));
}

/** 判断時刻 tD の時点で確定している事象 */
export function knownFactsAt(actual: PlayTimeline, tD: number): KnownFacts {
  return {
    reaction: tD >= actual.fielding.reaction,
    caught: tD >= actual.fielding.tCatch,
    released: tD >= actual.fielding.tRelease,
  };
}

export type PSafeEstimate = { pSafe: number; safe: number; n: number };

/**
 * 時刻 tD に「回せ」を出した場合の本塁セーフ確率。
 * すでに起きた事象は actualDraws の値に固定し、それ以外を引き直す。
 */
export function estimatePSafe(
  sc: Scenario,
  actualDraws: Draws,
  priorCommands: Command[],
  tD: number,
  n: number = EVAL.mcRuns,
  mcSeed = hashSeed(sc.seed, 0x5afe),
): PSafeEstimate {
  const actual = simulatePlay(sc, priorCommands, actualDraws, { frames: false });
  const known = knownFactsAt(actual, tD);
  const commands: Command[] = [...priorCommands, { t: tD, kind: 'send' }];
  let safe = 0;
  for (let i = 0; i < n; i++) {
    const fresh = drawsFromSeed(hashSeed(mcSeed, i));
    const draws = mixDraws(actualDraws, fresh, known);
    if (simulatePlay(sc, commands, draws, { frames: false }).result === 'safe') safe++;
  }
  return { pSafe: safe / n, safe, n };
}

/** 何も確定していない状態で、早めに回した場合の P_safe（キャリブレーション・出題選別用） */
export function baselinePSafe(sc: Scenario, n = 2000, seed = 12345): number {
  let safe = 0;
  const commands: Command[] = [{ t: 0, kind: 'send' }];
  for (let i = 0; i < n; i++) {
    const draws = drawsFromSeed(hashSeed(seed, i));
    if (simulatePlay(sc, commands, draws, { frames: false }).result === 'safe') safe++;
  }
  return safe / n;
}

export type Grade = 'great' | 'ok' | 'bad';
export type Verdict = 'nice' | 'close' | 'reckless' | 'too_cautious';

export type GradeResult = { grade: Grade; verdict: Verdict; diff: number; points: number };

export function gradeDecision(decision: 'send' | 'stop', pSafe: number, threshold: number): GradeResult {
  const diff = pSafe - threshold;
  let grade: Grade;
  let verdict: Verdict;
  if (decision === 'send') {
    if (diff >= EVAL.sendGreat) [grade, verdict] = ['great', 'nice'];
    else if (diff >= EVAL.sendOkMin) [grade, verdict] = ['ok', 'close'];
    else [grade, verdict] = ['bad', 'reckless'];
  } else {
    if (diff <= EVAL.stopGreat) [grade, verdict] = ['great', 'nice'];
    else if (diff <= EVAL.stopOkMax) [grade, verdict] = ['ok', 'close'];
    else [grade, verdict] = ['bad', 'too_cautious'];
  }
  return { grade, verdict, diff, points: EVAL.points[grade] };
}

/** P_safe と基準から「正解」を返す（ギリギリなら close） */
export function correctAnswer(pSafe: number, threshold: number): 'send' | 'stop' | 'close' {
  const diff = pSafe - threshold;
  if (diff >= EVAL.sendGreat) return 'send';
  if (diff <= EVAL.stopGreat) return 'stop';
  return 'close';
}

export type Timing = 'best' | 'good' | 'early' | 'hesitate';

export type WindowInfo = { tWindowStart: number; tThird: number };

/** 判断しなかった場合の走者の動きから、判断ウィンドウを求める */
export function decisionWindow(sc: Scenario): WindowInfo {
  const ball = createBallPath(sc);
  const tr = simulateRunner(sc, [], ball.landingTime, false);
  return { tWindowStart: tr.tWindowStart ?? 0, tThird: tr.tThird ?? tr.tWindowStart ?? 0 };
}

export function judgeTiming(tD: number, hesitated: boolean, tCatch: number, win: WindowInfo): Timing {
  if (hesitated) return 'hesitate';
  if (tD < win.tWindowStart) return 'early';
  const w = EVAL.bestTimingWindow;
  let lo = tCatch - w;
  let hi = tCatch + w;
  // 捕球がウィンドウの外なら、ウィンドウの中で早めに決めればベストタイミング
  if (hi < win.tWindowStart) [lo, hi] = [win.tWindowStart, win.tWindowStart + 2 * w];
  if (lo > win.tThird) [lo, hi] = [win.tWindowStart, win.tThird];
  return tD >= lo && tD <= hi ? 'best' : 'good';
}

export type PlayScore = {
  decision: 'send' | 'stop';
  decisionTime: number;
  pSafe: number;
  safeCount: number;
  mcRuns: number;
  threshold: number;
  grade: GradeResult;
  timing: Timing;
  timingPoints: number;
  resultPoints: number;
  slidePoints: number;
  total: number;
};

/**
 * 1プレーの採点。timeline は最終的な合図で計算したもの。
 * 判断は最後に受け付けた「回せ／止まれ」、なければ迷い（三塁到達時点の自動ストップ）。
 */
export function scorePlay(
  timeline: PlayTimeline,
  draws: Draws,
  opts: ThresholdOptions & { mcRuns?: number } = {},
): PlayScore {
  const sc = timeline.scenario;
  const r = timeline.runner;
  const decisions = r.accepted.filter((c) => c.kind !== 'slide');
  const last = decisions[decisions.length - 1];
  let decision: 'send' | 'stop';
  let tD: number;
  let prior: Command[];
  if (last) {
    decision = last.kind as 'send' | 'stop';
    tD = last.t;
    prior = decisions.slice(0, -1);
  } else {
    decision = 'stop';
    tD = r.tHesitate ?? r.tThird ?? 0;
    prior = [];
  }
  const est = estimatePSafe(sc, draws, prior, tD, opts.mcRuns ?? EVAL.mcRuns);
  const threshold = thresholdFor(sc, opts);
  const grade = gradeDecision(decision, est.pSafe, threshold);
  const hesitated = r.hesitated && (!last || last.t >= (r.tHesitate ?? Infinity));
  const timing = judgeTiming(tD, hesitated, timeline.fielding.tCatch, decisionWindow(sc));
  const timingPoints = timing === 'best' ? EVAL.timingBonus : timing === 'hesitate' ? EVAL.hesitatePenalty : 0;
  const resultPoints = timeline.result === 'safe' ? EVAL.safeBonus : 0;
  const slidePoints = timeline.slideHelped ? EVAL.slideBonus : 0;
  return {
    decision,
    decisionTime: tD,
    pSafe: est.pSafe,
    safeCount: est.safe,
    mcRuns: est.n,
    threshold,
    grade,
    timing,
    timingPoints,
    resultPoints,
    slidePoints,
    total: grade.points + timingPoints + resultPoints + slidePoints,
  };
}
