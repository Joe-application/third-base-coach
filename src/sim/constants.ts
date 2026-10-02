// シミュレーションの数値パラメータはすべてここに集約する。
// 単位：長さ m、時間 s、速さ m/s、加速度 m/s²。
// 学童軟式（小6）を想定した目安値。仕様書 §4 から変えたものには【調整】と書く。

import type { Arm, OutCount, RunnerSpeed, Strength } from './types';

// ---- グラウンド（§4.1） ----
export const FIELD = {
  /** 塁間 */
  baseDistance: 23,
  /** 両翼フェンスまでの距離 */
  fenceLine: 70,
  /** 中堅フェンスまでの距離 */
  fenceCenter: 80,
  /** 内野（土）と外野（芝）の境界：本塁からの距離 */
  infieldRadius: 35,
};

/** 守備位置の初期値（§4.2）。+x が一塁側、+y がセンター方向 */
export const FIELDER_POSITIONS = {
  P: { x: 0, y: 16 },
  C: { x: 0, y: -1.5 },
  '1B': { x: 13, y: 21 },
  '2B': { x: 7, y: 30 },
  SS: { x: -8, y: 29 },
  '3B': { x: -13, y: 20 },
  LF: { x: -24, y: 48 },
  CF: { x: 0, y: 56 },
  RF: { x: 24, y: 48 },
} as const;

/** 前進守備／後退守備で外野手を本塁方向にずらす量 */
export const OUTFIELD_DEPTH_SHIFT = { shallow: -6, normal: 0, deep: 6 } as const;

// ---- 打球（§4.3） ----
export const BALL = {
  /** ゴロの打球直後の速さ */
  groundSpeed: { weak: 18, normal: 23, hard: 28 } satisfies Record<Strength, number>,
  /** 【調整】最初のバウンドまでの距離。仕様にない値。ここまでは減速しない */
  firstBounceDistance: 6,
  /** 最初のバウンドでの速さの倍率 */
  firstBounceFactor: 0.8,
  /** 転がりの減速度：内野（土） */
  /** 転がりの減速度：内野（土） */
  decelInfield: 3.0,
  /** 転がりの減速度：外野（芝） */
  /** 転がりの減速度：外野（芝） */
  decelOutfield: 4.0,
  /** ライナー／フライの着地後の転がり初速 = 着地前の水平速度 × この値 */
  landingRollFactor: 0.5,
  /** 描画用：ゴロの最初の弾みの高さ */
  groundHopHeight: 1.2,
};

// ---- 外野手（§4.4） ----
export const FIELDER = {
  reactionMin: 0.4,
  reactionMax: 0.6,
  /** 最高速度 */
  maxSpeed: 5.5,
  /** この時間で最高速に達する（等加速度で近似） */
  accelTime: 0.5,
  /** 【調整】グラブが届く範囲。仕様にない値 */
  reach: 1.0,
  /** 捕球点探索の刻み */
  searchStep: 0.05,
  /** 捕り方の判定角度（移動方向と本塁方向のなす角） */
  forwardMaxDeg: 60,
  sideMaxDeg: 120,
  /** 移動がこれ未満なら「正面（前進）」扱い */
  minMoveForAngle: 2,
  /** 【調整】捕球〜送球の持ち替え時間 [min, max]。仕様 0.8〜1.0 / 1.1〜1.4 / 1.5〜2.0。
   *  学童としては送球が早すぎ、「あの日の場面」が 2アウトでもアウトになるため長くした。
   *  （一度、短くしたが、再生を「等速」にしたら違和感がなかったので 2026-10-02 に元へ戻した） */
  hold: {
    forward: [1.5, 2.1],
    side: [1.8, 2.4],
    back: [2.2, 2.9],
  } as Record<'forward' | 'side' | 'back', [number, number]>,
  fumbleProb: 0.08,
  fumbleProbHardGround: 0.12,
  fumbleExtra: [1.0, 2.0] as [number, number],
  /** 描画用：まわりの外野手がカバーに走る速さ */
  backupSpeed: 4.0,
};

// ---- 走者（§4.5） ----
export const RUNNER = {
  topSpeed: { slow: 6.0, normal: 6.6, fast: 7.2 } satisfies Record<RunnerSpeed, number>,
  accel: 3.5,
  /** 二塁からのリード（三塁方向） */
  lead: 3,
  /** 【調整】二次リード：投球と同時に三塁方向へ出ている距離（打った瞬間の位置 = リード + 二次リード）。仕様にない値 */
  secondaryLead: 2,
  /** 【調整】打球への反応（仕様 0.2） */
  reaction: 0.1,
  /** 0・1アウトのゴロ：抜けたのを確認するまでの追加の待ち */
  /** 【調整】仕様 0.5 */
  groundWaitExtra: 0.35,
  /** 0・1アウトのライナー／フライ：落下確認までの速さの倍率（ハーフウェイ） */
  halfwayFactor: 0.5,
  /** 落下を見てから加速し直すまでの反応 */
  halfwayReaction: 0.2,
  /** 回す場合の減速区間：三塁の手前 */
  turnZoneBefore: 5,
  /** 回す場合の減速区間：三塁の後 */
  turnZoneAfter: 2,
  /** 減速区間での速さの倍率 */
  turnSpeedFactor: 0.85,
  /** 膨らみによる経路の延長 */
  turnExtraPath: 1.5,
  /** 減速（止まる・速さを落とす）の減速度 */
  brakeDecel: 5,
  /** 普通に止めたときの停止目標：三塁からのオーバーラン */
  stopTargetOverrun: 0.5,
  /** 迷ったときの速さの倍率と時間（§3.4） */
  hesitateFactor: 0.5,
  hesitateDuration: 0.7,
  /** これ以上オーバーランしてから止まると帰塁が必要（送球でアウトの可能性） */
  retreatThreshold: 4,
  /** 帰塁の速さ = 最高速 × この値 */
  retreatSpeedFactor: 0.6,
  /** オーバーランが小さいときに歩いて戻る速さ */
  walkBackSpeed: 1.5,
  /** 判断ウィンドウ：三塁の手前この距離で始まる */
  windowDistance: 12,
  /** 判断の締め切り：判断する塁の手前この距離までに合図しないと「おそい」で × */
  decisionDeadline: 3,
  /** 早すぎの線：外野手が捕るこの秒数より前（かつ判断ウィンドウより前）に合図すると「はやすぎ」で × */
  earlyMargin: 0.3,
  /** 「回れ」のあとで「止まれ」に変えられるのは三塁を過ぎてこの距離まで */
  changeMindLimit: 8,
  /** スライディングの合図は本塁の手前この距離まで */
  slideDeadline: 8,
  /** 打者走者の最高速（表示のみ） */
  batterTopSpeed: 6.3,
  batterReaction: 0.35,
};

// ---- 打者走者（長打のときの「二塁を回るか」の判断） ----
export const BATTER = {
  /** 打者走者の最高速（打ってすぐなので二塁走者より少し遅め） */
  topSpeed: { slow: 5.8, normal: 6.3, fast: 6.9 } satisfies Record<RunnerSpeed, number>,
  /** 本塁からこれ以上遠くで捕った打球は長打として扱う（m） */
  deepCatch: 60,
  /** 打ってから走り出すまで */
  reaction: 0.35,
  /** 三塁ベースで待つ三塁手が捕りそこねる確率 */
  thirdDropProb: 0.08,
  /** 三塁送球の左右ズレの標準偏差 = この値 × 距離 */
  sigmaPerMeter: 0.05,
  /** 二塁走者がこれだけ先に本塁に着きそうなら、中継は三塁へ投げる（秒） */
  cutMargin: 0.3,
  /** 三塁を狙うべき「三塁セーフ確率」の基準（アウトカウント別）。
   *  「三塁でアウトになるな」の考え方：1アウトの三塁は犠牲フライやゴロでも1点なので価値が大きい。
   *  2アウトは二塁でも三塁でもヒット1本で帰れるので、ほぼ無理をしない */
  thresholds: { 0: 0.7, 1: 0.65, 2: 0.85 } satisfies Record<OutCount, number>,
};

// ---- 送球（§4.6） ----
export const ARM: Record<Arm, { vLine: number; dMax: number; sigmaFactor: number }> = {
  weak: { vLine: 18, dMax: 45, sigmaFactor: 1.2 },
  normal: { vLine: 21, dMax: 55, sigmaFactor: 1.0 },
  strong: { vLine: 24, dMax: 65, sigmaFactor: 0.8 },
};

export const THROW = {
  /** d_max で実効速度が v_line のこの倍率まで落ちる */
  farSpeedFactor: 0.65,
  /** 【調整】送球の速さのばらつき（標準偏差、倍率）。仕様にない値 */
  speedJitterSd: 0.16,
  /** 本塁上の左右ズレの標準偏差 = この値 × 送球距離 */
  sigmaPerMeter: 0.06,
  /** 捕手が動いて捕るズレ */
  catcherMoveDev: 2,
  catcherMoveTime: 0.4,
  /** 捕れない（後逸）ズレ */
  missDev: 4,
  /** 捕手の捕球ミス */
  catcherDropProb: 0.08,
  catcherDropProbBounce: 0.15,
  /** 【調整】距離が d_max のこの割合を超えるとワンバウンド送球とみなす */
  bounceRatio: 0.8,
  /** 中継の持ち替え時間 */
  /** 中継の持ち替え時間 */
  relayHold: [0.8, 1.2] as [number, number],
  /** 中継時の送球ミス（お手玉など）の確率と遅れ */
  relayErrorProb: 0.1,
  relayErrorExtra: [0.5, 1.5] as [number, number],
  /** 中継に入る内野手の肩 */
  relayArm: 'normal' as Arm,
  /** 描画用：送球の最高点 = 距離 × この値 */
  arcPerMeter: 0.06,
  /** 帰塁する走者への三塁送球：捕手の持ち替えと送球の速さ */
  thirdThrowHold: 0.5,
  thirdThrowSpeed: 19,
};

// ---- 本塁のクロスプレー（§4.7） ----
export const CROSSPLAY = {
  /** 捕ってからタッチまで */
  tagTime: 0.4,
  /** これより大きく遅れたらほぼアウト、これより大きく早ければセーフ */
  clearMargin: 0.6,
  clearOutProb: 0.97,
  /** ロジスティック関数の幅 */
  logisticScale: 0.15,
  /** スライディング合図ありのときアウト確率に掛ける値 */
  slideFactor: 0.85,
  /** スライディングが効く範囲：送球到達とランナー到達の差 */
  slideWindow: 0.6,
};

// ---- 評価（§5） ----
export const EVAL = {
  /** 判断時の P_safe を求めるモンテカルロ回数 */
  mcRuns: 500,
  /** 回すべき P_safe の基準（アウトカウント別） */
  thresholds: { 0: 0.75, 1: 0.6, 2: 0.4 } satisfies Record<OutCount, number>,
  /** 採点の境界 */
  sendGreat: 0.15,
  sendOkMin: -0.1,
  stopGreat: -0.15,
  stopOkMax: 0.1,
  points: { great: 100, ok: 60, bad: 0 },
  /** 捕球時刻の前後この秒数以内の判断がベストタイミング */
  bestTimingWindow: 0.5,
  timingBonus: 20,
  hesitatePenalty: -30,
  safeBonus: 20,
  slideBonus: 10,
  /** 打者走者（二塁を回るか）の判断。1プレーの中の2つ目の判断なので、点は半分くらい */
  batterPoints: { great: 50, ok: 30, bad: 0 },
  batterTimingBonus: 10,
  batterHesitatePenalty: -15,
  batterSafeBonus: 10,
};

/** シミュレーションの時間刻み */
export const SIM_DT = 0.01;
/** フレーム記録の間隔 */
export const FRAME_DT = 0.02;
/** シミュレーションの打ち切り時間 */
export const SIM_MAX_TIME = 20;
