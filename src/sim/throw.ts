// 送球モデル（§4.6）

import { ARM, THROW } from './constants';
import type { Draws } from './draws';
import { dist, lerp } from './field';
import type { Arm, FielderId, Vec } from './types';

/** 距離 d の送球の実効速度（中継が必要な距離なら null） */
export function effectiveSpeed(d: number, arm: Arm): number | null {
  const { vLine, dMax } = ARM[arm];
  const half = dMax / 2;
  if (d <= half) return vLine;
  if (d <= dMax) return vLine * (1 - (1 - THROW.farSpeedFactor) * ((d - half) / half));
  return null;
}

export function needsRelay(d: number, arm: Arm): boolean {
  return d > ARM[arm].dMax;
}

export function isBounceThrow(d: number, arm: Arm): boolean {
  return d > ARM[arm].dMax * THROW.bounceRatio;
}

export type ThrowLeg = {
  thrower: FielderId;
  from: Vec;
  to: Vec;
  tStart: number;
  tEnd: number;
  distance: number;
  bounce: boolean;
};

export type ThrowPlan = {
  legs: ThrowLeg[];
  relay: null | { by: 'SS' | '2B'; point: Vec; hold: number; error: boolean };
  /** 外野手の位置から本塁までの直線距離 */
  distance: number;
  tRelease: number;
  /** 本塁（捕手）に届く時刻 */
  tArriveHome: number;
  /** 本塁上の左右ズレ（m、+ が一塁側） */
  dev: number;
  /** ズレ > 4m：捕れない */
  wild: boolean;
  /** ズレ > 2m：捕手が動いて捕る */
  catcherMoved: boolean;
  /** 捕手の捕球ミス */
  catcherDrop: boolean;
  /** 最後の送球がワンバウンド */
  bounce: boolean;
};

const HOME: Vec = { x: 0, y: 0 };

const jitter = (v: number, z: number) => v * Math.max(0.75, 1 + THROW.speedJitterSd * z);

export function planThrow(
  thrower: FielderId,
  from: Vec,
  arm: Arm,
  tRelease: number,
  draws: Draws,
): ThrowPlan {
  const d = dist(from, HOME);
  const legs: ThrowLeg[] = [];
  let relay: ThrowPlan['relay'] = null;
  let lastDistance: number;
  let lastArm: Arm;
  let t = tRelease;

  if (!needsRelay(d, arm)) {
    const v = jitter(effectiveSpeed(d, arm)!, draws.throwSpeedZ);
    lastDistance = d;
    lastArm = arm;
    legs.push({ thrower, from, to: HOME, tStart: t, tEnd: t + d / v, distance: d, bounce: isBounceThrow(d, arm) });
    t += d / v;
  } else {
    const by = from.x <= 1 ? 'SS' : '2B';
    const point = lerp(from, HOME, 0.5);
    const d1 = d / 2;
    const v1 = jitter(effectiveSpeed(d1, arm) ?? ARM[arm].vLine * THROW.farSpeedFactor, draws.throwSpeedZ);
    legs.push({ thrower, from, to: point, tStart: t, tEnd: t + d1 / v1, distance: d1, bounce: isBounceThrow(d1, arm) });
    t += d1 / v1;
    const [h0, h1] = THROW.relayHold;
    let hold = h0 + (h1 - h0) * draws.relayHoldU;
    const error = draws.relayErrorU < THROW.relayErrorProb;
    if (error) {
      const [e0, e1] = THROW.relayErrorExtra;
      hold += e0 + (e1 - e0) * draws.relayErrorExtraU;
    }
    relay = { by, point, hold, error };
    t += hold;
    const d2 = d - d1;
    lastArm = THROW.relayArm;
    lastDistance = d2;
    const v2 = jitter(effectiveSpeed(d2, lastArm) ?? ARM[lastArm].vLine * THROW.farSpeedFactor, draws.relaySpeedZ);
    legs.push({ thrower: by, from: point, to: HOME, tStart: t, tEnd: t + d2 / v2, distance: d2, bounce: isBounceThrow(d2, lastArm) });
    t += d2 / v2;
  }

  const sigma = THROW.sigmaPerMeter * lastDistance * ARM[lastArm].sigmaFactor;
  const dev = sigma * draws.throwDevZ;
  const absDev = Math.abs(dev);
  const wild = absDev > THROW.missDev;
  const bounce = legs[legs.length - 1].bounce;
  const dropProb = bounce ? THROW.catcherDropProbBounce : THROW.catcherDropProb;
  const catcherDrop = !wild && draws.catcherU < dropProb;
  // 最後の送球の到達点をズレの分だけ左右にずらす（描画用）
  const last = legs[legs.length - 1];
  last.to = { x: Math.max(-6, Math.min(6, dev)), y: 0 };

  return {
    legs,
    relay,
    distance: d,
    tRelease,
    tArriveHome: t,
    dev,
    wild,
    catcherMoved: !wild && absDev > THROW.catcherMoveDev,
    catcherDrop,
    bounce,
  };
}
