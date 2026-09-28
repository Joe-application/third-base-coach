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
  const cmds = [...tl.runner.accepted, ...(tl.batter?.eligible ? tl.batter.trace.accepted : [])].sort((a, b) => a.t - b.t);
  for (const c of cmds) {
    if (c.t > t || c.kind === 'slide') continue;
    s = c.kind === 'send' || c.kind === 'bsend' ? 'send' : 'stop';
  }
  const bt = tl.batter?.eligible ? tl.batter.trace : null;
  if (bt?.autoStopped && bt.tHesitate !== null && t >= bt.tHesitate + RUNNER.hesitateDuration) s = 'stop';
  if (!s && tl.runner.autoStopped && tl.runner.tHesitate !== null && t >= tl.runner.tHesitate + RUNNER.hesitateDuration)
    s = 'stop';
  return s;
}

export type Call = { text: string; tone: 'safe' | 'out' | 'stop' };

const LEAD_CALL: Record<string, Call> = {
  safe: { text: 'セーフ！', tone: 'safe' },
  out_home: { text: 'アウト！', tone: 'out' },
  stop: { text: 'ストップ', tone: 'stop' },
  out_third: { text: 'アウト！', tone: 'out' },
};
const BATTER_CALL: Record<string, Call> = {
  third: { text: '三塁セーフ！', tone: 'safe' },
  out_third: { text: '三塁アウト！', tone: 'out' },
};

/** 時刻 t に出ている審判のコール（最後に出たもの） */
export function callAt(tl: PlayTimeline, t: number): Call | null {
  let c: Call | null = null;
  for (const e of tl.events) {
    if (e.t > t) break;
    if (e.kind === 'call') c = LEAD_CALL[e.detail ?? ''] ?? null;
    else if (e.kind === 'batterCall') c = BATTER_CALL[e.detail ?? ''] ?? null;
  }
  return c;
}
