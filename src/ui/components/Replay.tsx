import { useEffect, useRef, useState } from 'react';
import { frameAt, type PlayTimeline } from '../../sim/play';
import { Field } from './Field';
import { signalAt, trailAt } from '../playback';

/** 計算済みのプレーを再生する（リプレイ・もしも再生） */
export function Replay({ tl, title, onClose }: { tl: PlayTimeline; title: React.ReactNode; onClose?: () => void }) {
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      tRef.current = Math.min(tl.duration, tRef.current + dt);
      setT(tRef.current);
      if (tRef.current >= tl.duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl]);

  const restart = (s: number) => {
    tRef.current = 0;
    setT(0);
    setSpeed(s);
    setPlaying(true);
  };

  const tCall = tl.events.find((e) => e.kind === 'call')?.t ?? tl.duration - 0.8;
  const showCall = t >= tCall;
  return (
    <div className="replay">
      <div className="replay-head">
        <strong>{title}</strong>
        <span className="muted">{t.toFixed(1)}秒</span>
        {onClose && (
          <button className="ghost small" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        )}
      </div>
      <Field
        frame={frameAt(tl.frames, Math.min(t, tl.duration))}
        trail={trailAt(tl, t)}
        coach={signalAt(tl, t)}
        call={showCall ? tl.result : null}
        arms={tl.scenario.outfieldArm}
        className="replay-field"
      />
      <div className="row">
        <button onClick={() => restart(1)}>▶ 等速</button>
        <button onClick={() => restart(0.4)}>🐢 スロー</button>
      </div>
    </div>
  );
}
