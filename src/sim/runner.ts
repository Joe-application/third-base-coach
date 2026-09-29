// 走者モデル（§4.5）。走者の進み具合 g を時間刻みで計算する。
// 走者の動きはコーチャーの合図（commands）だけで決まり、守備には依存しない。
// 二塁走者（三塁で判断 → 本塁）と打者走者（二塁で判断 → 三塁）の両方に使う。

import { BATTER, RUNNER, SIM_DT, SIM_MAX_TIME } from './constants';
import { G_B_FIRST, G_B_SECOND, G_B_THIRD, G_HOME, G_THIRD } from './field';
import type { Command, Scenario } from './types';

type Mode = 'run' | 'send' | 'brake' | 'hesitate' | 'overrunStop' | 'retreat' | 'stopped' | 'home';

export type RunnerTrace = {
  dt: number;
  /** 各ステップの g（record=true のときだけ） */
  g: number[];
  /** 各ステップのふくらみ（0 or 1） */
  bulge: number[];
  tStart: number;
  /** 判断ウィンドウの開始（判断する塁の手前 12m） */
  tWindowStart: number | null;
  /** 判断する塁（二塁走者は三塁、打者走者は二塁）に最初に届いた時刻 */
  tThird: number | null;
  /** 次の塁（二塁走者は本塁、打者走者は三塁）に着いた時刻 */
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

/** 走者ごとの条件 */
export type RunnerSpec = {
  top: number;
  tStart: number;
  /** この時刻までは半分の速さ（ハーフウェイ） */
  halfwayUntil: number;
  /** 判断する塁の g */
  gBase: number;
  /** 次の塁の g */
  gTarget: number;
  /** 判断なしで回る塁の g（打者走者の一塁） */
  autoTurns: number[];
  /** 打った瞬間の位置（二塁走者は二次リードの分だけ前にいる） */
  gStart?: number;
};

export function runnerStartTime(sc: Scenario): number {
  if (sc.outs === 2) return RUNNER.reaction;
  if (sc.battedBall.type === 'ground') return RUNNER.reaction + RUNNER.groundWaitExtra;
  return RUNNER.reaction;
}

/** 二塁走者 */
export function simulateRunner(
  sc: Scenario,
  commands: Command[],
  landingTime: number,
  record = true,
): RunnerTrace {
  return simulateRunnerSpec(
    {
      top: RUNNER.topSpeed[sc.runnerSpeed],
      tStart: runnerStartTime(sc),
      halfwayUntil: sc.outs < 2 && sc.battedBall.type !== 'ground' ? landingTime + RUNNER.halfwayReaction : 0,
      gBase: G_THIRD,
      gTarget: G_HOME,
      autoTurns: [],
      gStart: RUNNER.secondaryLead,
    },
    commands,
    record,
  );
}

/** 打者走者（長打のとき）。合図は bsend / bstop を send / stop として扱う */
export function simulateBatter(sc: Scenario, commands: Command[], record = true): RunnerTrace {
  const mapped: Command[] = [];
  for (const c of commands) {
    if (c.kind === 'bsend') mapped.push({ t: c.t, kind: 'send' });
    else if (c.kind === 'bstop') mapped.push({ t: c.t, kind: 'stop' });
  }
  const tr = simulateRunnerSpec(
    {
      top: BATTER.topSpeed[sc.batterSpeed ?? 'normal'],
      tStart: BATTER.reaction,
      halfwayUntil: 0,
      gBase: G_B_SECOND,
      gTarget: G_B_THIRD,
      autoTurns: [G_B_FIRST],
    },
    mapped,
    record,
  );
  // 受け付けた合図を打者走者用の名前に戻す
  tr.accepted = tr.accepted.map((c) => ({ t: c.t, kind: c.kind === 'send' ? 'bsend' : c.kind === 'stop' ? 'bstop' : c.kind }));
  return tr;
}

export function simulateRunnerSpec(spec: RunnerSpec, commands: Command[], record = true): RunnerTrace {
  const { top, tStart, halfwayUntil } = spec;
  const B = spec.gBase;
  const T = spec.gTarget;
  const dt = SIM_DT;
  const zone0 = B - RUNNER.turnZoneBefore;
  const zone1 = B + RUNNER.turnZoneAfter;
  const zoneLen = zone1 - zone0;
  const pathFactor = zoneLen / (zoneLen + RUNNER.turnExtraPath);
  const gWindow = B - RUNNER.windowDistance;
  /** 判断なしで回る塁のまわりでは、速さを落として膨らむ */
  const autoTurn = (g: number) =>
    spec.autoTurns.some((b) => g >= b - RUNNER.turnZoneBefore && g < b + RUNNER.turnZoneAfter);
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
  let g = spec.gStart ?? 0;
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
      const ok = mode === 'run' || mode === 'hesitate' || (mode === 'brake' && g < B);
      if (!ok) return;
      mode = 'send';
      rounding = g < zone1;
      tr.finalDecision = 'send';
      tr.accepted.push(c);
    } else if (c.kind === 'stop') {
      if (mode === 'run' || (mode === 'send' && g < B)) mode = 'brake';
      else if (mode === 'hesitate' || (mode === 'send' && g <= B + RUNNER.changeMindLimit))
        mode = 'overrunStop';
      else return;
      tr.finalDecision = 'stop';
      tr.accepted.push(c);
    } else if (c.kind === 'slide') {
      if (mode === 'send' && g < T - RUNNER.slideDeadline && !tr.slideCalled) {
        tr.slideCalled = true;
        tr.accepted.push(c);
      }
    }
  };

  const afterStop = (t: number) => {
    const overrun = g - B;
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
        if (autoTurn(g)) {
          approach(Math.min(baseTarget(t), top * RUNNER.turnSpeedFactor));
          g += v * pathFactor * dt;
        } else {
          approach(baseTarget(t));
          g += v * dt;
        }
        if (g >= B) {
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
        if (g >= T) {
          tr.tHome = t - (g - T) / Math.max(0.1, v * pf);
          g = T;
          mode = 'home';
        }
        break;
      }
      case 'brake': {
        const rem = B + RUNNER.stopTargetOverrun - g;
        if (t >= tStart && (v * v) / (2 * RUNNER.brakeDecel) >= rem) v = Math.max(0, v - RUNNER.brakeDecel * dt);
        else approach(baseTarget(t));
        g += v * dt;
        if (v === 0 && g >= B - 0.05) afterStop(t);
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
        if (g <= B) {
          g = B;
          v = 0;
          tr.retreat = { tStart: retreatStart, tBack: t, overrun: retreatOverrun };
          mode = 'stopped';
        }
        break;
      }
      case 'stopped': {
        v = 0;
        if (g > B) g = Math.max(B, g - RUNNER.walkBackSpeed * dt);
        break;
      }
      case 'home':
        break;
    }

    if (tr.tWindowStart === null && g >= gWindow) tr.tWindowStart = t;
    if (tr.tThird === null && g >= B) tr.tThird = t;
    if (record) {
      tr.g.push(g);
      tr.bulge.push(rounding ? 1 : 0);
    }
    if (mode === 'home') break;
    if (mode === 'stopped' && g <= B) break;
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
