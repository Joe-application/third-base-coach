import { useState } from 'react';
import { TUTORIAL_PAGES } from '../../game/messages';
import { R } from '../components/Ruby';
import { useApp } from '../state';
import { useStarter } from '../useStarter';

function Art({ kind }: { kind: (typeof TUTORIAL_PAGES)[number]['art'] }) {
  switch (kind) {
    case 'role':
      return (
        <svg viewBox="-34 -35 68 38" className="tut-art" aria-hidden>
          <polygon points="0,0 -16,-16 0,-32 16,-16" fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.5} />
          <circle cx={-16} cy={-16} r={2} fill="var(--offense)" />
          <circle cx={-23} cy={-12} r={2.4} fill="var(--coach)" />
          <text x={-23} y={-5} textAnchor="middle" fontSize={4} fill="currentColor">
            コーチャー
          </text>
          <path d="M-14 -14 Q-6 -4 -1 -1" stroke="var(--offense)" strokeDasharray="1.5 1" fill="none" strokeWidth={0.8} />
          <rect x={-1} y={-1} width={2} height={2} fill="#fff" transform="rotate(45)" />
        </svg>
      );
    case 'signs':
      return (
        <svg viewBox="-30 -14 60 26" className="tut-art" aria-hidden>
          <g transform="translate(-14,4)">
            <circle r={4} fill="var(--coach)" />
            <g>
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
              <line x1={0} y1={0} x2={0} y2={-9} stroke="var(--coach)" strokeWidth={1.8} strokeLinecap="round" />
            </g>
            <text y={12} textAnchor="middle" fontSize={4} fill="currentColor">
              回せ
            </text>
          </g>
          <g transform="translate(14,4)">
            <circle r={4} fill="var(--coach)" />
            <line x1={-2} y1={-2} x2={-5} y2={-9} stroke="var(--coach)" strokeWidth={1.8} strokeLinecap="round" />
            <line x1={2} y1={-2} x2={5} y2={-9} stroke="var(--coach)" strokeWidth={1.8} strokeLinecap="round" />
            <text y={12} textAnchor="middle" fontSize={4} fill="currentColor">
              止まれ
            </text>
          </g>
        </svg>
      );
    case 'outs':
      return (
        <div className="tut-outs">
          <div className="pill stop">0アウト：慎重に</div>
          <div className="pill">1アウト：ふつう</div>
          <div className="pill go">2アウト：積極的に</div>
        </div>
      );
    case 'points':
      return <div className="tut-emoji">⚾ 👀 🧤 💪 🏃</div>;
    case 'fast':
      return <div className="tut-emoji">⚡ はやく、はっきり！</div>;
  }
}

export function TutorialScreen() {
  const { dispatch } = useApp();
  const { start, busy } = useStarter();
  const [i, setI] = useState(0);
  const page = TUTORIAL_PAGES[i];
  const last = i === TUTORIAL_PAGES.length - 1;
  return (
    <div className="tutorial screen-scroll">
      <div className="tut-head">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })} aria-label="もどる">
          ✕
        </button>
        <span className="muted">
          {i + 1} / {TUTORIAL_PAGES.length}
        </span>
      </div>
      <div className="card tut-card">
        <h2>
          <R>{page.title}</R>
        </h2>
        <Art kind={page.art} />
        {page.body.map((b) => (
          <p key={b}>
            <R>{b}</R>
          </p>
        ))}
      </div>
      <div className="row center-row">
        <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          ◀ まえ
        </button>
        {last ? (
          <button className="primary" onClick={() => start('tutorial')} disabled={busy}>
            <R>{busy ? 'じゅんび{中|ちゅう}…' : 'やってみよう！（3{問|もん}）'}</R>
          </button>
        ) : (
          <button className="primary" onClick={() => setI(i + 1)}>
            つぎ ▶
          </button>
        )}
      </div>
    </div>
  );
}
