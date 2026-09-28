import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RUNNER } from '../../sim/constants';
import { drawsFromSeed } from '../../sim/draws';
import { decisionWindow, scorePlay } from '../../sim/evaluate';
import { G_HOME, G_THIRD } from '../../sim/field';
import { frameAt, simulatePlay } from '../../sim/play';
import { runnerGAt } from '../../sim/runner';
import type { Command, CommandKind, PlayResult } from '../../sim/types';
import { ANOHI_STORY, BUTTONS, HINT, INTRO, LABEL } from '../../game/messages';
import { applyPlay, comboMultiplier } from '../../game/progression';
import { appendHistory } from '../../game/storage';
import { sfx, unlockAudio, vibrate } from '../audio';
import { Field } from '../components/Field';
import { OutsDots } from '../components/OutsDots';
import { R } from '../components/Ruby';
import { signalAt, trailAt } from '../playback';
import { useApp } from '../state';

type Phase = 'intro' | 'run' | 'hint' | 'done';

function ButtonLabel({ text }: { text: string }) {
  const [icon, ...rest] = text.split(' ');
  return (
    <span className="decide-label">
      <span className="decide-icon">{icon}</span>
      <R>{rest.join(' ')}</R>
    </span>
  );
}

export function PlayScreen() {
  const { state, dispatch } = useApp();
  const session = state.session!;
  const item = session.items[session.index];
  const sc = item.scenario;
  const draws = useMemo(() => drawsFromSeed(sc.seed), [sc.seed]);
  const win = useMemo(() => decisionWindow(sc), [sc]);

  const [tl, setTl] = useState(() => simulatePlay(sc, [], draws));
  const tlRef = useRef(tl);
  const cmdsRef = useRef<Command[]>([]);
  const tRef = useRef(0);
  const hintShownRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [t, setT] = useState(0);
  const [call, setCall] = useState<PlayResult | null>(null);

  const decided = tl.runner.accepted.some((c) => c.kind !== 'slide');
  const signal = signalAt(tl, t);

  const fireEvents = useCallback((prev: number, now: number) => {
    const cur = tlRef.current;
    for (const e of cur.events) {
      if (e.t <= prev || e.t > now) continue;
      switch (e.kind) {
        case 'contact':
          sfx.bat();
          break;
        case 'catch':
        case 'relayCatch':
          sfx.glove();
          break;
        case 'ballHome':
          if (!cur.throwPlan.wild) sfx.glove();
          break;
        case 'hesitate':
          vibrate([20, 40, 20]);
          break;
        case 'result':
          setCall(cur.result);
          if (cur.result === 'safe') sfx.safe();
          else if (cur.result !== 'stop') sfx.out();
          if (cur.crossPlay || cur.thirdPlay) vibrate(120);
          break;
      }
    }
  }, []);

  // 再生ループ
  useEffect(() => {
    if (phase !== 'run') return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * session.speed;
      last = now;
      const prev = tRef.current;
      let nt = prev + dt;
      const undecided = !tlRef.current.runner.accepted.some((c) => c.kind !== 'slide');
      if (session.hint && !hintShownRef.current && undecided && nt >= win.tWindowStart) {
        nt = win.tWindowStart;
        hintShownRef.current = true;
        fireEvents(prev, nt);
        tRef.current = nt;
        setT(nt);
        setPhase('hint');
        return;
      }
      fireEvents(prev, nt);
      tRef.current = nt;
      setT(nt);
      if (nt >= tlRef.current.duration) {
        setPhase('done');
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, session.speed, session.hint, win.tWindowStart, fireEvents]);


  // 終わったら採点して結果画面へ
  useEffect(() => {
    if (phase !== 'done') return;
    const id = setTimeout(() => {
      const final = tlRef.current;
      const score = scorePlay(final, draws, {
        thresholds: state.settings.thresholds,
        situational: state.settings.situational,
      });
      const great = score.grade.grade === 'great';
      const combo = great ? session.combo + 1 : 0;
      const multiplier = comboMultiplier(combo);
      const points = Math.max(0, Math.round(score.total * multiplier));
      const profile = state.profile!;
      const { profile: updated, newBadges } = applyPlay(profile, score, final, { combo, presetId: item.presetId });
      appendHistory(profile.id, {
        mode: session.mode,
        scenarioId: item.presetId,
        scenario: sc,
        seed: sc.seed,
        decision: score.decision,
        decisionTime: score.decisionTime,
        pSafe: score.pSafe,
        threshold: score.threshold,
        grade: score.grade.grade,
        verdict: score.grade.verdict,
        timing: score.timing,
        result: final.result,
        score: points,
        playedAt: Date.now(),
      });
      if (great) sfx.fanfare();
      dispatch({
        type: 'recordPlay',
        profile: updated,
        record: { item, timeline: final, draws, score, multiplier, points, combo, newBadges },
      });
    }, 1300);
    return () => clearTimeout(id);
    // 1回だけ実行したい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const press = (kind: CommandKind) => {
    if (phase === 'intro' || phase === 'done') return;
    unlockAudio();
    const cmd: Command = { t: tRef.current, kind };
    const next = simulatePlay(sc, [...cmdsRef.current, cmd], draws);
    if (!next.runner.accepted.some((c) => c.t === cmd.t && c.kind === kind)) return;
    cmdsRef.current = [...cmdsRef.current, cmd];
    tlRef.current = next;
    setTl(next);
    sfx.signal();
    vibrate(kind === 'slide' ? 20 : 40);
    if (phase === 'hint') setPhase('run');
  };

  const start = () => {
    unlockAudio();
    if (phase === 'intro') setPhase('run');
    else if (phase === 'hint') setPhase('run');
  };

  const frame = frameAt(tl.frames, Math.min(t, tl.duration));
  const rg = runnerGAt(tl.runner, t).g;
  const inWindow = t >= win.tWindowStart && !decided && phase !== 'intro';
  const r = tl.runner;
  // タイムラインは未来まで計算済みなので、「今」までに起きたかで判定する
  const autoStoppedNow = r.autoStopped && r.tHesitate !== null && t >= r.tHesitate + RUNNER.hesitateDuration;
  const active = phase === 'run' || phase === 'hint';
  const canSend = active && !decided && !autoStoppedNow;
  const canStop =
    active && ((!decided && !autoStoppedNow) || (signal === 'send' && rg <= G_THIRD + RUNNER.changeMindLimit));
  const canSlide = signal === 'send' && !r.slideCalled && rg < G_HOME - RUNNER.slideDeadline && phase !== 'done';
  const hideTraits = session.hideTraits;

  return (
    <div className="play">
      {phase === 'hint' ? (
        // フィールドを隠さないように、上のバーにヒントを出す
        <div className="hud hint-strip" onClick={start} role="button">
          <strong>
            ⏸ <R>{HINT.title}</R>
          </strong>
          {HINT.points(sc, hideTraits).map((p) => (
            <span key={p} className="hint-item">
              <R>{p}</R>
            </span>
          ))}
        </div>
      ) : (
      <div className="hud">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })} aria-label="やめる">
          ✕
        </button>
        <OutsDots outs={sc.outs} />
        <span className="hud-item">
          <R>{INTRO.runner}</R>
        </span>
        <span className="hud-item">
          <R>{`{足|あし}:${hideTraits ? LABEL.hidden : LABEL.runnerSpeed[sc.runnerSpeed]}`}</R>
        </span>
        <span className="hud-item hide-narrow">
          <R>{`{肩|かた} L:${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.LF]} C:${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.CF]} R:${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.RF]}`}</R>
        </span>
        {session.items.length > 1 && (
          <span className="hud-item muted">
            {session.index + 1}/{session.items.length}
          </span>
        )}
        {session.combo >= 2 && <span className="hud-item combo">🔥×{session.combo}</span>}
      </div>
      )}

      <div className="play-stage">
        <button
          className={`decide stop ${inWindow ? 'glow' : ''} ${signal === 'stop' ? 'chosen' : ''}`}
          disabled={!canStop}
          onPointerDown={(e) => {
            e.preventDefault();
            press('stop');
          }}
        >
          <ButtonLabel text={BUTTONS.stop} />
        </button>

        <div className="play-field">
          <Field frame={frame} trail={trailAt(tl, t)} coach={signal} pulse={inWindow} call={call} />
          {canSlide && (
            <button
              className="slide-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                press('slide');
              }}
            >
              {BUTTONS.slide}
            </button>
          )}
          {r.slideCalled && signal === 'send' && phase !== 'done' && <div className="slide-note">⬇ スライディング！</div>}
          {phase === 'intro' && <IntroCard onStart={start} storyMode={item.presetId === 'anohi'} />}
        </div>

        <button
          className={`decide send ${inWindow ? 'glow' : ''} ${signal === 'send' ? 'chosen' : ''}`}
          disabled={!canSend}
          onPointerDown={(e) => {
            e.preventDefault();
            press('send');
          }}
        >
          <ButtonLabel text={BUTTONS.send} />
        </button>
      </div>
    </div>
  );

  function IntroCard({ onStart, storyMode }: { onStart: () => void; storyMode: boolean }) {
    return (
      <div className="overlay intro" onClick={onStart}>
        <div className="card">
          {storyMode && (
            <p className="story">
              <R>{ANOHI_STORY}</R>
            </p>
          )}
          <div className="intro-grid">
            <div className="intro-outs">
              <OutsDots outs={sc.outs} big />
              <strong>{LABEL.outs(sc.outs)}</strong>
            </div>
            <div>
              <R>{INTRO.runner}</R>
              {sc.inning !== undefined && (
                <>
                  {' ・ '}
                  <R>{INTRO.inning(sc.inning)}</R>
                </>
              )}
              {sc.scoreDiff !== undefined && (
                <>
                  {' ・ '}
                  <R>{INTRO.score(sc.scoreDiff)}</R>
                </>
              )}
            </div>
            <div>
              <R>{`${INTRO.runnerSpeed}：${hideTraits ? LABEL.hidden : LABEL.runnerSpeed[sc.runnerSpeed]}`}</R>
            </div>
            <div>
              <R>
                {`${INTRO.arms}：レフト ${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.LF]} / センター ${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.CF]} / ライト ${hideTraits ? '？' : LABEL.arm[sc.outfieldArm.RF]}`}
              </R>
            </div>
            {sc.outfieldDepth !== 'normal' && (
              <div>
                <R>{`{外野|がいや}：${LABEL.depth[sc.outfieldDepth]}`}</R>
              </div>
            )}
            {hideTraits && (
              <div className="muted small-text">
                <R>{'{足|あし}と{肩|かた}はかくれているよ。{外野手|がいやしゅ}の{動|うご}きを{見|み}て{判断|はんだん}しよう'}</R>
              </div>
            )}
          </div>
          <p className="tap">
            <R>{INTRO.tapToStart}</R>
          </p>
        </div>
      </div>
    );
  }
}
