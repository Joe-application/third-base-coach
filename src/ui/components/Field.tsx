// グラウンドの俯瞰図（SVG）。座標は m、+y がセンター方向。SVG では y を反転する。

import { memo } from 'react';
import { FIELD } from '../../sim/constants';
import { BASES, COACH_POSITION, fenceDistance, dirFromAngle } from '../../sim/field';
import type { Arm, FielderId, Frame, OutfielderId, Vec } from '../../sim/types';
import type { Call } from '../playback';

const NUMBERS: Record<FielderId, string> = {
  P: '1',
  C: '2',
  '1B': '3',
  '2B': '4',
  '3B': '5',
  SS: '6',
  LF: '7',
  CF: '8',
  RF: '9',
};

const P = (v: Vec) => `${v.x.toFixed(2)},${(-v.y).toFixed(2)}`;

function fencePath(): string {
  const pts: string[] = [];
  for (let a = -45; a <= 45; a += 3) {
    const d = dirFromAngle(a);
    const r = fenceDistance(a);
    pts.push(P({ x: d.x * r, y: d.y * r }));
  }
  return pts.join(' ');
}

function arcPoints(r: number): string {
  const pts: string[] = [];
  for (let a = -45; a <= 45; a += 5) {
    const d = dirFromAngle(a);
    pts.push(P({ x: d.x * r, y: d.y * r }));
  }
  return pts.join(' ');
}

/** 動かない背景（1回だけ描く） */
const Ground = memo(function Ground() {
  const fence = fencePath();
  const dirt = arcPoints(FIELD.infieldRadius);
  const lf = dirFromAngle(-45);
  const rf = dirFromAngle(45);
  const b = BASES;
  const base = (v: Vec, key: string) => (
    <rect key={key} x={v.x - 0.6} y={-v.y - 0.6} width={1.2} height={1.2} fill="#fff" transform={`rotate(45 ${v.x} ${-v.y})`} />
  );
  return (
    <g>
      <rect x={-80} y={-100} width={160} height={120} fill="var(--foul)" />
      {/* 外野の芝 */}
      <polygon points={`0,0 ${fence}`} fill="var(--grass)" />
      {/* 内野の土 */}
      <polygon points={`0,0 ${dirt}`} fill="var(--dirt)" />
      <circle cx={0} cy={0} r={4.5} fill="var(--dirt)" />
      {/* 芝の縞 */}
      {[45, 55, 65, 75].map((r) => (
        <polyline key={r} points={arcPoints(r)} fill="none" stroke="var(--grass-stripe)" strokeWidth={4} opacity={0.5} />
      ))}
      <polyline points={fence} fill="none" stroke="var(--fence)" strokeWidth={1.2} />
      {/* ファウルライン・塁間 */}
      <line x1={0} y1={0} x2={lf.x * 72} y2={-lf.y * 72} stroke="#fff" strokeWidth={0.25} />
      <line x1={0} y1={0} x2={rf.x * 72} y2={-rf.y * 72} stroke="#fff" strokeWidth={0.25} />
      <polygon points={`${P(b.home)} ${P(b.first)} ${P(b.second)} ${P(b.third)}`} fill="none" stroke="#fff" strokeWidth={0.2} opacity={0.8} />
      <circle cx={0} cy={-16} r={1.6} fill="var(--dirt-dark)" />
      <rect x={-0.4} y={-16.1} width={0.8} height={0.2} fill="#fff" />
      {base(b.first, '1')}
      {base(b.second, '2')}
      {base(b.third, '3')}
      <polygon points="0,0 -0.5,-0.4 -0.5,-0.9 0.5,-0.9 0.5,-0.4" fill="#fff" transform="translate(0,0.45)" />
      {/* 三塁コーチャーズボックス */}
      <rect
        x={COACH_POSITION.x - 2}
        y={-COACH_POSITION.y - 3}
        width={4}
        height={6}
        fill="none"
        stroke="#fff"
        strokeWidth={0.18}
        strokeDasharray="0.6 0.4"
        opacity={0.8}
      />
    </g>
  );
});

function Player({ p, label, fill, text = '#fff', r = 1.7 }: { p: Vec; label: string; fill: string; text?: string; r?: number }) {
  return (
    <g transform={`translate(${p.x.toFixed(2)},${(-p.y).toFixed(2)})`}>
      <ellipse cx={0.35} cy={0.5} rx={r} ry={r * 0.7} fill="#000" opacity={0.22} />
      <circle r={r} fill={fill} stroke="#fff" strokeWidth={0.3} />
      <text y={0.62} textAnchor="middle" fontSize={r * 1.05} fontWeight={800} fill={text}>
        {label}
      </text>
    </g>
  );
}

function Coach({ signal, pulse }: { signal: 'send' | 'stop' | null; pulse: boolean }) {
  const c = COACH_POSITION;
  return (
    <g transform={`translate(${c.x},${-c.y})`}>
      {pulse && <circle r={3.6} className="coach-pulse" fill="none" stroke="var(--accent)" strokeWidth={0.5} />}
      <ellipse cx={0.35} cy={0.6} rx={1.9} ry={1.3} fill="#000" opacity={0.22} />
      {signal === 'send' && (
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.55s" repeatCount="indefinite" />
          <line x1={0} y1={0} x2={0} y2={-3.8} stroke="var(--coach)" strokeWidth={0.9} strokeLinecap="round" />
          <circle cx={0} cy={-3.8} r={0.75} fill="var(--coach)" />
        </g>
      )}
      {signal === 'stop' && (
        <g>
          <line x1={-1.2} y1={-0.5} x2={-2.2} y2={-3.6} stroke="var(--coach)" strokeWidth={0.8} strokeLinecap="round" />
          <line x1={1.2} y1={-0.5} x2={2.2} y2={-3.6} stroke="var(--coach)" strokeWidth={0.8} strokeLinecap="round" />
          <circle cx={-2.2} cy={-3.8} r={0.7} fill="var(--coach)" />
          <circle cx={2.2} cy={-3.8} r={0.7} fill="var(--coach)" />
        </g>
      )}
      <circle r={1.9} fill="var(--coach)" stroke="#fff" strokeWidth={0.35} />
      <text y={0.7} textAnchor="middle" fontSize={1.9} fontWeight={900} fill="#1f2937">
        君
      </text>
    </g>
  );
}

/** 外野手の肩のラベル（ひらがな：SVG ではふりがなを付けられないため） */
const ARM_TEXT: Record<Arm, string> = { strong: 'かた つよい', normal: 'かた ふつう', weak: 'かた よわい' };
const ARM_COLOR: Record<Arm, string> = { strong: '#fecaca', normal: '#f1f5f9', weak: '#bbf7d0' };

function ArmLabel({ p, arm }: { p: Vec; arm: Arm | 'hidden' }) {
  const text = arm === 'hidden' ? 'かた ？' : ARM_TEXT[arm];
  const color = arm === 'hidden' ? '#f1f5f9' : ARM_COLOR[arm];
  const w = text.length * 2.55 + 1.8;
  return (
    <g transform={`translate(${p.x.toFixed(2)},${(-p.y + 4.3).toFixed(2)})`}>
      <rect x={-w / 2} y={-1.9} width={w} height={3.8} rx={1.9} fill="#0f172a" opacity={0.8} />
      <text y={0.95} textAnchor="middle" fontSize={2.7} fontWeight={800} fill={color}>
        {text}
      </text>
    </g>
  );
}

export type FieldProps = {
  frame: Frame;
  /** 外野手の肩（'hidden' なら「？」） */
  arms?: Record<OutfielderId, Arm> | 'hidden';
  trail?: Vec[];
  coach?: 'send' | 'stop' | null;
  pulse?: boolean;
  /** 審判のコール */
  call?: Call | null;
  /** 打者走者の判断中：打者走者を光らせる */
  batterPulse?: boolean;
  /** 表示範囲（m）。省略時はグラウンド全体 */
  view?: { x0: number; x1: number; y0: number; y1: number };
  className?: string;
};

export const FULL_VIEW = { x0: -54, x1: 54, y0: -9, y1: 82 };

export function Field({ frame, trail, coach = null, pulse = false, call = null, arms, batterPulse = false, view = FULL_VIEW, className }: FieldProps) {
  const f = frame.fielders;
  const ball = frame.ball;
  const lift = ball.h * 0.45;
  return (
    <div className={`field-wrap ${className ?? ''}`}>
      <svg
        className="field"
        viewBox={`${view.x0} ${-view.y1} ${view.x1 - view.x0} ${view.y1 - view.y0}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="グラウンド"
      >
        <Ground />
        {trail && trail.length > 1 && (
          <polyline
            points={trail.map(P).join(' ')}
            fill="none"
            stroke="#fff"
            strokeWidth={0.45}
            strokeLinecap="round"
            opacity={0.55}
          />
        )}
        {(Object.keys(f) as FielderId[]).map((id) => (
          <Player key={id} p={f[id]} label={NUMBERS[id]} fill="var(--defense)" />
        ))}
        {arms &&
          (['LF', 'CF', 'RF'] as OutfielderId[]).map((id) => (
            <ArmLabel key={id} p={f[id]} arm={arms === 'hidden' ? 'hidden' : arms[id]} />
          ))}
        {batterPulse && (
          <circle cx={frame.batter.x} cy={-frame.batter.y} r={3.4} className="coach-pulse" fill="none" stroke="var(--accent)" strokeWidth={0.6} />
        )}
        <Player p={frame.batter} label="打" fill="var(--offense-2)" r={1.5} />
        <Player p={frame.runner} label="走" fill="var(--offense)" r={1.8} />
        <Coach signal={coach} pulse={pulse} />
        {/* ボール：影と本体 */}
        <ellipse cx={ball.x} cy={-ball.y} rx={0.55} ry={0.4} fill="#000" opacity={0.3} />
        <circle cx={ball.x} cy={-ball.y - lift} r={0.75 + ball.h * 0.03} fill="#fff" stroke="#b91c1c" strokeWidth={0.12} />
      </svg>
      {call && (
        <div className={`ump-call ump-${call.tone}`} key={call.text}>
          {call.text}
        </div>
      )}
    </div>
  );
}

