// 外野手モデル（§4.4）

import type { BallPath } from './ball';
import { FIELDER } from './constants';
import { angleBetweenDeg, dist, fielderStart, lerp, sub } from './field';
import type { CatchType, Depth, OutfielderId, Scenario, Vec } from './types';

/** 反応してから t 秒後までに走れる距離（0.5 秒で最高速になる等加速度） */
export function runDistance(t: number, reaction: number, speed = FIELDER.maxSpeed): number {
  const tau = t - reaction;
  if (tau <= 0) return 0;
  const ta = FIELDER.accelTime;
  if (tau < ta) return (speed * tau * tau) / (2 * ta);
  return speed * (tau - ta / 2);
}

/** 走る距離 d に必要な時間（runDistance の逆関数） */
export function timeToRun(d: number, reaction: number, speed = FIELDER.maxSpeed): number {
  const ta = FIELDER.accelTime;
  const dA = (speed * ta) / 2;
  if (d <= dA) return reaction + Math.sqrt((2 * ta * d) / speed);
  return reaction + ta / 2 + d / speed;
}

export type CatchPlan = {
  fielder: OutfielderId;
  start: Vec;
  point: Vec;
  tCatch: number;
  catchType: CatchType;
  /** 移動方向と本塁方向のなす角（度） */
  angleDeg: number;
};

export function classifyCatch(start: Vec, point: Vec): { catchType: CatchType; angleDeg: number } {
  const move = sub(point, start);
  if (Math.hypot(move.x, move.y) < FIELDER.minMoveForAngle) return { catchType: 'forward', angleDeg: 0 };
  const toHome = sub({ x: 0, y: 0 }, start);
  const a = angleBetweenDeg(move, toHome);
  const catchType: CatchType = a < FIELDER.forwardMaxDeg ? 'forward' : a <= FIELDER.sideMaxDeg ? 'side' : 'back';
  return { catchType, angleDeg: a };
}

const OUTFIELDERS: OutfielderId[] = ['LF', 'CF', 'RF'];

/** いちばん早くボールに届く外野手と、その捕球点を求める */
export function findCatch(ball: BallPath, depth: Depth, reaction: number): CatchPlan {
  let best: CatchPlan | null = null;
  const step = FIELDER.searchStep;
  const tMin = ball.airborne ? ball.landingTime + 0.05 : 0;
  const tEnd = ball.stopTime + 30;
  for (const id of OUTFIELDERS) {
    const start = fielderStart(id, depth);
    for (let t = Math.ceil(tMin / step) * step; t < tEnd; t += step) {
      if (best && t >= best.tCatch) break;
      const b = ball.posAt(t);
      if (dist(b, start) <= runDistance(t, reaction) + FIELDER.reach) {
        const { catchType, angleDeg } = classifyCatch(start, b);
        best = { fielder: id, start, point: b, tCatch: t, catchType, angleDeg };
        break;
      }
    }
  }
  if (!best) throw new Error('no fielder can reach the ball');
  return best;
}

/** 捕球する外野手の t 秒での位置（捕球点に向かってまっすぐ走る） */
export function chaserPosition(plan: CatchPlan, reaction: number, t: number): Vec {
  // 捕球点ではなく「グラブが届く位置」まで走る
  const total = Math.max(0, dist(plan.start, plan.point) - FIELDER.reach * 0.6);
  if (total === 0) return plan.start;
  const d = Math.min(total, runDistance(t, reaction));
  return lerp(plan.start, plan.point, d / dist(plan.start, plan.point));
}

export function holdTime(catchType: CatchType, u: number): number {
  const [a, b] = FIELDER.hold[catchType];
  return a + (b - a) * u;
}

export function fumbleProbability(scenario: Scenario): number {
  const bb = scenario.battedBall;
  return bb.type === 'ground' && bb.strength === 'hard' ? FIELDER.fumbleProbHardGround : FIELDER.fumbleProb;
}
