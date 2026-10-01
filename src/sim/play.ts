// 1プレーの時系列シミュレーション。
// simulatePlay(scenario, commands, draws) は決定的：同じ入力なら同じ結果になる。
// UI はここで作った PlayTimeline を再生するだけにする。

import { createBallPath, type BallPath } from './ball';
import { isExtraBase, planBatter, type BatterPlay } from './batter';
import { outProbability } from './probability';
import { CROSSPLAY, FIELDER, FRAME_DT, RUNNER, THROW } from './constants';
import { drawsFromSeed, type Draws } from './draws';
import {
  BASES,
  batterPosition,
  dist,
  fielderStart,
  lerp,
  leadGeom,
  vec,
} from './field';
import { chaserPosition, findCatch, fumbleProbability, holdTime, runDistance, type CatchPlan } from './fielder';
import { runnerGAt, simulateRunner, type RunnerTrace } from './runner';
import { planThrow, type ThrowLeg, type ThrowPlan } from './throw';
import type {
  Command,
  FielderId,
  Frame,
  OutfielderId,
  PlayEvent,
  PlayResult,
  SafeReason,
  Scenario,
  Vec,
} from './types';

export type FieldingPlan = CatchPlan & {
  reaction: number;
  fumble: boolean;
  fumbleExtra: number;
  hold: number;
  tRelease: number;
};

export type CrossPlay = {
  tRun: number;
  tBall: number;
  tBallReady: number;
  /** Δ = T_run − (T_ball + T_tag) */
  delta: number;
  outProb: number;
  slideApplied: boolean;
};

export type ThirdPlay = {
  tBack: number;
  tBallReady: number;
  delta: number;
  outProb: number;
};

export type PlayTimeline = {
  scenario: Scenario;
  commands: Command[];
  ball: BallPath;
  fielding: FieldingPlan;
  throwPlan: ThrowPlan;
  runner: RunnerTrace;
  crossPlay: CrossPlay | null;
  thirdPlay: ThirdPlay | null;
  result: PlayResult;
  safeReason: SafeReason | null;
  /** スライディングの合図が効いた（クロスプレーでセーフ） */
  slideHelped: boolean;
  /** 長打のときの打者走者（二塁を回るか）。長打でなければ null */
  batter: BatterPlay | null;
  events: PlayEvent[];
  duration: number;
  frames: Frame[];
};

export type SimOptions = { frames?: boolean };

export { outProbability };

export function planFielding(scenario: Scenario, ball: BallPath, draws: Draws): FieldingPlan {
  const reaction = draws.fielderReaction;
  const plan = findCatch(ball, scenario.outfieldDepth, reaction);
  const fumble = draws.fumbleU < fumbleProbability(scenario);
  const [f0, f1] = FIELDER.fumbleExtra;
  const fumbleExtra = fumble ? f0 + (f1 - f0) * draws.fumbleExtraU : 0;
  const hold = holdTime(plan.catchType, draws.holdU) + fumbleExtra;
  return { ...plan, reaction, fumble, fumbleExtra, hold, tRelease: plan.tCatch + hold };
}

export function simulatePlay(
  scenario: Scenario,
  commands: Command[],
  draws: Draws = drawsFromSeed(scenario.seed),
  opts: SimOptions = {},
): PlayTimeline {
  const record = opts.frames ?? true;
  const ball = createBallPath(scenario);
  const fielding = planFielding(scenario, ball, draws);
  const arm = scenario.outfieldArm[fielding.fielder];
  const throwPlan = planThrow(fielding.fielder, fielding.point, arm, fielding.tRelease, draws);
  const leadCommands = commands.filter((c) => c.kind === 'send' || c.kind === 'stop' || c.kind === 'slide');
  const runner = simulateRunner(scenario, leadCommands, ball.landingTime, record);
  const batter = isExtraBase(ball, fielding)
    ? planBatter(scenario, fielding, throwPlan, runner, commands, draws, record)
    : null;
  const cut = batter?.throw?.via === 'cut';

  let result: PlayResult;
  let safeReason: SafeReason | null = null;
  let crossPlay: CrossPlay | null = null;
  let thirdPlay: ThirdPlay | null = null;
  let slideHelped = false;
  const tBall = throwPlan.tArriveHome;
  const tCatcherReady = tBall + (throwPlan.catcherMoved ? THROW.catcherMoveTime : 0);

  if (runner.tHome !== null) {
    if (cut) {
      // 中継が三塁へ投げたので、本塁には送球が来ない
      result = 'safe';
      safeReason = 'beat_throw';
    } else if (throwPlan.wild) {
      result = 'safe';
      safeReason = 'wild_throw';
    } else if (throwPlan.catcherDrop) {
      result = 'safe';
      safeReason = 'catcher_drop';
    } else {
      const tBallReady = tCatcherReady + CROSSPLAY.tagTime;
      const delta = runner.tHome - tBallReady;
      let outProb = outProbability(delta);
      const slideApplied = runner.slideCalled && Math.abs(delta) <= CROSSPLAY.slideWindow;
      if (slideApplied) outProb *= CROSSPLAY.slideFactor;
      crossPlay = { tRun: runner.tHome, tBall, tBallReady, delta, outProb, slideApplied };
      const out = draws.tagU < outProb;
      result = out ? 'out_home' : 'safe';
      if (!out) {
        safeReason = delta < 0 ? 'beat_throw' : 'tag_missed';
        slideHelped = slideApplied && draws.tagU >= outProb / CROSSPLAY.slideFactor;
      }
    }
  } else {
    result = 'stop';
    const rt = runner.retreat;
    if (rt && !throwPlan.wild) {
      // 帰塁する走者に、捕手が三塁へ投げる
      const tHasBall = tCatcherReady + (throwPlan.catcherDrop ? 1.5 : 0);
      if (rt.tBack > tHasBall) {
        const tThrow = Math.max(tHasBall, rt.tStart) + THROW.thirdThrowHold;
        const tBallReady = tThrow + dist(BASES.home, BASES.third) / THROW.thirdThrowSpeed + CROSSPLAY.tagTime;
        const delta = rt.tBack - tBallReady;
        const outProb = outProbability(delta);
        thirdPlay = { tBack: rt.tBack, tBallReady, delta, outProb };
        if (draws.thirdTagU < outProb) result = 'out_third';
      }
    }
  }

  const events = buildEvents(scenario, ball, fielding, throwPlan, runner, crossPlay, thirdPlay, result, batter);
  const bt = batter?.trace;
  const endCandidates = [
    cut ? batter!.throw!.tEnd + 1.2 : throwPlan.tArriveHome + 1.2,
    batter?.third ? batter.third.tBallReady + 0.6 : 0,
    bt?.tHome ?? 0,
    bt?.tThird != null ? bt.tThird + RUNNER.hesitateDuration + 1.2 : 0,
    runner.tHome ?? 0,
    runner.retreat?.tBack ?? 0,
    thirdPlay ? thirdPlay.tBallReady : 0,
    runner.tThird !== null ? runner.tThird + RUNNER.hesitateDuration + 1.5 : 0,
  ];
  const duration = Math.max(...endCandidates) + 0.8;
  events.push({ t: duration - 0.8, kind: 'result', detail: result });

  const tl: PlayTimeline = {
    scenario,
    commands,
    ball,
    fielding,
    throwPlan,
    runner,
    crossPlay,
    thirdPlay,
    result,
    safeReason,
    slideHelped,
    batter,
    events,
    duration,
    frames: [],
  };
  if (record) tl.frames = buildFrames(tl);
  return tl;
}

function buildEvents(
  scenario: Scenario,
  ball: BallPath,
  f: FieldingPlan,
  th: ThrowPlan,
  r: RunnerTrace,
  cp: CrossPlay | null,
  tp: ThirdPlay | null,
  result: PlayResult,
  batter: BatterPlay | null,
): PlayEvent[] {
  const cut = batter?.throw?.via === 'cut';
  const ev: PlayEvent[] = [{ t: 0, kind: 'contact' }, { t: r.tStart, kind: 'runnerStart' }];
  if (scenario.battedBall.type !== 'ground') ev.push({ t: ball.landingTime, kind: 'land' });
  if (r.tWindowStart !== null) ev.push({ t: r.tWindowStart, kind: 'windowStart' });
  ev.push({ t: f.tCatch, kind: 'catch', detail: `${f.fielder}:${f.catchType}` });
  if (f.fumble) ev.push({ t: f.tCatch + 0.1, kind: 'fumble' });
  ev.push({ t: f.tRelease, kind: 'release' });
  if (th.relay) {
    ev.push({ t: th.legs[0].tEnd, kind: 'relayCatch', detail: th.relay.by });
    ev.push({ t: th.legs[1].tStart, kind: 'relayRelease', detail: th.relay.by });
  }
  if (r.tThird !== null) ev.push({ t: r.tThird, kind: 'runnerThird' });
  if (r.tHesitate !== null) ev.push({ t: r.tHesitate, kind: 'hesitate' });
  if (r.autoStopped && r.tHesitate !== null)
    ev.push({ t: r.tHesitate + RUNNER.hesitateDuration, kind: 'autoStop' });
  for (const c of r.accepted) ev.push({ t: c.t, kind: 'decision', detail: c.kind });
  if (!cut) ev.push({ t: th.tArriveHome, kind: 'ballHome' });
  if (cp) ev.push({ t: cp.tRun, kind: 'runnerHome' });
  if (tp) ev.push({ t: tp.tBallReady - CROSSPLAY.tagTime, kind: 'throwThird' });
  if (result === 'stop' || result === 'out_third') {
    const tStopped = r.retreat?.tBack ?? (r.tThird ?? 0) + 0.8;
    ev.push({ t: tStopped, kind: 'runnerStopped' });
  }
  // 審判のコール：本塁（または三塁）で決着がつく瞬間
  let tCall: number;
  if (r.tHome !== null) tCall = r.tHome + 0.15;
  else if (tp) tCall = Math.max(tp.tBack, tp.tBallReady) + 0.1;
  else tCall = r.retreat?.tBack ?? (r.tThird ?? 0) + 0.8;
  ev.push({ t: tCall, kind: 'call', detail: result });

  // 打者走者
  if (batter) {
    const bt = batter.trace;
    if (batter.eligible && bt.tWindowStart !== null) ev.push({ t: bt.tWindowStart, kind: 'batterWindow' });
    if (bt.tThird !== null) ev.push({ t: bt.tThird, kind: 'batterSecond' });
    if (batter.eligible && bt.tHesitate !== null) {
      ev.push({ t: bt.tHesitate, kind: 'hesitate', detail: 'batter' });
      if (bt.autoStopped) ev.push({ t: bt.tHesitate + RUNNER.hesitateDuration, kind: 'autoStop', detail: 'batter' });
    }
    for (const c of bt.accepted) if (batter.eligible) ev.push({ t: c.t, kind: 'decision', detail: c.kind });
    if (batter.throw?.via === 'cut') ev.push({ t: batter.throw.tStart, kind: 'cutToThird' });
    if (batter.result !== 'second' && bt.tHome !== null) {
      const tB = batter.third ? Math.max(batter.third.tRun, batter.third.tBallReady) + 0.1 : bt.tHome + 0.15;
      ev.push({ t: tB, kind: 'batterCall', detail: batter.result });
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}

// ---- 描画用のフレーム ----

const OUTFIELDERS: OutfielderId[] = ['LF', 'CF', 'RF'];

/** start から target へ、tGo 以降に speed で動く */
function moveTo(start: Vec, target: Vec, tGo: number, speed: number, t: number): Vec {
  const d = dist(start, target);
  if (d === 0 || t <= tGo) return start;
  return lerp(start, target, Math.min(1, ((t - tGo) * speed) / d));
}

/** 静止から加速して走る距離 */
function accelRun(tau: number, top: number, a: number): number {
  if (tau <= 0) return 0;
  const ta = top / a;
  return tau < ta ? 0.5 * a * tau * tau : (top * ta) / 2 + top * (tau - ta);
}

function buildFrames(tl: PlayTimeline): Frame[] {
  const { scenario, ball, fielding: f, throwPlan: th, runner, thirdPlay } = tl;
  const geom = leadGeom(scenario);
  const depth = scenario.outfieldDepth;
  const starts = {} as Record<FielderId, Vec>;
  for (const id of ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'] as FielderId[])
    starts[id] = fielderStart(id, depth);

  const catchSpot = chaserPosition(f, f.reaction, f.tCatch);
  const relayBy = th.relay?.by;
  const relayPoint = th.relay?.point;
  const cutoff = lerp(vec(0, 0), f.point, 0.35);
  const lastLeg = th.legs[th.legs.length - 1];
  const catcherSpot = vec(Math.max(-3.5, Math.min(3.5, th.dev)), -0.6);
  const bThrow = tl.batter?.throw ?? null;
  const cut = bThrow?.via === 'cut';
  const thirdBag = vec(BASES.third.x + 0.6, BASES.third.y + 0.4);
  const cutLeg: ThrowLeg | null = cut
    ? {
        thrower: bThrow.thrower,
        from: bThrow.from,
        to: vec(thirdBag.x + Math.max(-5, Math.min(5, bThrow.dev)) * 0.7, thirdBag.y - Math.max(-5, Math.min(5, bThrow.dev)) * 0.7),
        tStart: bThrow.tStart,
        tEnd: bThrow.tEnd,
        distance: bThrow.distance,
        bounce: false,
      }
    : null;
  // 中継が三塁へ投げたときは、本塁への2本目の送球の代わりに三塁への送球を描く
  const legs: ThrowLeg[] = cutLeg ? (th.relay ? [th.legs[0], cutLeg] : [cutLeg]) : th.legs;

  // 打者走者：一塁へ走り、本塁へ送球されたら二塁を狙う（表示のみ）
  const bTop = RUNNER.batterTopSpeed;
  const bReact = RUNNER.batterReaction;
  let tAtFirst = bReact;
  while (accelRun(tAtFirst - bReact, bTop, RUNNER.accel) < 23) tAtFirst += 0.02;
  const bTrace = tl.batter?.trace;
  const batterAt = (t: number): Vec => {
    if (bTrace) {
      const b = runnerGAt(bTrace, t);
      return batterPosition(b.g, true, b.bulge > 0);
    }
    return batterPosition(batterG(t));
  };
  const batterG = (t: number) => {
    const g1 = accelRun(t - bReact, bTop, RUNNER.accel);
    if (g1 < 23) return g1;
    if (tAtFirst >= f.tRelease) return Math.min(46, g1);
    if (t < f.tRelease) return 23;
    return Math.min(46, 23 + accelRun(t - f.tRelease, bTop, RUNNER.accel));
  };

  const ballAt = (t: number): { x: number; y: number; h: number } => {
    if (t < f.tCatch) {
      const p = ball.posAt(t);
      return { ...p, h: ball.hAt(t) };
    }
    if (t < f.tRelease) {
      if (f.fumble && t < f.tCatch + 0.8) {
        // ファンブル：ボールがこぼれる
        const k = (t - f.tCatch) / 0.8;
        const off = Math.sin(Math.PI * k) * 1.6;
        return { x: catchSpot.x + off, y: catchSpot.y + off * 0.5, h: 0.2 };
      }
      return { ...catchSpot, h: 1 };
    }
    for (const leg of legs) {
      if (t < leg.tStart) return { ...leg.from, h: 1 };
      if (t < leg.tEnd) {
        const k = (t - leg.tStart) / (leg.tEnd - leg.tStart);
        const p = lerp(leg.from, leg.to, k);
        const arc = leg.distance * THROW.arcPerMeter;
        const h = leg.bounce
          ? k < 0.75
            ? 1.5 + arc * Math.sin((Math.PI * k) / 0.75)
            : 0.8 * Math.sin((Math.PI * (k - 0.75)) / 0.25)
          : 1.5 + arc * Math.sin(Math.PI * k);
        return { ...p, h };
      }
    }
    if (cutLeg) {
      if (bThrow!.wild) {
        const k = Math.min(1, (t - cutLeg.tEnd) / 1.2);
        return { x: cutLeg.to.x - 8 * k, y: cutLeg.to.y - 6 * k, h: 0.3 * (1 - k) };
      }
      return { ...thirdBag, h: 1 };
    }
    const tArr = lastLeg.tEnd;
    if (th.wild) {
      const k = Math.min(1, (t - tArr) / 1.2);
      return { x: lastLeg.to.x * (1 + k), y: -12 * k, h: 0.3 * (1 - k) };
    }
    if (thirdPlay) {
      const t0 = thirdPlay.tBallReady - CROSSPLAY.tagTime - dist(BASES.home, BASES.third) / THROW.thirdThrowSpeed;
      const t1 = thirdPlay.tBallReady - CROSSPLAY.tagTime;
      if (t >= t0) {
        const k = Math.min(1, (t - t0) / (t1 - t0));
        return { ...lerp(catcherSpot, vec(BASES.third.x + 0.8, BASES.third.y), k), h: 1.5 + Math.sin(Math.PI * k) };
      }
    }
    if (bThrow && bThrow.via === 'catcher' && t >= bThrow.tStart) {
      // 打者走者を三塁で刺しにいく捕手の送球
      const k = Math.min(1, (t - bThrow.tStart) / (bThrow.tEnd - bThrow.tStart));
      return { ...lerp(catcherSpot, thirdBag, k), h: 1.5 + Math.sin(Math.PI * k) };
    }
    if (th.catcherDrop && t < tArr + 0.8) {
      const k = (t - tArr) / 0.8;
      return { x: catcherSpot.x + 1.5 * k, y: catcherSpot.y - 1.2 * k, h: 0.2 };
    }
    return { ...catcherSpot, h: 0.8 };
  };

  const fieldersAt = (t: number): Record<FielderId, Vec> => {
    const out = {} as Record<FielderId, Vec>;
    for (const id of OUTFIELDERS) {
      if (id === f.fielder) {
        out[id] = chaserPosition(f, f.reaction, t);
      } else {
        // カバーに走る：捕球点の 8m 手前まで
        const s = starts[id];
        const d = Math.max(0, dist(s, f.point) - 8);
        const run = Math.min(d, runDistance(t, f.reaction + 0.2, FIELDER.backupSpeed));
        out[id] = d === 0 ? s : lerp(s, f.point, run / dist(s, f.point));
      }
    }
    out.P = moveTo(starts.P, vec(1.5, -7), 1.0, 4.5, t);
    // 捕手：送球に合わせて動く
    out.C = moveTo(starts.C, catcherSpot, lastLeg.tStart + 0.3, 5, t);
    out['3B'] = moveTo(starts['3B'], vec(BASES.third.x + 1.2, BASES.third.y + 1.2), 0.8, 4, t);
    out['1B'] = moveTo(starts['1B'], relayBy ? vec(BASES.first.x, BASES.first.y) : cutoff, 1.0, 4.5, t);
    if (relayBy === 'SS') {
      out.SS = moveTo(starts.SS, relayPoint!, 0.6, 5.5, t);
      out['2B'] = moveTo(starts['2B'], vec(BASES.second.x + 0.8, BASES.second.y), 0.8, 4.5, t);
    } else if (relayBy === '2B') {
      out['2B'] = moveTo(starts['2B'], relayPoint!, 0.6, 5.5, t);
      out.SS = moveTo(starts.SS, vec(BASES.second.x - 0.8, BASES.second.y), 0.8, 4.5, t);
    } else {
      out.SS = moveTo(starts.SS, lerp(starts.SS, f.point, 0.3), 0.6, 4.5, t);
      out['2B'] = moveTo(starts['2B'], vec(BASES.second.x + 0.8, BASES.second.y), 0.8, 4.5, t);
    }
    return out;
  };

  const frames: Frame[] = [];
  for (let t = 0; t <= tl.duration + 1e-9; t += FRAME_DT) {
    const rg = runnerGAt(runner, t);
    frames.push({
      t,
      ball: ballAt(t),
      runner: geom.pos(rg.g, rg.bulge),
      batter: batterAt(t),
      fielders: fieldersAt(t),
    });
  }
  return frames;
}

/** フレーム列から時刻 t の状態を線形補間で得る */
export function frameAt(frames: Frame[], t: number): Frame {
  if (frames.length === 0) throw new Error('no frames');
  const i = Math.max(0, Math.min(frames.length - 2, Math.floor(t / FRAME_DT)));
  const a = frames[i];
  const b = frames[i + 1] ?? a;
  const k = Math.max(0, Math.min(1, (t - a.t) / FRAME_DT));
  const L = (p: Vec, q: Vec): Vec => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  const fielders = {} as Record<FielderId, Vec>;
  for (const id of Object.keys(a.fielders) as FielderId[]) fielders[id] = L(a.fielders[id], b.fielders[id]);
  return {
    t,
    ball: { ...L(a.ball, b.ball), h: a.ball.h + (b.ball.h - a.ball.h) * k },
    runner: L(a.runner, b.runner),
    batter: L(a.batter, b.batter),
    fielders,
  };
}
