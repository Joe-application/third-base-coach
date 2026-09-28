// モードごとの出題を組み立てる

import { baselinePSafe } from '../sim/evaluate';
import { createRng, hashSeed, randomSeed } from '../sim/rng';
import { generateChallenge, generateRated, PRESETS, randomScenario, withOuts } from '../sim/scenario';
import type { OutCount, Scenario } from '../sim/types';
import { rankFor } from '../game/progression';
import type { Profile, Settings } from '../game/storage';
import type { Mode, Session, SessionItem } from './state';

function playOptions(mode: Mode, profile: Profile, settings: Settings) {
  const rank = rankFor(profile.stars);
  let speed = rank.speed;
  if (settings.speed === 'slow') speed = 0.5;
  if (settings.speed === 'normal') speed = 1;
  if (mode === 'tutorial') return { speed: Math.min(speed, 0.6), hint: true, hideTraits: false };
  if (mode === 'free') return { speed, hint: rank.hint, hideTraits: false };
  return { speed, hint: rank.hint, hideTraits: rank.hideTraits };
}

const reseed = (sc: Scenario, seed = randomSeed()): Scenario => ({ ...sc, seed });

/** 同じ打球で「2アウトなら回す、0アウトなら止める」になりやすいものを探す */
export function compareBall(seed: number): Scenario {
  const rng = createRng(seed);
  for (let i = 0; i < 60; i++) {
    const sc = randomScenario(rng, { outs: 2 });
    if (sc.battedBall.type !== 'ground') continue;
    const p2 = baselinePSafe(sc, 200, hashSeed(seed, i));
    if (p2 < 0.5 || p2 > 0.85) continue;
    const p0 = baselinePSafe(withOuts(sc, 0), 200, hashSeed(seed, i, 1));
    if (p0 < 0.62) return sc;
  }
  return { ...PRESETS.anohi, seed };
}

export function buildSession(mode: Mode, profile: Profile, settings: Settings, free?: Scenario): Session {
  const opts = playOptions(mode, profile, settings);
  const rank = rankFor(profile.stars);
  let items: SessionItem[] = [];
  switch (mode) {
    case 'tutorial': {
      const easy = generateRated(randomSeed(), 'easy', { outs: 1 });
      items = [
        { scenario: reseed(PRESETS.rcGap), presetId: 'rcGap' },
        { scenario: reseed(PRESETS.lfHardShallow), presetId: 'lfHardShallow' },
        { scenario: reseed(easy.scenario) },
      ];
      break;
    }
    case 'challenge':
      items = generateChallenge(randomSeed(), rank.difficulty, 10, rank.variety).map((r) => ({ scenario: r.scenario }));
      break;
    case 'compare': {
      const ball = compareBall(randomSeed());
      items = ([0, 1, 2] as OutCount[]).map((o) => ({ scenario: reseed(withOuts(ball, o)) }));
      break;
    }
    case 'anohi':
      items = [{ scenario: reseed(PRESETS.anohi), presetId: 'anohi' }];
      break;
    case 'free':
      items = [{ scenario: reseed(free ?? PRESETS.anohi) }];
      break;
  }
  return { mode, items, index: 0, records: [], combo: 0, ...opts };
}

/** 同じ場面をもう一度（乱数だけ変える） */
export function replayItem(item: SessionItem): SessionItem {
  return { ...item, scenario: reseed(item.scenario) };
}
