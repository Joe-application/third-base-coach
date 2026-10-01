// 打者走者（長打のとき）：二塁を回って三塁まで行くか。
// 三塁コーチャーは、二塁走者を回したあと、二塁に近づく打者走者にも合図を出す。
//
// 守備の考え方：
// - 二塁走者が本塁で明らかにセーフになりそうなら、中継（または外野手）は本塁ではなく三塁へ投げる
// - そうでなければ本塁へ投げ、本塁のプレーのあとで捕手が三塁へ投げる

import type { BallPath } from './ball';
import { ARM, BATTER, CROSSPLAY, THROW } from './constants';
import type { Draws } from './draws';
import { BASES, dist, leadGeom } from './field';
import type { FieldingPlan } from './play';
import { outProbability } from './probability';
import { simulateBatter, type RunnerTrace } from './runner';
import { effectiveSpeed, type ThrowPlan } from './throw';
import type { Arm, BatterResult, Command, FielderId, Scenario, Vec } from './types';

export type BatterThrow = {
  /** 'cut' = 中継（外野手）が本塁をやめて三塁へ、'catcher' = 本塁のあと捕手が三塁へ */
  via: 'cut' | 'catcher';
  thrower: FielderId;
  from: Vec;
  tStart: number;
  tEnd: number;
  distance: number;
  dev: number;
  wild: boolean;
  drop: boolean;
};

export type BatterPlay = {
  trace: RunnerTrace;
  /** 判断の対象か（長打で、二塁走者を回したとき） */
  eligible: boolean;
  result: BatterResult;
  throw: BatterThrow | null;
  /** 三塁でのタッチプレー */
  third: null | { tRun: number; tBallReady: number; delta: number; outProb: number };
};

/** 長打（打者走者が二塁まで来る打球）か：後ろ向きで追った、フェンスまで転がった、深い所で捕った */
export function isExtraBase(ball: BallPath, fielding: FieldingPlan): boolean {
  return fielding.catchType === 'back' || ball.reachesFence || dist(fielding.point, BASES.home) >= BATTER.deepCatch;
}

const THIRD_BAG: Vec = { x: BASES.third.x + 0.6, y: BASES.third.y + 0.4 };

function throwToThird(
  via: BatterThrow['via'],
  thrower: FielderId,
  from: Vec,
  arm: Arm,
  tStart: number,
  draws: Draws,
): BatterThrow {
  const d = dist(from, THIRD_BAG);
  const base = effectiveSpeed(d, arm) ?? ARM[arm].vLine * THROW.farSpeedFactor;
  const v = base * Math.max(0.75, 1 + THROW.speedJitterSd * draws.b3SpeedZ);
  const dev = BATTER.sigmaPerMeter * d * ARM[arm].sigmaFactor * draws.b3DevZ;
  const wild = Math.abs(dev) > THROW.missDev;
  return {
    via,
    thrower,
    from,
    tStart,
    tEnd: tStart + d / v,
    distance: d,
    dev,
    wild,
    drop: !wild && draws.b3CatchU < BATTER.thirdDropProb,
  };
}

export function planBatter(
  sc: Scenario,
  fielding: FieldingPlan,
  throwPlan: ThrowPlan,
  lead: RunnerTrace,
  commands: Command[],
  draws: Draws,
  record: boolean,
): BatterPlay {
  // 二塁走者を回したときだけ、打者走者への合図を受け付ける。
  // 回していなければ（三塁が詰まっているので）打者走者は二塁で止まる
  // 一塁走者のときは、打者走者は二塁まで（判断なし）
  const eligible = lead.finalDecision === 'send' && !leadGeom(sc).fromFirst;
  const lastLead = lead.accepted.filter((c) => c.kind === 'send' || c.kind === 'stop').at(-1)?.t ?? 0;
  const bcmds: Command[] = eligible
    ? commands.filter((c) => (c.kind === 'bsend' || c.kind === 'bstop') && c.t >= lastLead)
    : [{ t: 0, kind: 'bstop' }];
  const trace = simulateBatter(sc, bcmds, record);

  /** 時刻 t に打者走者が三塁へ向かっているか */
  const goingAt = (t: number) => {
    const last = trace.accepted.filter((c) => c.t <= t).at(-1);
    return last?.kind === 'bsend';
  };
  const goes = trace.finalDecision === 'send' && trace.tHome !== null;

  // 守備が投げ先を決める瞬間：中継なら中継の送球時、なければ外野手の送球時
  const relayLeg = throwPlan.relay ? throwPlan.legs[1] : null;
  const tDecide = relayLeg ? relayLeg.tStart : fielding.tRelease;
  const leadScores = lead.tHome !== null && lead.tHome < throwPlan.tArriveHome - BATTER.cutMargin;

  let bThrow: BatterThrow | null = null;
  if (goes && leadScores && goingAt(tDecide)) {
    bThrow = relayLeg
      ? throwToThird('cut', throwPlan.relay!.by, relayLeg.from, THROW.relayArm, tDecide, draws)
      : throwToThird('cut', fielding.fielder, fielding.point, sc.outfieldArm[fielding.fielder], tDecide, draws);
  } else if (goes && !throwPlan.wild) {
    // 本塁のプレー（またはボールを受けたあと）で、捕手が三塁へ
    let tHas = throwPlan.tArriveHome + (throwPlan.catcherMoved ? THROW.catcherMoveTime : 0);
    if (throwPlan.catcherDrop) tHas += 1.5;
    if (lead.tHome !== null) tHas = Math.max(tHas, lead.tHome + CROSSPLAY.tagTime * 0.5);
    const tStart = tHas + THROW.thirdThrowHold;
    if (trace.tHome! > tStart) {
      bThrow = throwToThird('catcher', 'C', { x: 0, y: -0.6 }, 'normal', tStart, draws);
      // 捕手の三塁送球は速さが決まっている
      bThrow.tEnd = tStart + dist(BASES.home, BASES.third) / THROW.thirdThrowSpeed;
    }
  }

  let result: BatterResult = goes ? 'third' : 'second';
  let third: BatterPlay['third'] = null;
  if (goes && bThrow && !bThrow.wild && !bThrow.drop) {
    const moved = Math.abs(bThrow.dev) > THROW.catcherMoveDev ? THROW.catcherMoveTime : 0;
    const tBallReady = bThrow.tEnd + moved + CROSSPLAY.tagTime;
    const delta = trace.tHome! - tBallReady;
    const outProb = outProbability(delta);
    third = { tRun: trace.tHome!, tBallReady, delta, outProb };
    if (draws.b3TagU < outProb) result = 'out_third';
  }
  return { trace, eligible, result, throw: bThrow, third };
}
