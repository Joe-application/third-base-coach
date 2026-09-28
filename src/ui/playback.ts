import { FRAME_DT, RUNNER } from '../sim/constants';
import type { PlayTimeline } from '../sim/play';
import type { Vec } from '../sim/types';

/** ボールの軌跡（直近 span 秒） */
export function trailAt(tl: PlayTimeline, t: number, span = 0.45): Vec[] {
  const i1 = Math.min(tl.frames.length - 1, Math.floor(t / FRAME_DT));
  const i0 = Math.max(0, Math.floor((t - span) / FRAME_DT));
  const pts: Vec[] = [];
  for (let i = i0; i <= i1; i++) pts.push({ x: tl.frames[i].ball.x, y: tl.frames[i].ball.y });
  return pts;
}

/** 時刻 t でコーチャーが出している合図 */
export function signalAt(tl: PlayTimeline, t: number): 'send' | 'stop' | null {
  let s: 'send' | 'stop' | null = null;
  for (const c of tl.runner.accepted) if (c.t <= t && c.kind !== 'slide') s = c.kind;
  if (!s && tl.runner.autoStopped && tl.runner.tHesitate !== null && t >= tl.runner.tHesitate + RUNNER.hesitateDuration)
    s = 'stop';
  return s;
}
