import { describe, expect, it } from 'vitest';
import { drawsFromSeed } from '../draws';
import { estimateBatterPSafe, scorePlay } from '../evaluate';
import { G_B_SECOND } from '../field';
import { simulatePlay } from '../play';
import { hashSeed } from '../rng';
import { generateChallenge, hasBatterDecision, PRESETS } from '../scenario';
import type { Command, Scenario } from '../types';

const send0: Command = { t: 0, kind: 'send' };

/** 打者走者の判断ウィンドウの少しあとに「三塁へ」を出したときの三塁セーフ率 */
function batterSafeRate(sc: Scenario, n = 400) {
  let safe = 0;
  for (let i = 0; i < n; i++) {
    const d = drawsFromSeed(hashSeed(7, i));
    const base = simulatePlay(sc, [send0], d, { frames: false });
    const tb = (base.batter!.trace.tWindowStart ?? 0) + 0.3;
    const tl = simulatePlay(sc, [send0, { t: tb, kind: 'bsend' }], d, { frames: false });
    if (tl.batter!.result === 'third') safe++;
  }
  return safe / n;
}

describe('打者走者（二塁を回るか）', () => {
  it('単打（あの日の場面）では打者走者の判断は出ない', () => {
    expect(simulatePlay(PRESETS.anohi, [send0], drawsFromSeed(1), { frames: false }).batter).toBeNull();
  });

  it('長打で二塁走者を回すと、打者走者の判断が出る', () => {
    const tl = simulatePlay(PRESETS.rcDeep, [send0], drawsFromSeed(1), { frames: false });
    expect(tl.batter?.eligible).toBe(true);
    expect(tl.batter!.trace.tWindowStart).not.toBeNull();
    // 判断ウィンドウは、二塁走者を回したあと
    expect(tl.batter!.trace.tWindowStart!).toBeGreaterThan(tl.runner.tThird!);
  });

  it('二塁走者を止めたら、打者走者は二塁で止まり、合図は受け付けない', () => {
    const tl = simulatePlay(PRESETS.rcDeep, [{ t: 0, kind: 'stop' }, { t: 7.5, kind: 'bsend' }], drawsFromSeed(1), {
      frames: false,
    });
    expect(tl.batter!.eligible).toBe(false);
    expect(tl.batter!.result).toBe('second');
    expect(tl.batter!.trace.tHome).toBeNull();
  });

  it('合図がないまま二塁に着くと「迷い」で止まる', () => {
    const tl = simulatePlay(PRESETS.rcDeep, [send0], drawsFromSeed(2), { frames: false });
    expect(tl.batter!.trace.hesitated).toBe(true);
    expect(tl.batter!.trace.autoStopped).toBe(true);
    expect(tl.batter!.result).toBe('second');
  });

  it('二塁走者が楽にセーフなら、中継は三塁へ投げる（本塁には投げない）', () => {
    const d = drawsFromSeed(3);
    const base = simulatePlay(PRESETS.rcDeep, [send0], d, { frames: false });
    const tl = simulatePlay(PRESETS.rcDeep, [send0, { t: base.batter!.trace.tWindowStart!, kind: 'bsend' }], d);
    expect(tl.batter!.throw?.via).toBe('cut');
    expect(tl.result).toBe('safe');
    expect(tl.events.some((e) => e.kind === 'ballHome')).toBe(false);
    expect(tl.events.some((e) => e.kind === 'batterCall')).toBe(true);
  });

  it('深々と破る打球（1アウト）は三塁を狙える、右中間を抜けるだけの打球は無理', () => {
    expect(batterSafeRate(PRESETS.rcDeep)).toBeGreaterThanOrEqual(0.75);
    expect(batterSafeRate(PRESETS.rcGap)).toBeLessThanOrEqual(0.35);
  });

  it('打者走者のフレームは二塁を回って三塁まで進む', () => {
    const d = drawsFromSeed(3);
    const base = simulatePlay(PRESETS.rcDeep, [send0], d, { frames: false });
    const tl = simulatePlay(PRESETS.rcDeep, [send0, { t: base.batter!.trace.tWindowStart!, kind: 'bsend' }], d);
    expect(Math.max(...tl.batter!.trace.g)).toBeGreaterThan(G_B_SECOND + 20);
    const last = tl.frames[tl.frames.length - 1].batter;
    expect(last.x).toBeLessThan(-10); // 三塁側
  });

  it('打者走者の判断も採点され、同じシードなら P_safe が再現する', () => {
    const d = drawsFromSeed(4);
    const base = simulatePlay(PRESETS.rcDeep, [send0], d, { frames: false });
    const tb = base.batter!.trace.tWindowStart! + 0.2;
    const tl = simulatePlay(PRESETS.rcDeep, [send0, { t: tb, kind: 'bsend' }], d, { frames: false });
    const s = scorePlay(tl, d, { mcRuns: 150 });
    expect(s.batter).not.toBeNull();
    expect(s.batter!.decision).toBe('send');
    expect(s.batter!.threshold).toBe(0.65);
    const p1 = estimateBatterPSafe(PRESETS.rcDeep, d, [send0], [], tb, 100);
    const p2 = estimateBatterPSafe(PRESETS.rcDeep, d, [send0], [], tb, 100);
    expect(p1).toEqual(p2);
  });

  it('チャレンジ10問のうち、打者走者の判断が出る長打は1問', () => {
    const set = generateChallenge(321, 'easy');
    expect(set.filter((r) => hasBatterDecision(r.scenario)).length).toBe(1);
  });
});
