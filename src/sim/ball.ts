// 打球モデル（§4.3）。打球は本塁から一直線に進み、距離 s(t) と高さ h(t) で表す。

import { BALL, FIELD } from './constants';
import { angleOf, dirFromAngle, fenceDistance, len, scale } from './field';
import type { Scenario, Vec } from './types';

type Segment = { t0: number; s0: number; v0: number; a: number; t1: number };

export type BallPath = {
  dir: Vec;
  angleDeg: number;
  /** ゴロは最初のバウンド、ライナー／フライは着地の時刻 */
  landingTime: number;
  /** 空中にいる打球か（ノーバウンド捕球は対象外なので、着地までは捕れない） */
  airborne: boolean;
  /** 止まる（またはフェンスで止まる）時刻と距離 */
  stopTime: number;
  stopDistance: number;
  /** 内野（土）を出る時刻。出ない場合は Infinity */
  leaveInfieldTime: number;
  reachesFence: boolean;
  sAt(t: number): number;
  hAt(t: number): number;
  posAt(t: number): Vec;
};

const segS = (g: Segment, t: number) => {
  const tau = Math.min(t, g.t1) - g.t0;
  return g.s0 + g.v0 * tau + 0.5 * g.a * tau * tau;
};

/** s0 から速さ v0 で転がり始める打球の区間列を作る（フェンスで止める） */
function rollSegments(t0: number, s0: number, v0: number, fence: number): Segment[] {
  const segs: Segment[] = [];
  let t = t0;
  let s = s0;
  let v = v0;
  const R = FIELD.infieldRadius;
  const phases: { a: number; end: number }[] = [];
  if (s < R) phases.push({ a: -BALL.decelInfield, end: R });
  phases.push({ a: -BALL.decelOutfield, end: fence });
  for (const ph of phases) {
    if (v <= 0) break;
    const d = -ph.a; // 減速度（正）
    const stopDist = (v * v) / (2 * d);
    if (s + stopDist <= ph.end) {
      const tStop = v / d;
      segs.push({ t0: t, s0: s, v0: v, a: ph.a, t1: t + tStop });
      t += tStop;
      s += stopDist;
      v = 0;
      break;
    }
    const need = ph.end - s;
    const tau = (v - Math.sqrt(v * v - 2 * d * need)) / d;
    segs.push({ t0: t, s0: s, v0: v, a: ph.a, t1: t + tau });
    t += tau;
    s = ph.end;
    v = v - d * tau;
  }
  // フェンスに届いたら、そこで止まる（跳ね返りは省略）
  segs.push({ t0: t, s0: s, v0: 0, a: 0, t1: Infinity });
  return segs;
}

export function createBallPath(scenario: Scenario): BallPath {
  const bb = scenario.battedBall;
  let dir: Vec;
  let angleDeg: number;
  const segs: Segment[] = [];
  let landingTime: number;
  let airborne: boolean;
  let hAt: (t: number) => number;

  if (bb.type === 'ground') {
    angleDeg = bb.angleDeg;
    dir = dirFromAngle(angleDeg);
    const fence = fenceDistance(angleDeg);
    const v0 = BALL.groundSpeed[bb.strength];
    const tb = BALL.firstBounceDistance / v0;
    segs.push({ t0: 0, s0: 0, v0, a: 0, t1: tb });
    segs.push(...rollSegments(tb, BALL.firstBounceDistance, v0 * BALL.firstBounceFactor, fence));
    landingTime = tb;
    airborne = false;
    const hop = BALL.groundHopHeight;
    hAt = (t) => {
      if (t < tb) return 0.8 + (hop - 0.8) * Math.sin((Math.PI * t) / tb) * 0.5;
      // 2回目以降の小さな弾み（描画用）
      const k = t - tb;
      return k < 0.9 ? 0.6 * Math.abs(Math.sin((Math.PI * k) / 0.45)) * (1 - k / 0.9) : 0;
    };
  } else {
    const landing = bb.landing ?? defaultLanding(bb.angleDeg, bb.type, bb.strength);
    const L = len(landing);
    angleDeg = angleOf(landing);
    dir = scale(landing, 1 / L);
    const fence = fenceDistance(angleDeg);
    const T = landing.hangTime;
    segs.push({ t0: 0, s0: 0, v0: L / T, a: 0, t1: T });
    segs.push(...rollSegments(T, L, (L / T) * BALL.landingRollFactor, fence));
    landingTime = T;
    airborne = true;
    const g = 9.8;
    hAt = (t) => {
      if (t >= T) return 0;
      // 打点 1m から着地まで放物線
      const v0z = (g * T) / 2 - 1 / T;
      return Math.max(0, 1 + v0z * t - 0.5 * g * t * t);
    };
  }

  const sAt = (t: number): number => {
    if (t <= 0) return 0;
    for (const g of segs) if (t < g.t1) return segS(g, t);
    const last = segs[segs.length - 1];
    return segS(last, t);
  };
  const stopSeg = segs[segs.length - 1];
  const stopDistance = stopSeg.s0;
  const R = FIELD.infieldRadius;
  let leaveInfieldTime = Infinity;
  for (const g of segs) {
    if (g.s0 >= R) {
      leaveInfieldTime = Math.min(leaveInfieldTime, g.t0);
      break;
    }
  }
  if (bb.type !== 'ground' && landingTime > 0) leaveInfieldTime = (R / segs[0].v0) || 0;

  return {
    dir,
    angleDeg,
    landingTime,
    airborne,
    stopTime: stopSeg.t0,
    stopDistance,
    leaveInfieldTime,
    reachesFence: stopDistance >= fenceDistance(angleDeg) - 0.01,
    sAt,
    hAt,
    posAt: (t) => scale(dir, sAt(t)),
  };
}

/** landing 未指定のライナー／フライの既定値 */
export function defaultLanding(
  angleDeg: number,
  type: 'liner' | 'fly_drop' | 'over',
  strength: Scenario['battedBall']['strength'],
): { x: number; y: number; hangTime: number } {
  const base = { liner: 44, fly_drop: 40, over: 62 }[type];
  const add = { weak: -4, normal: 0, hard: 5 }[strength];
  const hang = { liner: 1.5, fly_drop: 2.4, over: 2.9 }[type];
  const d = base + add;
  const dir = dirFromAngle(angleDeg);
  return { x: dir.x * d, y: dir.y * d, hangTime: hang + (strength === 'weak' ? 0.15 : 0) };
}
