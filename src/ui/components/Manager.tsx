import type { ManagerMood } from '../../game/messages';
import { R } from './Ruby';

// 監督キャラ：オリジナルのイラスト（実在の人物の写真は使わない）。
// 短い黒髪・日焼けした肌・太い眉・まぶたの重い目・がっしりした顔、という特徴だけを取り入れている。

const SKIN = '#c98a5a';
const SKIN_DARK = '#8f5a34';
const HAIR = '#1c1714';
const LINE = '#2a1d14';

function Brows({ mood }: { mood: ManagerMood }) {
  // 眉の角度：怒るほど内側が下がる
  const tilt = { smile: -1.2, neutral: 0, annoyed: 1.6, furious: 3.4 }[mood];
  const lift = mood === 'smile' ? -0.8 : 0;
  return (
    <g fill={LINE}>
      <path d={`M-10.5 ${-0.5 + lift} Q-7 ${-2.6 + lift} -2.6 ${-0.8 + tilt + lift} L-2.8 ${0.8 + tilt + lift} Q-7 ${-0.8 + lift} -10.3 ${1.2 + lift} Z`} />
      <path d={`M10.5 ${-0.5 + lift} Q7 ${-2.6 + lift} 2.6 ${-0.8 + tilt + lift} L2.8 ${0.8 + tilt + lift} Q7 ${-0.8 + lift} 10.3 ${1.2 + lift} Z`} />
    </g>
  );
}

function Eyes({ mood }: { mood: ManagerMood }) {
  switch (mood) {
    case 'smile':
      return (
        <g stroke={LINE} strokeWidth={1.3} fill="none" strokeLinecap="round">
          <path d="M-9 4.2 Q-6.3 1.6 -3.6 4.2" />
          <path d="M3.6 4.2 Q6.3 1.6 9 4.2" />
        </g>
      );
    case 'neutral':
      // まぶたの重い、眠そうな目
      return (
        <g>
          <ellipse cx={-6.3} cy={4} rx={2.3} ry={1.3} fill="#fff" />
          <ellipse cx={6.3} cy={4} rx={2.3} ry={1.3} fill="#fff" />
          <circle cx={-6.1} cy={4.3} r={1} fill={LINE} />
          <circle cx={6.5} cy={4.3} r={1} fill={LINE} />
          <path d="M-8.8 3.6 Q-6.3 2.4 -3.8 3.6" stroke={LINE} strokeWidth={1.1} fill="none" />
          <path d="M3.8 3.6 Q6.3 2.4 8.8 3.6" stroke={LINE} strokeWidth={1.1} fill="none" />
        </g>
      );
    case 'annoyed':
      // 細めた目
      return (
        <g>
          <path d="M-9 4.4 Q-6.3 3 -3.6 3.6 L-3.8 4.6 Q-6.3 5.2 -9 4.4 Z" fill="#fff" stroke={LINE} strokeWidth={0.8} />
          <path d="M9 4.4 Q6.3 3 3.6 3.6 L3.8 4.6 Q6.3 5.2 9 4.4 Z" fill="#fff" stroke={LINE} strokeWidth={0.8} />
          <circle cx={-5.8} cy={4.2} r={0.8} fill={LINE} />
          <circle cx={5.8} cy={4.2} r={0.8} fill={LINE} />
        </g>
      );
    case 'furious':
      // 見開いてにらむ目（黒目が小さい）
      return (
        <g>
          <ellipse cx={-6.3} cy={4.3} rx={2.6} ry={2} fill="#fff" stroke={LINE} strokeWidth={0.8} />
          <ellipse cx={6.3} cy={4.3} rx={2.6} ry={2} fill="#fff" stroke={LINE} strokeWidth={0.8} />
          <circle cx={-5.9} cy={4.4} r={0.7} fill={LINE} />
          <circle cx={5.9} cy={4.4} r={0.7} fill={LINE} />
        </g>
      );
  }
}

function Mouth({ mood }: { mood: ManagerMood }) {
  switch (mood) {
    case 'smile':
      return (
        <g>
          <path d="M-6 9.5 Q0 9 6 9.5 Q5 15.5 0 15.6 Q-5 15.5 -6 9.5 Z" fill="#7a2418" stroke={LINE} strokeWidth={0.8} />
          <path d="M-5.4 9.7 Q0 9.3 5.4 9.7 L5 11.2 Q0 10.9 -5 11.2 Z" fill="#fff" />
        </g>
      );
    case 'neutral':
      return <path d="M-4.2 11.6 L4.2 11.6" stroke={LINE} strokeWidth={1.2} strokeLinecap="round" />;
    case 'annoyed':
      return <path d="M-4.6 12.6 Q-1 10.8 4.2 12" stroke={LINE} strokeWidth={1.3} fill="none" strokeLinecap="round" />;
    case 'furious':
      // 大声でどなる口
      return (
        <g>
          <path d="M-6.5 10 Q0 7.8 6.5 10 L5.2 16.5 Q0 18.2 -5.2 16.5 Z" fill="#5c140d" stroke={LINE} strokeWidth={0.9} />
          <path d="M-5.8 10.3 Q0 8.5 5.8 10.3 L5.5 11.8 Q0 10.4 -5.5 11.8 Z" fill="#fff" />
          <path d="M-4.6 16.2 Q0 17.4 4.6 16.2 L4.2 15.2 Q0 16.2 -4.2 15.2 Z" fill="#fff" />
          <ellipse cx={0} cy={15} rx={2.6} ry={1.1} fill="#c2413a" />
        </g>
      );
  }
}

/** 怒りマーク（こめかみの「💢」） */
function AngerMark({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke="#e11d48" strokeWidth={1.1} fill="none" strokeLinecap="round">
      <path d="M-2.4 -0.6 Q-0.6 -0.6 -0.6 -2.4" />
      <path d="M2.4 -0.6 Q0.6 -0.6 0.6 -2.4" />
      <path d="M-2.4 0.6 Q-0.6 0.6 -0.6 2.4" />
      <path d="M2.4 0.6 Q0.6 0.6 0.6 2.4" />
    </g>
  );
}

export function ManagerFace({ mood, size = 80 }: { mood: ManagerMood; size?: number }) {
  const angry = mood === 'furious';
  return (
    <svg viewBox="-21 -24 42 47" width={size} height={size} className={`manager-face mood-${mood}`} aria-hidden>
      {/* 耳 */}
      <ellipse cx={-14.8} cy={4} rx={2.4} ry={3.6} fill={SKIN} stroke={SKIN_DARK} strokeWidth={0.6} />
      <ellipse cx={14.8} cy={4} rx={2.4} ry={3.6} fill={SKIN} stroke={SKIN_DARK} strokeWidth={0.6} />
      {/* 顔：あごの張った、がっしりした輪郭 */}
      <path
        d="M-14 -5 Q-14.8 10 -10.5 16 Q-6 21 0 21.2 Q6 21 10.5 16 Q14.8 10 14 -5 Z"
        fill={SKIN}
        stroke={SKIN_DARK}
        strokeWidth={0.8}
      />
      {/* 怒ると顔が赤くなる */}
      {mood !== 'smile' && mood !== 'neutral' && (
        <path
          d="M-14 -5 Q-14.8 10 -10.5 16 Q-6 21 0 21.2 Q6 21 10.5 16 Q14.8 10 14 -5 Z"
          fill="#dc2626"
          opacity={angry ? 0.32 : 0.12}
        />
      )}
      {/* 帽子の下から出ている短い黒髪（もみあげ） */}
      <path d="M-14.4 -4.5 L-14.6 3.8 Q-13.4 1 -12.6 -1 L-11.8 -4.5 Z" fill={HAIR} />
      <path d="M14.4 -4.5 L14.6 3.8 Q13.4 1 12.6 -1 L11.8 -4.5 Z" fill={HAIR} />
      <path d="M-13.5 -4.6 Q-11 -1.6 -8.5 -4.6 Q-6 -1.8 -3.5 -4.6 Z" fill={HAIR} />
      <path d="M13.5 -4.6 Q11 -1.6 8.5 -4.6 Q6 -1.8 3.5 -4.6 Z" fill={HAIR} />
      {/* 帽子 */}
      <path d="M-15.5 -5.5 Q-15.5 -23 0 -23 Q15.5 -23 15.5 -5.5 Z" fill="var(--cap)" />
      <path d="M-17 -6.4 Q0 -3.2 17 -6.4 L17 -4.8 Q0 -1.6 -17 -4.8 Z" fill="var(--cap-dark)" />
      <text x={0} y={-11} textAnchor="middle" fontSize={9} fontWeight={900} fill="#fff" fontFamily="sans-serif">
        E
      </text>
      <g transform="translate(0 1.6)">
      <Brows mood={mood} />
      {/* 眉間のしわ */}
      {(mood === 'annoyed' || angry) && (
        <g stroke={SKIN_DARK} strokeWidth={0.7} strokeLinecap="round">
          <path d="M-1 0.4 L-0.6 2.6" />
          <path d="M1 0.4 L0.6 2.6" />
        </g>
      )}
      <Eyes mood={mood} />
      {/* 鼻とほうれい線（年季の入った顔） */}
      <path d="M0.2 4.6 Q1.8 7.6 0.4 8.6 Q-0.8 8.8 -1.6 8.2" stroke={SKIN_DARK} strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <path d="M-5.2 7.6 Q-7 10.4 -6.4 13.4" stroke={SKIN_DARK} strokeWidth={0.6} fill="none" opacity={0.7} />
      <path d="M5.2 7.6 Q7 10.4 6.4 13.4" stroke={SKIN_DARK} strokeWidth={0.6} fill="none" opacity={0.7} />
      {/* ひげのそり跡 */}
      <path
        d="M-9 13 Q-5 18.6 0 18.8 Q5 18.6 9 13 Q5 16.6 0 16.8 Q-5 16.6 -9 13 Z"
        fill="#3b2a1e"
        opacity={0.14}
      />
      <Mouth mood={mood} />
      </g>
      {mood === 'annoyed' && <AngerMark x={10.5} y={-6.5} s={0.8} />}
      {angry && (
        <>
          <AngerMark x={10.5} y={-7} s={1.3} />
          <AngerMark x={-12} y={-9} s={0.9} />
        </>
      )}
    </svg>
  );
}

/** 監督キャラとひとこと */
export function Manager({ mood, text }: { mood: ManagerMood; text: string }) {
  return (
    <div className={`manager mood-${mood}`}>
      <ManagerFace mood={mood} />
      <div className="bubble">
        <div className="bubble-name">
          <R>{'{監督|かんとく}'}</R>
        </div>
        <R>{text}</R>
      </div>
    </div>
  );
}
