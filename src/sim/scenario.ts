// シナリオのプリセットとランダム生成（§7）

import { baselinePSafe, thresholdFor } from './evaluate';
import { dirFromAngle, fenceDistance } from './field';
import { drawsFromSeed } from './draws';
import { simulatePlay } from './play';
import { createRng, hashSeed, type Rng } from './rng';
import type { Arm, BallType, OutCount, Scenario, Strength } from './types';

const allArms = (arm: Arm) => ({ LF: arm, CF: arm, RF: arm });

function landingAt(angleDeg: number, distance: number, hangTime: number) {
  const d = dirFromAngle(angleDeg);
  return { x: d.x * distance, y: d.y * distance, hangTime };
}

const ANOHI_BASE: Omit<Scenario, 'id' | 'outs' | 'name'> = {
  runners: { first: false, second: true, third: false },
  battedBall: { type: 'ground', angleDeg: -18, strength: 'normal' },
  runnerSpeed: 'normal',
  outfieldArm: allArms('normal'),
  outfieldDepth: 'normal',
  seed: 20260601,
};

export const PRESETS: Record<string, Scenario> = {
  anohi: {
    ...ANOHI_BASE,
    id: 'anohi',
    name: 'あの日の場面',
    outs: 2,
  },
  anohi0: {
    ...ANOHI_BASE,
    id: 'anohi0',
    name: 'あの日の場面（0アウト版）',
    outs: 0,
  },
  lfHardShallow: {
    id: 'lfHardShallow',
    name: 'レフト正面の強いゴロ',
    outs: 0,
    runners: { first: false, second: true, third: false },
    battedBall: { type: 'ground', angleDeg: -27, strength: 'hard' },
    runnerSpeed: 'normal',
    outfieldArm: { LF: 'strong', CF: 'normal', RF: 'normal' },
    outfieldDepth: 'shallow',
    seed: 31,
  },
  rcGap: {
    id: 'rcGap',
    name: '右中間を破る打球',
    outs: 2,
    runners: { first: false, second: true, third: false },
    battedBall: { type: 'liner', angleDeg: 13, strength: 'hard', landing: landingAt(13, 50, 1.8) },
    runnerSpeed: 'normal',
    outfieldArm: allArms('normal'),
    outfieldDepth: 'normal',
    seed: 47,
  },
  rcDeep: {
    id: 'rcDeep',
    name: '右中間を深々と破る打球',
    outs: 1,
    runners: { first: false, second: true, third: false },
    battedBall: { type: 'liner', angleDeg: 16, strength: 'hard', landing: landingAt(16, 58, 1.9) },
    runnerSpeed: 'normal',
    batterSpeed: 'fast',
    outfieldArm: allArms('normal'),
    outfieldDepth: 'normal',
    seed: 71,
  },
  cfWeak: {
    id: 'cfWeak',
    name: 'センター前の弱いゴロ',
    outs: 1,
    runners: { first: false, second: true, third: false },
    battedBall: { type: 'ground', angleDeg: 0, strength: 'weak' },
    runnerSpeed: 'normal',
    outfieldArm: allArms('normal'),
    outfieldDepth: 'normal',
    seed: 59,
  },
};

export const PRESET_ORDER = ['anohi', 'anohi0', 'lfHardShallow', 'rcGap', 'rcDeep', 'cfWeak'] as const;

// ---- ランダム生成 ----

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

/** 打球の方向（単打の練習用）。0° = センター、負 = レフト側 */
export type Direction = 'leftLine' | 'left' | 'leftCenter' | 'center' | 'rightCenter' | 'right' | 'rightLine';

export const DIRECTIONS: Direction[] = ['leftLine', 'left', 'leftCenter', 'center', 'rightCenter', 'right', 'rightLine'];

/** 方向ごとの角度の範囲と、出しやすい打球 */
const DIRECTION_SPEC: Record<Direction, { range: [number, number]; types: BallType[] }> = {
  leftLine: { range: [-42, -36], types: ['ground'] },
  left: { range: [-30, -22], types: ['ground', 'ground', 'liner'] },
  leftCenter: { range: [-17, -11], types: ['liner', 'fly_drop'] },
  center: { range: [-5, 5], types: ['ground', 'ground', 'liner'] },
  rightCenter: { range: [11, 17], types: ['liner', 'fly_drop'] },
  right: { range: [22, 30], types: ['ground', 'ground', 'liner'] },
  rightLine: { range: [36, 42], types: ['ground'] },
};

export type GenerateOptions = {
  outs?: OutCount;
  /** 足・肩の種類を増やし、ライナー・フライも多めに出す */
  variety?: boolean;
  /** 外野の間を抜ける・頭を越える長打（打者走者の判断も出る） */
  longHit?: boolean;
  /** 外野手の前に落ちる単打を、この方向に */
  direction?: Direction;
  /** ランナー一塁（長打で一塁走者を三塁で止めるか、本塁へ回すか） */
  runnerOnFirst?: boolean;
};

const ARMS: Arm[] = ['weak', 'normal', 'normal', 'strong'];

/** 外野へのヒットを1つ作る（内野で捕られる打球は作らない） */
export function randomScenario(rng: Rng, opts: GenerateOptions = {}): Scenario {
  const outs: OutCount = opts.outs ?? (rng.int(0, 2) as OutCount);
  const long = opts.longHit || opts.runnerOnFirst;
  const r = rng.next();
  const dir = opts.direction ? DIRECTION_SPEC[opts.direction] : null;
  const type: BallType = long
    ? r < 0.6 ? 'liner' : 'over'
    : dir
      ? rng.pick(dir.types)
      : opts.variety
        ? r < 0.5 ? 'ground' : r < 0.75 ? 'liner' : r < 0.9 ? 'fly_drop' : 'over'
        : r < 0.7 ? 'ground' : r < 0.9 ? 'liner' : 'fly_drop';
  const strength: Strength = rng.pick(['weak', 'normal', 'normal', 'hard'] as const);
  let angleDeg: number;
  if (dir) {
    angleDeg = rng.uniform(dir.range[0], dir.range[1]);
  } else if (type === 'ground') {
    // 内野手の間を抜ける方向：三遊間、二遊間（センター前）、一二塁間
    const lanes: [number, number][] = [
      [-33, -16],
      [-6, 6],
      [16, 33],
    ];
    const [a, b] = rng.pick(lanes);
    angleDeg = rng.uniform(a, b);
  } else {
    angleDeg = rng.uniform(-38, 38);
  }
  const depth = rng.pick(['shallow', 'normal', 'normal', 'deep'] as const);
  let landing: Scenario['battedBall']['landing'];
  if (long) {
    // 左中間・右中間を抜ける、または外野手の頭を越える
    angleDeg = rng.pick([-1, 1] as const) * rng.uniform(8, 20);
    const fence = fenceDistance(angleDeg);
    const dist = type === 'liner' ? rng.uniform(49, 58) : rng.uniform(60, fence - 6);
    const hang = type === 'liner' ? rng.uniform(1.7, 2.1) : rng.uniform(2.7, 3.3);
    landing = landingAt(angleDeg, dist, hang);
  } else if (dir && type !== 'ground') {
    // 外野手の前に落ちる
    const dist = type === 'liner' ? rng.uniform(34, 44) : rng.uniform(32, 42);
    const hang = type === 'liner' ? rng.uniform(1.3, 1.8) : rng.uniform(2.2, 2.8);
    landing = landingAt(angleDeg, dist, hang);
  } else if (type !== 'ground') {
    const fence = fenceDistance(angleDeg);
    const dist =
      type === 'liner' ? rng.uniform(36, 50) : type === 'fly_drop' ? rng.uniform(34, 44) : rng.uniform(58, fence - 6);
    const hang =
      type === 'liner' ? rng.uniform(1.3, 1.9) : type === 'fly_drop' ? rng.uniform(2.2, 2.8) : rng.uniform(2.6, 3.3);
    landing = landingAt(angleDeg, dist, hang);
  }
  const sc: Scenario = {
    id: `r${(rng.next() * 1e9) >>> 0}`,
    outs,
    runners: opts.runnerOnFirst ? { first: true, second: false, third: false } : { first: false, second: true, third: false },
    battedBall: { type, angleDeg: Math.round(angleDeg * 10) / 10, strength, landing },
    runnerSpeed: rng.pick(['slow', 'normal', 'normal', 'fast'] as const),
    outfieldArm: { LF: rng.pick(ARMS), CF: rng.pick(ARMS), RF: rng.pick(ARMS) },
    outfieldDepth: depth,
    seed: (rng.next() * 4294967296) >>> 0,
  };
  sc.batterSpeed = rng.pick(['slow', 'normal', 'normal', 'fast'] as const);
  return sc;
}

/** 長打（打者走者が二塁まで来る打球）か */
export function isLongHit(sc: Scenario): boolean {
  return simulatePlay(sc, [{ t: 0, kind: 'send' }], drawsFromSeed(sc.seed), { frames: false }).batter !== null;
}

/** 打者走者の判断が出る長打か（外野手の捕り方で決まるので、1回シミュレーションして確かめる） */
export function hasBatterDecision(sc: Scenario): boolean {
  return simulatePlay(sc, [{ t: 0, kind: 'send' }], drawsFromSeed(sc.seed), { frames: false }).batter?.eligible === true;
}

export type RatedScenario = { scenario: Scenario; pSafe: number; threshold: number; answer: 'send' | 'stop' };

/** 難易度ごとに、基準からどれだけ離れた問題を出すか */
export function acceptsGap(difficulty: Difficulty, gap: number): boolean {
  const a = Math.abs(gap);
  switch (difficulty) {
    case 'easy':
      return a >= 0.2;
    case 'normal':
      return a >= 0.15;
    case 'hard':
      return a >= 0.08;
    case 'expert':
      return a >= 0.03;
  }
}

export type Want = {
  outs?: OutCount;
  answer?: 'send' | 'stop';
  variety?: boolean;
  longHit?: boolean;
  direction?: Direction;
  runnerOnFirst?: boolean;
};

/** 条件に合う問題を1つ作る（P_safe を見て選別） */
export function generateRated(seed: number, difficulty: Difficulty, want: Want = {}, mcRuns = 200): RatedScenario {
  const rng = createRng(seed);
  let fallback: RatedScenario | null = null;
  for (let i = 0; i < 80; i++) {
    const sc = randomScenario(rng, want);
    if (want.longHit && !hasBatterDecision(sc)) continue;
    // 単打の練習は、外野の間を抜けない打球だけ
    if (want.direction && isLongHit(sc)) continue;
    // 一塁走者は、三塁まで来る長打だけ
    if (want.runnerOnFirst && !isLongHit(sc)) continue;
    const pSafe = baselinePSafe(sc, mcRuns, hashSeed(seed, i));
    const threshold = thresholdFor(sc);
    const gap = pSafe - threshold;
    const answer = gap >= 0 ? 'send' : 'stop';
    const rated = { scenario: sc, pSafe, threshold, answer } as RatedScenario;
    if (want.answer && want.answer !== answer) continue;
    fallback ??= rated;
    if (acceptsGap(difficulty, gap)) return rated;
  }
  return fallback ?? rateScenario(randomScenario(rng, want));
}

export function rateScenario(sc: Scenario, mcRuns = 400): RatedScenario {
  const pSafe = baselinePSafe(sc, mcRuns);
  const threshold = thresholdFor(sc);
  return { scenario: sc, pSafe, threshold, answer: pSafe >= threshold ? 'send' : 'stop' };
}

/**
 * チャレンジ10問。中心は「三塁で止めるか、本塁へ回すか」の練習。
 * - 外野手の前に落ちる単打 7問（レフト線・レフト前・左中間前・センター前・右中間前・ライト前・ライト線 を1問ずつ）
 * - ランナー一塁の長打 2問（一塁走者を三塁で止めるか、本塁へ回すか）
 * - 外野の間を抜ける長打 1問（打者走者の判断も出る）
 * 0/1/2アウトと、回す／止めるの正解がばらけるようにする
 */
export function generateChallenge(seed: number, difficulty: Difficulty, count = 10, variety = false): RatedScenario[] {
  const rng = createRng(seed);
  const plan: Want[] = [];
  DIRECTIONS.forEach((direction, i) => plan.push({ direction, answer: i % 2 === 0 ? 'send' : 'stop' }));
  plan.push({ runnerOnFirst: true }, { runnerOnFirst: true }, { longHit: true, answer: 'send' });
  while (plan.length > count) plan.splice(rng.int(0, DIRECTIONS.length - 1), 1);
  // 並びをシャッフルしてから、アウトカウントを順に割り当てる
  for (let i = plan.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  const outsStart = rng.int(0, 2);
  return plan.map((p, i) =>
    generateRated(hashSeed(seed, i, 77), difficulty, { ...p, outs: ((outsStart + i) % 3) as OutCount, variety }),
  );
}

/** アウトカウント比較：同じ打球を 0/1/2 アウトで */
export function withOuts(sc: Scenario, outs: OutCount): Scenario {
  return { ...sc, id: `${sc.id}-o${outs}`, outs };
}

