import { FIELD, FIELDER_POSITIONS, OUTFIELD_DEPTH_SHIFT, RUNNER } from './constants';
import type { Depth, FielderId, Vec } from './types';

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, k: number): Vec => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});
export const norm = (a: Vec): Vec => {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** 2ベクトルのなす角（度） */
export const angleBetweenDeg = (a: Vec, b: Vec): number => {
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return 0;
  const c = Math.min(1, Math.max(-1, (a.x * b.x + a.y * b.y) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
};

/** 角度（0=センター、負=レフト側）→ 単位ベクトル */
export const dirFromAngle = (deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), y: Math.cos(r) };
};
export const angleOf = (p: Vec): number => (Math.atan2(p.x, p.y) * 180) / Math.PI;

export type Bases = { home: Vec; first: Vec; second: Vec; third: Vec };

export function bases(baseDistance = FIELD.baseDistance): Bases {
  const h = baseDistance / Math.SQRT2;
  return {
    home: vec(0, 0),
    first: vec(h, h),
    second: vec(0, 2 * h),
    third: vec(-h, h),
  };
}

export const BASES = bases();

/** フェンスまでの距離（楕円弧の近似：中堅 80m、両翼 70m） */
export function fenceDistance(angleDeg: number): number {
  const a = Math.min(45, Math.abs(angleDeg));
  return FIELD.fenceLine + (FIELD.fenceCenter - FIELD.fenceLine) * Math.cos((2 * a * Math.PI) / 180);
}

export function fielderStart(id: FielderId, depth: Depth): Vec {
  const p = FIELDER_POSITIONS[id];
  if (id !== 'LF' && id !== 'CF' && id !== 'RF') return { ...p };
  const shift = OUTFIELD_DEPTH_SHIFT[depth];
  return add(p, scale(norm(p), shift));
}

// ---- 走者の経路 ----
// 走者の進み具合 g（m）は「リード位置 → 三塁 → 本塁」の折れ線に沿った距離。
// 三塁は g = G_THIRD、本塁は g = G_HOME。

export const LEAD_POINT = lerp(BASES.second, BASES.third, RUNNER.lead / FIELD.baseDistance);
export const G_THIRD = FIELD.baseDistance - RUNNER.lead;
export const G_HOME = G_THIRD + FIELD.baseDistance;
/** 三塁での膨らみの方向（ダイヤモンドの外側） */
const OUTWARD_AT_THIRD = norm(sub(BASES.third, vec(0, BASES.third.y)));

/** g とふくらみ量（0〜1）から走者の座標を返す */
export function runnerPosition(g: number, bulge: number): Vec {
  let p: Vec;
  if (g <= G_THIRD) p = lerp(LEAD_POINT, BASES.third, g / G_THIRD);
  else p = lerp(BASES.third, BASES.home, Math.min(1, (g - G_THIRD) / FIELD.baseDistance));
  if (bulge > 0) {
    const z0 = G_THIRD - RUNNER.turnZoneBefore;
    const z1 = G_THIRD + RUNNER.turnZoneAfter;
    if (g > z0 && g < z1) {
      const k = Math.sin((Math.PI * (g - z0)) / (z1 - z0));
      p = add(p, scale(OUTWARD_AT_THIRD, RUNNER.turnExtraPath * k * bulge));
    }
  }
  return p;
}

// 打者走者の進み具合 g は「本塁 → 一塁 → 二塁 → 三塁」の折れ線に沿った距離。
export const G_B_FIRST = FIELD.baseDistance;
export const G_B_SECOND = FIELD.baseDistance * 2;
export const G_B_THIRD = FIELD.baseDistance * 3;

/**
 * 打者走者の位置。roundFirst なら一塁を、roundSecond なら二塁を膨らんで回る。
 */
export function batterPosition(g: number, roundFirst = false, roundSecond = false): Vec {
  const d = FIELD.baseDistance;
  let p: Vec;
  if (g <= d) p = lerp(BASES.home, BASES.first, Math.max(0, g) / d);
  else if (g <= 2 * d) p = lerp(BASES.first, BASES.second, (g - d) / d);
  else p = lerp(BASES.second, BASES.third, Math.min(1, (g - 2 * d) / d));
  const bump = (base: number, dir: Vec) => {
    const z0 = base - RUNNER.turnZoneBefore;
    const z1 = base + RUNNER.turnZoneAfter;
    if (g > z0 && g < z1) p = add(p, scale(dir, RUNNER.turnExtraPath * Math.sin((Math.PI * (g - z0)) / (z1 - z0))));
  };
  if (roundFirst) bump(G_B_FIRST, vec(1, 0));
  if (roundSecond) bump(G_B_SECOND, vec(0, 1));
  return p;
}

/** 三塁コーチャーの位置（コーチャーズボックス） */
export const COACH_POSITION = vec(-23, 13);
