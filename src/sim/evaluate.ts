// 判断の評価（§5）。P_safe はモンテカルロで求める。

import { BATTER, EVAL, RUNNER } from './constants';
import { drawsFromSeed, mixDraws, type Draws, type KnownFacts } from './draws';
import { createBallPath } from './ball';
import { hashSeed } from './rng';
import { simulatePlay, type PlayTimeline } from './play';
import { simulateBatter, simulateRunner } from './runner';
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
 * 時刻 tD に「回れ」を出した場合の本塁セーフ確率。
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
export type Verdict = 'nice' | 'close' | 'reckless' | 'too_cautious' | 'too_early' | 'too_late';

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

/** best/good = 間に合った、early = はやすぎ（×）、late = おそい・迷った（×） */
export type Timing = 'best' | 'good' | 'early' | 'late';

export type WindowInfo = {
  /** 判断ウィンドウの開始（判断する塁の手前 12m） */
  tWindowStart: number;
  /** 判断する塁に着く時刻 */
  tThird: number;
  /** 締め切り（判断する塁の手前 3m）。これを過ぎたら「おそい」 */
  tDeadline: number;
};

/** 判断しなかった場合の走者の動きから、判断ウィンドウを求める */
export function decisionWindow(sc: Scenario): WindowInfo {
  const ball = createBallPath(sc);
  const tr = simulateRunner(sc, [], ball.landingTime, false);
  const tWindowStart = tr.tWindowStart ?? 0;
  return { tWindowStart, tThird: tr.tThird ?? tWindowStart, tDeadline: tr.tDeadline ?? tWindowStart };
}

/** 早すぎにならない最初の時刻：判断ウィンドウの開始か、外野手が捕る少し前の早いほう */
export function windowOpen(win: WindowInfo, tCatch: number): number {
  return Math.min(win.tWindowStart, tCatch - RUNNER.earlyMargin);
}

/**
 * タイミングの判定。tD = 合図した時刻（締め切りまでに合図がなければ null）
 * tRef = 判断の決め手になる瞬間（二塁走者は外野手の捕球、打者走者は外野手の送球）
 */
export function judgeTiming(tD: number | null, tRef: number, win: WindowInfo): Timing {
  if (tD === null || tD > win.tDeadline + 1e-6) return 'late';
  const open = windowOpen(win, tRef);
  if (tD < open - 1e-6) return 'early';
  const w = EVAL.bestTimingWindow;
  let lo = tRef - w;
  let hi = tRef + w;
  // 決め手の瞬間が締め切りより後（深い打球）なら、ウィンドウの中で早めに決めればベスト
  if (lo > win.tDeadline) [lo, hi] = [open, win.tDeadline];
  return tD >= lo && tD <= hi ? 'best' : 'good';
}

/** タイミングが × のときの採点（判断の中身に関係なく ×） */
function timingFail(g: GradeResult, timing: Timing): GradeResult {
  if (timing === 'early') return { ...g, grade: 'bad', verdict: 'too_early', points: 0 };
  if (timing === 'late') return { ...g, grade: 'bad', verdict: 'too_late', points: 0 };
  return g;
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
  /** 打者走者の判断（長打で二塁走者を回したときだけ） */
  batter: BatterScore | null;
  total: number;
};

export type BatterScore = {
  decision: 'send' | 'stop';
  decisionTime: number;
  /** 三塁へ行かせた場合の三塁セーフ確率 */
  pSafe: number;
  safeCount: number;
  mcRuns: number;
  threshold: number;
  grade: GradeResult;
  timing: Timing;
  timingPoints: number;
  resultPoints: number;
  total: number;
};

/** 打者走者を時刻 tD に「三塁へ」行かせた場合の三塁セーフ確率 */
export function estimateBatterPSafe(
  sc: Scenario,
  actualDraws: Draws,
  leadCommands: Command[],
  batterPrior: Command[],
  tD: number,
  n: number = EVAL.mcRuns,
  mcSeed = hashSeed(sc.seed, 0xba77),
): PSafeEstimate {
  const actual = simulatePlay(sc, [...leadCommands, ...batterPrior], actualDraws, { frames: false });
  const known = knownFactsAt(actual, tD);
  const commands: Command[] = [...leadCommands, ...batterPrior, { t: tD, kind: 'bsend' }];
  let safe = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const draws = mixDraws(actualDraws, drawsFromSeed(hashSeed(mcSeed, i)), known);
    const tl = simulatePlay(sc, commands, draws, { frames: false });
    if (!tl.batter?.eligible) continue;
    count++;
    if (tl.batter.result === 'third') safe++;
  }
  return { pSafe: count ? safe / count : 0, safe, n: count };
}

export function batterThresholdFor(sc: Scenario): number {
  return BATTER.thresholds[sc.outs];
}

function scoreBatter(timeline: PlayTimeline, draws: Draws, mcRuns: number): BatterScore | null {
  const b = timeline.batter;
  if (!b || !b.eligible) return null;
  const sc = timeline.scenario;
  const tr = b.trace;
  const leadCommands = timeline.runner.accepted;
  const decisions = tr.accepted;
  const last = decisions.at(-1);
  let decision: 'send' | 'stop';
  let tD: number;
  let prior: Command[];
  const free = simulateBatter(sc, [], false);
  const win: WindowInfo = {
    tWindowStart: free.tWindowStart ?? 0,
    tThird: free.tThird ?? 0,
    tDeadline: free.tDeadline ?? 0,
  };
  if (last) {
    decision = last.kind === 'bsend' ? 'send' : 'stop';
    tD = last.t;
    prior = decisions.slice(0, -1);
  } else {
    decision = 'stop';
    tD = win.tDeadline;
    prior = [];
  }
  const est = estimateBatterPSafe(sc, draws, leadCommands, prior, tD, mcRuns);
  const threshold = batterThresholdFor(sc);
  // 打者走者の判断の決め手は、外野手が投げた瞬間（中継に返すか・どこへ投げるか）。
  // 打者走者のボタンはウィンドウが始まってから出るので、早すぎにはならない
  const timing = judgeTiming(last ? last.t : null, Math.max(timeline.fielding.tRelease, win.tWindowStart), win);
  const g = timingFail(gradeDecision(decision, est.pSafe, threshold), timing);
  const grade = { ...g, points: g.grade === 'bad' ? 0 : EVAL.batterPoints[g.grade] };
  const timingPoints = timing === 'best' ? EVAL.batterTimingBonus : 0;
  const resultPoints = b.result === 'third' ? EVAL.batterSafeBonus : 0;
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
    total: grade.points + timingPoints + resultPoints,
  };
}

/**
 * 1プレーの採点。timeline は最終的な合図で計算したもの。
 * 判断は最後に受け付けた「回れ／止まれ」、なければ迷い（三塁到達時点の自動ストップ）。
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
  const win = decisionWindow(sc);
  if (last) {
    decision = last.kind as 'send' | 'stop';
    tD = last.t;
    prior = decisions.slice(0, -1);
  } else {
    // 締め切りまでに合図しなかった：その時点で回していたら、を P_safe に使う
    decision = 'stop';
    tD = win.tDeadline;
    prior = [];
  }
  const est = estimatePSafe(sc, draws, prior, tD, opts.mcRuns ?? EVAL.mcRuns);
  const threshold = thresholdFor(sc, opts);
  const timing = judgeTiming(last ? last.t : null, timeline.fielding.tCatch, win);
  const grade = timingFail(gradeDecision(decision, est.pSafe, threshold), timing);
  const timingPoints = timing === 'best' ? EVAL.timingBonus : 0;
  const resultPoints = timeline.result === 'safe' ? EVAL.safeBonus : 0;
  const slidePoints = timeline.slideHelped ? EVAL.slideBonus : 0;
  const batter = scoreBatter(timeline, draws, opts.mcRuns ?? EVAL.mcRuns);
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
    batter,
    total: grade.points + timingPoints + resultPoints + slidePoints + (batter?.total ?? 0),
  };
}
