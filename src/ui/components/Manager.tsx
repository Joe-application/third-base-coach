import type { Grade } from '../../sim/evaluate';
import { R } from './Ruby';

/** 監督キャラ（オリジナルのシンプルなイラスト） */
export function Manager({ mood, text }: { mood: Grade; text: string }) {
  const mouth =
    mood === 'great' ? 'M-6 5 Q0 11 6 5' : mood === 'ok' ? 'M-5 6 Q0 8 5 6' : 'M-5 7 Q0 5 5 7';
  return (
    <div className="manager">
      <svg viewBox="-20 -22 40 42" className="manager-face" aria-hidden>
        <circle r={15} cy={2} fill="#f5c9a0" stroke="#8a5a3b" strokeWidth={0.8} />
        {/* 帽子 */}
        <path d="M-15 -3 Q-15 -19 0 -19 Q15 -19 15 -3 Z" fill="var(--cap)" />
        <rect x={-15} y={-5} width={30} height={3} fill="var(--cap)" />
        <path d="M-2 -3 L20 -3 Q20 1 10 1 L-2 1 Z" fill="var(--cap-dark)" />
        <text x={0} y={-8} textAnchor="middle" fontSize={8} fontWeight={900} fill="#fff">
          K
        </text>
        {/* 目 */}
        {mood === 'great' ? (
          <>
            <path d="M-8 1 Q-5.5 -2 -3 1" stroke="#333" strokeWidth={1.2} fill="none" />
            <path d="M3 1 Q5.5 -2 8 1" stroke="#333" strokeWidth={1.2} fill="none" />
          </>
        ) : (
          <>
            <circle cx={-5.5} cy={1} r={1.4} fill="#333" />
            <circle cx={5.5} cy={1} r={1.4} fill="#333" />
          </>
        )}
        <path d={mouth} stroke="#333" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        <ellipse cx={-10} cy={6} rx={2.2} ry={1.3} fill="#f19999" opacity={0.6} />
        <ellipse cx={10} cy={6} rx={2.2} ry={1.3} fill="#f19999" opacity={0.6} />
      </svg>
      <div className="bubble">
        <div className="bubble-name">
          <R>{'{監督|かんとく}'}</R>
        </div>
        <R>{text}</R>
      </div>
    </div>
  );
}
