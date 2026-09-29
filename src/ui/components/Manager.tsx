import type { Grade } from '../../sim/evaluate';
import { R } from './Ruby';

/** 監督キャラ（オリジナルのシンプルなイラスト） */
export function Manager({ mood, text }: { mood: Grade; text: string }) {
  const mouth =
    mood === 'great' ? 'M-6 7 Q0 13 6 7' : mood === 'ok' ? 'M-5 8 Q0 10 5 8' : 'M-5 9 Q0 7 5 9';
  return (
    <div className="manager">
      <svg viewBox="-20 -22 40 42" className="manager-face" aria-hidden>
        <circle r={15} cy={2} fill="#f5c9a0" stroke="#8a5a3b" strokeWidth={0.8} />
        {/* 帽子 */}
        <path d="M-15 -3 Q-15 -19 0 -19 Q15 -19 15 -3 Z" fill="var(--cap)" />
        {/* つば：左右対称にして、目にかからない高さに置く */}
        <path d="M-16 -3.5 Q0 -0.5 16 -3.5 L16 -2 Q0 1.5 -16 -2 Z" fill="var(--cap-dark)" />
        <text x={0} y={-8} textAnchor="middle" fontSize={8} fontWeight={900} fill="#fff">
          E
        </text>
        {/* 目 */}
        {mood === 'great' ? (
          <>
            <path d="M-8 4 Q-5.5 1 -3 4" stroke="#333" strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <path d="M3 4 Q5.5 1 8 4" stroke="#333" strokeWidth={1.2} fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx={-5.5} cy={3.5} r={1.4} fill="#333" />
            <circle cx={5.5} cy={3.5} r={1.4} fill="#333" />
          </>
        )}
        <path d={mouth} stroke="#333" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        <ellipse cx={-10} cy={8} rx={2.2} ry={1.3} fill="#f19999" opacity={0.6} />
        <ellipse cx={10} cy={8} rx={2.2} ry={1.3} fill="#f19999" opacity={0.6} />
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
