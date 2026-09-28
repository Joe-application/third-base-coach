// 走者モデル（§4.5）。二塁走者の進み具合 g を時間刻みで計算する。
// 走者の動きはコーチャーの合図（commands）だけで決まり、守備には依存しない。

import { RUNNER, SIM_DT, SIM_MAX_TIME } from './constants';
import { G_HOME, G_THIRD } from './field';
import type { Command, Scenario } from './types';

type Mode = 'run' | 'send' | 'brake' | 'hesitate' | 'overrunStop' | 'retreat' | 'stopped' | 'home';

export type RunnerTrace = {
  dt: number;
  /** 各ステップの g（record=true のときだけ） */
  g: number[];
  /** 各ステップのふくらみ（0 or 1） */
  bulge: number[];
  tStart: number;
  /** 判断ウィンドウの開始（三塁の手前 12m） */
  tWindowStart: number | null;
  /** 三塁ベースに最初に届いた時刻 */
  tThird: number | null;
  tHome: number | null;
  hesitated: boolean;
  tHesitate: number | null;
  autoStopped: boolean;
  /** 実際に受け付けた合図 */
  accepted: Command[];
  /** 最後に有効になった判断 */
  finalDecision: 'send' | 'stop' | null;
  /** 帰塁が必要になったとき */
  retreat: null | { tStart: number; tBack: number; overrun: number };
  /** スライディングの合図が間に合ったか */
  slideCalled: boolean;
  /** 最高速 */
  topSpeed: number;
};

export function runnerStartTime(sc: Scenario): number {
  if (sc.outs === 2) return RUNNER.reaction;
  if (sc.battedBall.type === 'ground') return RUNNER.reaction + RUNNER.groundWaitExtra;
  return RUNNER.reaction;
}

export function simulateRunner(
  sc: Scenario,
  commands: Command[],
  landingTime: number,
  record = true,
): RunnerTrace {
  const top = RUNNER.topSpeed[sc.runnerSpeed];
  const dt = SIM_DT;
  const tStart = runnerStartTime(sc);
  const halfwayUntil =
    sc.outs < 2 && sc.battedBall.type !== 'ground' ? landingTime + RUNNER.halfwayReaction : 0;
  const zone0 = G_THIRD - RUNNER.turnZoneBefore;
  const zone1 = G_THIRD + RUNNER.turnZoneAfter;
  const zoneLen = zone1 - zone0;
  const pathFactor = zoneLen / (zoneLen + RUNNER.turnExtraPath);
  const gWindow = G_THIRD - RUNNER.windowDistance;
  const cmds = [...commands].sort((a, b) => a.t - b.t);

  const tr: RunnerTrace = {
    dt,
    g: [],
    bulge: [],
    tStart,
    tWindowStart: null,
    tThird: null,
    tHome: null,
    hesitated: false,
    tHesitate: null,
    autoStopped: false,
    accepted: [],
    finalDecision: null,
    retreat: null,
    slideCalled: false,
    topSpeed: top,
  };

  let mode = 'run' as Mode;
  let g = 0;
  let v = 0;
  let rounding = false;
  let ci = 0;
  let retreatStart = 0;
  let retreatOverrun = 0;

  const approach = (target: number) => {
    if (v < target) v = Math.min(target, v + RUNNER.accel * dt);
    else if (v > target) v = Math.max(target, v - RUNNER.brakeDecel * dt);
  };
  const baseTarget = (t: number) => (t < tStart ? 0 : t < halfwayUntil ? top * RUNNER.halfwayFactor : top);

  const handle = (c: Command) => {
    if (c.kind === 'send') {
      const ok = mode === 'run' || mode === 'hesitate' || (mode === 'brake' && g < G_THIRD);
      if (!ok) return;
      mode = 'send';
      rounding = g < zone1;
      tr.finalDecision = 'send';
      tr.accepted.push(c);
    } else if (c.kind === 'stop') {
      if (mode === 'run' || (mode === 'send' && g < G_THIRD)) mode = 'brake';
      else if (mode === 'hesitate' || (mode === 'send' && g <= G_THIRD + RUNNER.changeMindLimit))
        mode = 'overrunStop';
      else return;
      tr.finalDecision = 'stop';
      tr.accepted.push(c);
    } else if (c.kind === 'slide') {
      if (mode === 'send' && g < G_HOME - RUNNER.slideDeadline && !tr.slideCalled) {
        tr.slideCalled = true;
        tr.accepted.push(c);
      }
    }
  };

  const afterStop = (t: number) => {
    const overrun = g - G_THIRD;
    if (overrun >= RUNNER.retreatThreshold) {
      mode = 'retreat';
      retreatStart = t;
      retreatOverrun = overrun;
    } else {
      mode = 'stopped';
    }
  };

  let t = 0;
  for (let step = 0; t <= SIM_MAX_TIME; step++, t = step * dt) {
    while (ci < cmds.length && cmds[ci].t <= t + 1e-9) handle(cmds[ci++]);

    switch (mode) {
      case 'run': {
        approach(baseTarget(t));
        g += v * dt;
        if (g >= G_THIRD) {
          // 判断がないまま三塁に着いた → 迷い
          mode = 'hesitate';
          tr.hesitated = true;
          tr.tHesitate = t;
          v = Math.min(v, top * RUNNER.hesitateFactor);
        }
        break;
      }
      case 'send': {
        let target = baseTarget(t);
        let pf = 1;
        if (rounding && g >= zone0 && g < zone1) {
          target = Math.min(target, top * RUNNER.turnSpeedFactor);
          pf = pathFactor;
        }
        approach(target);
        g += v * pf * dt;
        if (g >= G_HOME) {
          tr.tHome = t - (g - G_HOME) / Math.max(0.1, v * pf);
          g = G_HOME;
          mode = 'home';
        }
        break;
      }
      case 'brake': {
        const rem = G_THIRD + RUNNER.stopTargetOverrun - g;
        if (t >= tStart && (v * v) / (2 * RUNNER.brakeDecel) >= rem) v = Math.max(0, v - RUNNER.brakeDecel * dt);
        else approach(baseTarget(t));
        g += v * dt;
        if (v === 0 && g >= G_THIRD - 0.05) afterStop(t);
        break;
      }
      case 'hesitate': {
        g += v * dt;
        if (tr.tHesitate !== null && t - tr.tHesitate >= RUNNER.hesitateDuration) {
          mode = 'overrunStop';
          tr.autoStopped = true;
          tr.finalDecision = 'stop';
        }
        break;
      }
      case 'overrunStop': {
        v = Math.max(0, v - RUNNER.brakeDecel * dt);
        g += v * dt;
        if (v === 0) afterStop(t);
        break;
      }
      case 'retreat': {
        const target = top * RUNNER.retreatSpeedFactor;
        v = Math.min(target, v + RUNNER.accel * dt);
        g -= v * dt;
        if (g <= G_THIRD) {
          g = G_THIRD;
          v = 0;
          tr.retreat = { tStart: retreatStart, tBack: t, overrun: retreatOverrun };
          mode = 'stopped';
        }
        break;
      }
      case 'stopped': {
        v = 0;
        if (g > G_THIRD) g = Math.max(G_THIRD, g - RUNNER.walkBackSpeed * dt);
        break;
      }
      case 'home':
        break;
    }

    if (tr.tWindowStart === null && g >= gWindow) tr.tWindowStart = t;
    if (tr.tThird === null && g >= G_THIRD) tr.tThird = t;
    if (record) {
      tr.g.push(g);
      tr.bulge.push(rounding ? 1 : 0);
    }
    if (mode === 'home') break;
    if (mode === 'stopped' && g <= G_THIRD) break;
  }
  return tr;
}

/** 記録した g を時刻 t で読む（範囲外は端の値） */
export function runnerGAt(tr: RunnerTrace, t: number): { g: number; bulge: number } {
  const n = tr.g.length;
  if (n === 0) return { g: 0, bulge: 0 };
  const i = Math.min(n - 1, Math.max(0, Math.round(t / tr.dt)));
  return { g: tr.g[i], bulge: tr.bulge[i] };
}
