import { describe, expect, it } from 'vitest';
import { ARM, RUNNER } from '../constants';
import { drawsFromSeed, mixDraws } from '../draws';
import {
  correctAnswer,
  decisionWindow,
  estimatePSafe,
  gradeDecision,
  judgeTiming,
  scorePlay,
  thresholdFor,
} from '../evaluate';
import { G_HOME, G_THIRD, leadGeom } from '../field';
import { outProbability, simulatePlay } from '../play';
import { createRng, hashSeed } from '../rng';
import { simulateRunner, simulateRunnerSpec } from '../runner';
import { generateChallenge, isLongHit, PRESETS, randomScenario } from '../scenario';
import { planThrow } from '../throw';
import type { Scenario } from '../types';

const anohi = PRESETS.anohi;

describe('rng', () => {
  it('同じシードなら同じ列', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('hashSeed は順序で変わる', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  });
});

describe('simulatePlay', () => {
  it('同じシードで結果が完全に一致する', () => {
    const cmds = [{ t: 3.1, kind: 'send' as const }, { t: 5.5, kind: 'slide' as const }];
    const a = simulatePlay(anohi, cmds, drawsFromSeed(99));
    const b = simulatePlay(anohi, cmds, drawsFromSeed(99));
    expect(b.result).toBe(a.result);
    expect(b.events).toEqual(a.events);
    expect(b.frames).toEqual(a.frames);
    expect(a.frames.length).toBeGreaterThan(100);
  });

  it('判断より前のフレームは、どんな判断をしても同じ（再計算しても巻き戻らない）', () => {
    const d = drawsFromSeed(5);
    const none = simulatePlay(anohi, [], d);
    const send = simulatePlay(anohi, [{ t: 3, kind: 'send' }], d);
    const stop = simulatePlay(anohi, [{ t: 3, kind: 'stop' }], d);
    const n = Math.floor(3 / 0.02);
    expect(send.frames.slice(0, n)).toEqual(none.frames.slice(0, n));
    expect(stop.frames.slice(0, n)).toEqual(none.frames.slice(0, n));
  });
});

describe('走者', () => {
  const runTime = (sc: Scenario) => simulateRunner(sc, [{ t: 0, kind: 'send' }], 0, false).tHome!;

  it('二塁→本塁（リード3m・二次リードなし・反応0.2秒・普通・回す）は 7.8〜8.6 秒（仕様 §13）', () => {
    const t = simulateRunnerSpec(
      { top: RUNNER.topSpeed.normal, tStart: 0.2, halfwayUntil: 0, gBase: G_THIRD, gTarget: G_HOME, autoTurns: [], gStart: 0 },
      [{ t: 0, kind: 'send' }],
      false,
    ).tHome!;
    expect(t).toBeGreaterThanOrEqual(7.8);
    expect(t).toBeLessThanOrEqual(8.6);
  });

  it('二次リードと早いスタートで、2アウトの二塁→本塁は 7.4〜8.0 秒', () => {
    const t = runTime(anohi);
    expect(t).toBeGreaterThanOrEqual(7.4);
    expect(t).toBeLessThanOrEqual(8.0);
  });

  it('足「速い」は「普通」より 0.4 秒以上速い', () => {
    const normal = runTime(anohi);
    const fast = runTime({ ...anohi, runnerSpeed: 'fast' });
    expect(normal - fast).toBeGreaterThanOrEqual(0.4);
  });

  it('0アウトのゴロはスタートが遅れる', () => {
    expect(runTime(PRESETS.anohi0) - runTime(anohi)).toBeCloseTo(RUNNER.groundWaitExtra, 1);
  });

  it('判断なしで三塁に着くと「迷い」→ 減速 → 自動で止まる', () => {
    const tr = simulateRunner(anohi, [], 0);
    expect(tr.hesitated).toBe(true);
    expect(tr.autoStopped).toBe(true);
    expect(tr.finalDecision).toBe('stop');
    expect(tr.tHome).toBeNull();
    // 迷っている間の速さは最高速の 50%
    const i = Math.round((tr.tHesitate! + 0.3) / tr.dt);
    const v = (tr.g[i + 1] - tr.g[i - 1]) / (2 * tr.dt);
    expect(v).toBeCloseTo(tr.topSpeed * RUNNER.hesitateFactor, 1);
  });

  it('早めに止めればオーバーランは 1m 以内', () => {
    const tr = simulateRunner(anohi, [{ t: 2.5, kind: 'stop' }], 0);
    expect(Math.max(...tr.g) - G_THIRD).toBeLessThanOrEqual(1);
    expect(tr.retreat).toBeNull();
  });

  it('回したあと三塁を大きく過ぎて止めると帰塁が必要', () => {
    const tr0 = simulateRunner(anohi, [{ t: 2.5, kind: 'send' }], 0);
    const tPast = tr0.g.findIndex((g) => g > G_THIRD + 3) * tr0.dt;
    const tr = simulateRunner(anohi, [{ t: 2.5, kind: 'send' }, { t: tPast, kind: 'stop' }], 0);
    expect(tr.retreat).not.toBeNull();
    expect(tr.retreat!.overrun).toBeGreaterThanOrEqual(RUNNER.retreatThreshold);
  });

  it('スライディングの合図は本塁の手前 8m まで', () => {
    const late = simulateRunner(anohi, [{ t: 0, kind: 'send' }, { t: 7.9, kind: 'slide' }], 0);
    const early = simulateRunner(anohi, [{ t: 0, kind: 'send' }, { t: 6, kind: 'slide' }], 0);
    expect(late.slideCalled).toBe(false);
    expect(early.slideCalled).toBe(true);
  });
});

describe('送球', () => {
  it('送球距離 > d_max のときは必ず中継プレー', () => {
    for (const arm of ['weak', 'normal', 'strong'] as const) {
      const d = ARM[arm].dMax + 0.5;
      for (let s = 0; s < 20; s++) {
        const plan = planThrow('CF', { x: 0, y: d }, arm, 5, drawsFromSeed(s));
        expect(plan.relay).not.toBeNull();
        expect(plan.legs.length).toBe(2);
      }
      const near = planThrow('CF', { x: 0, y: ARM[arm].dMax - 0.5 }, arm, 5, drawsFromSeed(1));
      expect(near.relay).toBeNull();
    }
  });

  it('ズレ > 4m のときは必ずセーフ', () => {
    for (let s = 0; s < 30; s++) {
      const draws = { ...drawsFromSeed(s), throwDevZ: 3.5, tagU: 0 };
      const tl = simulatePlay(anohi, [{ t: 0, kind: 'send' }], draws, { frames: false });
      expect(Math.abs(tl.throwPlan.dev)).toBeGreaterThan(4);
      expect(tl.result).toBe('safe');
      expect(tl.safeReason).toBe('wild_throw');
    }
  });

  it('クロスプレーのアウト確率', () => {
    expect(outProbability(2)).toBeCloseTo(0.97);
    expect(outProbability(-2)).toBe(0);
    expect(outProbability(0)).toBeCloseTo(0.5);
    expect(outProbability(0.3)).toBeGreaterThan(outProbability(0.1));
  });
});

describe('外野手', () => {
  it('あの日の場面：レフトが前進しながら捕る', () => {
    const tl = simulatePlay(anohi, [], drawsFromSeed(3), { frames: false });
    expect(tl.fielding.fielder).toBe('LF');
    expect(tl.fielding.catchType).toBe('forward');
  });
  it('右中間を破る打球は後ろ向きで捕る', () => {
    const tl = simulatePlay(PRESETS.rcGap, [], drawsFromSeed(3), { frames: false });
    expect(tl.fielding.catchType).toBe('back');
  });
});

describe('評価', () => {
  it('基準値', () => {
    expect(thresholdFor(anohi)).toBe(0.4);
    expect(thresholdFor(PRESETS.anohi0)).toBe(0.75);
    expect(thresholdFor({ ...anohi, scoreDiff: 6 }, { situational: true })).toBeCloseTo(0.5);
    expect(thresholdFor({ ...anohi, scoreDiff: 0, inning: 6 }, { situational: true })).toBeCloseTo(0.35);
  });

  it('採点表（§5.3）', () => {
    expect(gradeDecision('send', 0.6, 0.4).grade).toBe('great');
    expect(gradeDecision('send', 0.45, 0.4).grade).toBe('ok');
    expect(gradeDecision('send', 0.25, 0.4).verdict).toBe('reckless');
    expect(gradeDecision('stop', 0.2, 0.4).grade).toBe('great');
    expect(gradeDecision('stop', 0.45, 0.4).grade).toBe('ok');
    expect(gradeDecision('stop', 0.6, 0.4).verdict).toBe('too_cautious');
    expect(correctAnswer(0.9, 0.6)).toBe('send');
  });

  it('確定した事象だけ固定される', () => {
    const a = drawsFromSeed(1);
    const b = drawsFromSeed(2);
    const m = mixDraws(a, b, { reaction: true, caught: true, released: false });
    expect(m.fielderReaction).toBe(a.fielderReaction);
    expect(m.fumbleU).toBe(a.fumbleU);
    expect(m.holdU).toBe(b.holdU);
    expect(m.throwDevZ).toBe(b.throwDevZ);
  });

  it('P_safe は同じシードで再現できる', () => {
    const d = drawsFromSeed(8);
    const p1 = estimatePSafe(anohi, d, [], 3.2, 200);
    const p2 = estimatePSafe(anohi, d, [], 3.2, 200);
    expect(p1).toEqual(p2);
  });

  it('タイミング判定（はやすぎ・おそいは ×）', () => {
    const win = { tWindowStart: 2.3, tThird: 4.4, tDeadline: 4.0 };
    expect(judgeTiming(1.0, 3, win)).toBe('early');
    expect(judgeTiming(2.6, 3, win)).toBe('best');
    expect(judgeTiming(3.2, 3, win)).toBe('best');
    expect(judgeTiming(3.8, 3, win)).toBe('good');
    expect(judgeTiming(4.2, 3, win)).toBe('late');
    expect(judgeTiming(null, 3, win)).toBe('late');
    // 捕球がウィンドウより前：捕球の少し前から OK
    expect(judgeTiming(1.9, 2.0, win)).toBe('best');
    expect(judgeTiming(1.5, 2.0, win)).toBe('early');
    // 捕球が締め切りより後（深い打球）：ウィンドウの中ならベスト
    expect(judgeTiming(3.0, 6, win)).toBe('best');
  });

  it('判断ウィンドウは三塁到達の前', () => {
    const w = decisionWindow(anohi);
    expect(w.tWindowStart).toBeLessThan(w.tThird);
  });

  it('締め切りまでに合図しないと「おそい」で ×、止めた扱い', () => {
    const d = drawsFromSeed(4);
    const tl = simulatePlay(anohi, [], d, { frames: false });
    const s = scorePlay(tl, d, { mcRuns: 100 });
    expect(s.decision).toBe('stop');
    expect(s.timing).toBe('late');
    expect(s.grade.grade).toBe('bad');
    expect(s.grade.verdict).toBe('too_late');
  });

  it('外野手が捕る前に合図すると「はやすぎ」で ×（判断の中身が正しくても）', () => {
    const d = drawsFromSeed(4);
    const tl = simulatePlay(anohi, [{ t: 0.5, kind: 'send' }], d, { frames: false });
    const s = scorePlay(tl, d, { mcRuns: 100 });
    expect(s.timing).toBe('early');
    expect(s.grade.grade).toBe('bad');
    expect(s.grade.verdict).toBe('too_early');
  });

  it('締め切りは三塁の手前、ウィンドウの開始より後', () => {
    const w = decisionWindow(anohi);
    expect(w.tDeadline).toBeGreaterThan(w.tWindowStart);
    expect(w.tDeadline).toBeLessThan(w.tThird);
  });
});

describe('シナリオ生成', () => {
  it('ランダムに作った打球は外野手が処理できる', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const sc = randomScenario(rng, { variety: true });
      const tl = simulatePlay(sc, [{ t: 0, kind: 'send' }], drawsFromSeed(i), { frames: false });
      expect(['LF', 'CF', 'RF']).toContain(tl.fielding.fielder);
      expect(Number.isFinite(tl.duration)).toBe(true);
    }
  });

  it('チャレンジ10問：単打7問（7方向）・ランナー一塁2問・外野の間を抜ける長打1問', () => {
    const set = generateChallenge(77, 'easy');
    const singles = set.filter((r) => r.scenario.runners.second && !isLongHit(r.scenario));
    const fromFirst = set.filter((r) => r.scenario.runners.first);
    expect(singles).toHaveLength(7);
    expect(fromFirst).toHaveLength(2);
    // 7方向が1つずつ（レフト線〜ライト線）
    const angles = singles.map((r) => r.scenario.battedBall.angleDeg).sort((a, b) => a - b);
    expect(angles[0]).toBeLessThan(-35);
    expect(angles[6]).toBeGreaterThan(35);
  });

  it('ランナー一塁：一塁走者は二塁を回って三塁の手前で判断し、打者走者の判断は出ない', () => {
    const set = generateChallenge(77, 'easy');
    const sc = set.find((r) => r.scenario.runners.first)!.scenario;
    const geom = leadGeom(sc);
    expect(geom.fromFirst).toBe(true);
    const tl = simulatePlay(sc, [], drawsFromSeed(1));
    // 判断しなければ、三塁の手前で迷って止まる
    expect(tl.runner.hesitated).toBe(true);
    expect(Math.max(...tl.runner.g)).toBeGreaterThan(geom.gThird);
    expect(tl.runner.tHome).toBeNull();
    const sent = simulatePlay(sc, [{ t: tl.runner.tWindowStart!, kind: 'send' }], drawsFromSeed(1), { frames: false });
    expect(sent.runner.tHome).not.toBeNull();
    expect(sent.batter?.eligible ?? false).toBe(false);
    // 二塁を通るときの座標は二塁ベースの近く
    const i = tl.runner.g.findIndex((g) => g >= geom.gThird - 23);
    const p = geom.pos(tl.runner.g[i], 0);
    expect(Math.hypot(p.x - 0, p.y - 32.53)).toBeLessThan(2);
  });

  it('チャレンジ10問はアウトカウントと正解がばらける', () => {
    const set = generateChallenge(123, 'easy');
    expect(set).toHaveLength(10);
    const outs = new Set(set.map((r) => r.scenario.outs));
    expect(outs.size).toBe(3);
    const sends = set.filter((r) => r.answer === 'send').length;
    expect(sends).toBeGreaterThanOrEqual(3);
    expect(sends).toBeLessThanOrEqual(7);
  });
});
