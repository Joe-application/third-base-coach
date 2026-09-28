// 1プレーで使う乱数をまとめて先に引いておく。
// こうすると「判断の時点ですでに決まっていること」だけを固定し、
// 残りを引き直すモンテカルロ（§5.1）が簡単に書ける。

import { FIELDER } from './constants';
import { createRng } from './rng';

export type Draws = {
  /** 外野手の反応時間（秒） */
  fielderReaction: number;
  /** ファンブル判定用 [0,1) と、起きたときの追加時間 */
  fumbleU: number;
  fumbleExtraU: number;
  /** 持ち替え時間の範囲内のどこか [0,1) */
  holdU: number;
  /** 送球の速さ・ズレ（標準正規） */
  throwSpeedZ: number;
  throwDevZ: number;
  catcherU: number;
  /** 中継 */
  relayHoldU: number;
  relayErrorU: number;
  relayErrorExtraU: number;
  relaySpeedZ: number;
  /** 本塁のタッチ判定 [0,1) */
  tagU: number;
  /** 帰塁時の三塁のタッチ判定 [0,1) */
  thirdTagU: number;
  /** 打者走者への三塁送球：速さ・ズレ・捕球ミス・タッチ */
  b3SpeedZ: number;
  b3DevZ: number;
  b3CatchU: number;
  b3TagU: number;
};

export function drawsFromSeed(seed: number): Draws {
  const r = createRng(seed);
  return {
    fielderReaction: r.uniform(FIELDER.reactionMin, FIELDER.reactionMax),
    fumbleU: r.next(),
    fumbleExtraU: r.next(),
    holdU: r.next(),
    throwSpeedZ: r.normal(),
    throwDevZ: r.normal(),
    catcherU: r.next(),
    relayHoldU: r.next(),
    relayErrorU: r.next(),
    relayErrorExtraU: r.next(),
    relaySpeedZ: r.normal(),
    tagU: r.next(),
    thirdTagU: r.next(),
    // 後から足した値は最後に引く（前の値の並びを変えない）
    b3SpeedZ: r.normal(),
    b3DevZ: r.normal(),
    b3CatchU: r.next(),
    b3TagU: r.next(),
  };
}

/** 判断時点で確定している事象 */
export type KnownFacts = {
  /** 外野手が動き出した（反応時間が確定） */
  reaction: boolean;
  /** 捕球した（ファンブルの有無が確定） */
  caught: boolean;
  /** 送球した（持ち替え時間が確定） */
  released: boolean;
};

/** 確定している事象は actual の値、それ以外は fresh の値を使う */
export function mixDraws(actual: Draws, fresh: Draws, known: KnownFacts): Draws {
  return {
    ...fresh,
    fielderReaction: known.reaction ? actual.fielderReaction : fresh.fielderReaction,
    fumbleU: known.caught ? actual.fumbleU : fresh.fumbleU,
    fumbleExtraU: known.caught ? actual.fumbleExtraU : fresh.fumbleExtraU,
    holdU: known.released ? actual.holdU : fresh.holdU,
  };
}
