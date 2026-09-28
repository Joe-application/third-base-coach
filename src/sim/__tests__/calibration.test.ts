// キャリブレーションテスト（§13）。P_safe（2000回平均）が目標範囲に入ること。
import { describe, expect, it } from 'vitest';
import { baselinePSafe, correctAnswer, thresholdFor } from '../evaluate';
import { PRESETS } from '../scenario';

const cases: { id: keyof typeof PRESETS; min: number; max: number; answer: 'send' | 'stop' | 'close' }[] = [
  { id: 'anohi', min: 0.55, max: 0.7, answer: 'send' },
  { id: 'anohi0', min: 0.45, max: 0.65, answer: 'stop' },
  { id: 'lfHardShallow', min: 0.1, max: 0.3, answer: 'stop' },
  { id: 'rcGap', min: 0.9, max: 1, answer: 'send' },
  { id: 'cfWeak', min: 0.5, max: 0.7, answer: 'close' },
];

describe('キャリブレーション', () => {
  for (const c of cases) {
    it(`${PRESETS[c.id].name}（${PRESETS[c.id].outs}アウト）: ${c.min}〜${c.max}`, () => {
      const sc = PRESETS[c.id];
      const p = baselinePSafe(sc, 2000);
      console.log(`${sc.name} ${sc.outs}アウト P_safe=${p.toFixed(3)}`);
      expect(p).toBeGreaterThanOrEqual(c.min);
      expect(p).toBeLessThanOrEqual(c.max);
      expect(correctAnswer(p, thresholdFor(sc))).toBe(c.answer);
    });
  }
});
