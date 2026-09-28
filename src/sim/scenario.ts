// シナリオのプリセットとランダム生成（§7）

import { baselinePSafe, thresholdFor } from './evaluate';
import { dirFromAngle, fenceDistance } from './field';
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

export const PRESET_ORDER = ['anohi', 'anohi0', 'lfHardShallow', 'rcGap', 'cfWeak'] as const;

// ---- ランダム生成 ----

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export type GenerateOptions = {
  outs?: OutCount;
  /** 足・肩の種類を増やし、ライナー・フライも多めに出す */
  variety?: boolean;
};

const ARMS: Arm[] = ['weak', 'normal', 'normal', 'strong'];

/** 外野へのヒットを1つ作る（内野で捕られる打球は作らない） */
export function randomScenario(rng: Rng, opts: GenerateOptions = {}): Scenario {
  const outs: OutCount = opts.outs ?? (rng.int(0, 2) as OutCount);
  const r = rng.next();
  const type: BallType = opts.variety
    ? r < 0.5 ? 'ground' : r < 0.75 ? 'liner' : r < 0.9 ? 'fly_drop' : 'over'
    : r < 0.7 ? 'ground' : r < 0.9 ? 'liner' : 'fly_drop';
  const strength: Strength = rng.pick(['weak', 'normal', 'normal', 'hard'] as const);
  let angleDeg: number;
  if (type === 'ground') {
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
  if (type !== 'ground') {
    const fence = fenceDistance(angleDeg);
    const dist =
      type === 'liner' ? rng.uniform(36, 50) : type === 'fly_drop' ? rng.uniform(34, 44) : rng.uniform(58, fence - 6);
    const hang =
      type === 'liner' ? rng.uniform(1.3, 1.9) : type === 'fly_drop' ? rng.uniform(2.2, 2.8) : rng.uniform(2.6, 3.3);
    landing = landingAt(angleDeg, dist, hang);
  }
  return {
    id: `r${(rng.next() * 1e9) >>> 0}`,
    outs,
    runners: { first: false, second: true, third: false },
    battedBall: { type, angleDeg: Math.round(angleDeg * 10) / 10, strength, landing },
    runnerSpeed: rng.pick(['slow', 'normal', 'normal', 'fast'] as const),
    outfieldArm: { LF: rng.pick(ARMS), CF: rng.pick(ARMS), RF: rng.pick(ARMS) },
    outfieldDepth: depth,
    seed: (rng.next() * 4294967296) >>> 0,
  };
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

/** 条件に合う問題を1つ作る（P_safe を見て選別） */
export function generateRated(
  seed: number,
  difficulty: Difficulty,
  want: { outs?: OutCount; answer?: 'send' | 'stop'; variety?: boolean } = {},
  mcRuns = 240,
): RatedScenario {
  const rng = createRng(seed);
  let fallback: RatedScenario | null = null;
  for (let i = 0; i < 80; i++) {
    const sc = randomScenario(rng, { outs: want.outs, variety: want.variety });
    const pSafe = baselinePSafe(sc, mcRuns, hashSeed(seed, i));
    const threshold = thresholdFor(sc);
    const gap = pSafe - threshold;
    const answer = gap >= 0 ? 'send' : 'stop';
    const rated = { scenario: sc, pSafe, threshold, answer } as RatedScenario;
    if (want.answer && want.answer !== answer) continue;
    fallback ??= rated;
    if (acceptsGap(difficulty, gap)) return rated;
  }
  return fallback ?? rateScenario(randomScenario(rng, { outs: want.outs }));
}

export function rateScenario(sc: Scenario, mcRuns = 400): RatedScenario {
  const pSafe = baselinePSafe(sc, mcRuns);
  const threshold = thresholdFor(sc);
  return { scenario: sc, pSafe, threshold, answer: pSafe >= threshold ? 'send' : 'stop' };
}

/** チャレンジ10問：0/1/2アウトと、回す／止めるがおおよそ半々になるように */
export function generateChallenge(seed: number, difficulty: Difficulty, count = 10, variety = false): RatedScenario[] {
  const rng = createRng(seed);
  const plan: { outs: OutCount; answer: 'send' | 'stop' }[] = [];
  for (let i = 0; i < count; i++) {
    plan.push({ outs: (i % 3) as OutCount, answer: i % 2 === 0 ? 'send' : 'stop' });
  }
  // 並びをシャッフル
  for (let i = plan.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  return plan.map((p, i) => generateRated(hashSeed(seed, i, 77), difficulty, { ...p, variety }));
}

/** アウトカウント比較：同じ打球を 0/1/2 アウトで */
export function withOuts(sc: Scenario, outs: OutCount): Scenario {
  return { ...sc, id: `${sc.id}-o${outs}`, outs };
}

