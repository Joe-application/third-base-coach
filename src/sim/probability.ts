import { CROSSPLAY } from './constants';

/** タッチプレーのアウト確率（§4.7）。Δ = 走者の到達 − (ボール到達 + タッチ時間) */
export function outProbability(delta: number): number {
  if (delta > CROSSPLAY.clearMargin) return CROSSPLAY.clearOutProb;
  if (delta < -CROSSPLAY.clearMargin) return 0;
  return 1 / (1 + Math.exp(-delta / CROSSPLAY.logisticScale));
}
