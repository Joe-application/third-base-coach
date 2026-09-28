// タイムライン比較（§9.3）：ランナーとボールの2本の帯。判断した時刻に縦線。

import { CROSSPLAY, THROW } from '../../sim/constants';
import type { PlayTimeline } from '../../sim/play';
import { LABEL } from '../../game/messages';
import { plain } from './Ruby';

type Seg = { t0: number; t1: number; label: string; cls: string };
type Mark = { t: number; label: string };

export function TimelineChart({ tl, decisionTime }: { tl: PlayTimeline; decisionTime: number }) {
  const r = tl.runner;
  const f = tl.fielding;
  const th = tl.throwPlan;
  const tHomeReady = th.tArriveHome + (th.catcherMoved ? THROW.catcherMoveTime : 0) + CROSSPLAY.tagTime;
  const tEnd = Math.max(tl.duration - 0.8, tHomeReady, r.tHome ?? 0) + 0.3;
  const tMax = Math.ceil(tEnd);

  const runSegs: Seg[] = [];
  const runMarks: Mark[] = [];
  runSegs.push({ t0: 0, t1: r.tStart, label: '', cls: 'wait' });
  const t3 = r.tThird ?? r.tStart;
  runSegs.push({ t0: r.tStart, t1: t3, label: '→三塁', cls: 'run' });
  runMarks.push({ t: r.tStart, label: 'スタート' });
  runMarks.push({ t: t3, label: '三塁' });
  if (r.tHome !== null) {
    runSegs.push({ t0: t3, t1: r.tHome, label: '→本塁', cls: 'run2' });
    runMarks.push({ t: r.tHome, label: '本塁' });
  } else {
    const tStop = r.retreat?.tBack ?? t3 + 0.8;
    runSegs.push({ t0: t3, t1: tStop, label: 'ストップ', cls: 'stopseg' });
  }

  const ballSegs: Seg[] = [];
  const ballMarks: Mark[] = [];
  ballSegs.push({ t0: 0, t1: f.tCatch, label: '打球', cls: 'ball' });
  ballMarks.push({ t: f.tCatch, label: '捕球' });
  ballSegs.push({ t0: f.tCatch, t1: f.tRelease, label: f.fumble ? 'ファンブル' : '持ち替え', cls: f.fumble ? 'fumble' : 'hold' });
  for (const [i, leg] of th.legs.entries()) {
    ballSegs.push({ t0: leg.tStart, t1: leg.tEnd, label: i === 0 && th.relay ? '送球' : th.relay ? '中継' : '送球', cls: 'throw' });
    if (i === 0 && th.relay) ballSegs.push({ t0: leg.tEnd, t1: th.legs[1].tStart, label: '', cls: 'hold' });
  }
  ballMarks.push({ t: th.tArriveHome, label: '本塁' });
  if (!th.wild) ballSegs.push({ t0: th.tArriveHome, t1: tHomeReady, label: 'タッチ', cls: 'tag' });

  const W = 100;
  const x = (t: number) => (Math.min(t, tMax) / tMax) * W;
  const ticks = Array.from({ length: tMax + 1 }, (_, i) => i);

  const row = (y: number, segs: Seg[], marks: Mark[]) => (
    <g>
      {segs
        .filter((s) => s.t1 > s.t0)
        .map((s, i) => (
          <g key={i}>
            <rect x={x(s.t0)} y={y} width={Math.max(0.3, x(s.t1) - x(s.t0))} height={9} className={`seg ${s.cls}`} rx={1.2} />
            {x(s.t1) - x(s.t0) > 9 && s.label && (
              <text x={(x(s.t0) + x(s.t1)) / 2} y={y + 6.3} textAnchor="middle" className="seg-label">
                {s.label}
              </text>
            )}
          </g>
        ))}
      {marks.map((m, i) => {
        // 端で文字が切れないように寄せる
        const mx = x(m.t);
        const anchor = mx < 8 ? 'start' : mx > W - 8 ? 'end' : 'middle';
        return (
          <text key={i} x={anchor === 'start' ? Math.max(-1.5, mx - 1) : mx} y={y + 14.5} textAnchor={anchor} className="mark-label">
            {m.label} {m.t.toFixed(1)}
          </text>
        );
      })}
    </g>
  );

  return (
    <div className="timeline">
      <div className="timeline-legend">
        <span>🏃 ランナー</span>
        <span>⚾ ボール（{plain(LABEL.fielder[f.fielder])}）</span>
      </div>
      <svg viewBox="-2 0 104 44" className="timeline-svg" role="img" aria-label="ランナーとボールのタイムライン">
        {ticks.map((i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={1} y2={38} className="tick" />
            <text x={x(i)} y={43} textAnchor="middle" className="tick-label">
              {i}秒
            </text>
          </g>
        ))}
        {row(2, runSegs, runMarks)}
        {row(20, ballSegs, ballMarks)}
        <line x1={x(decisionTime)} x2={x(decisionTime)} y1={0} y2={38} className="decision-line" />
        <text x={x(decisionTime) + 0.8} y={37} className="decision-label">
          判断
        </text>
      </svg>
    </div>
  );
}
