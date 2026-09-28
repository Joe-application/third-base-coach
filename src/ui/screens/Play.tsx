import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RUNNER } from '../../sim/constants';
import { drawsFromSeed } from '../../sim/draws';
import { decisionWindow, scorePlay } from '../../sim/evaluate';
import { G_B_SECOND, G_HOME, G_THIRD } from '../../sim/field';
import { frameAt, simulatePlay } from '../../sim/play';
import { runnerGAt } from '../../sim/runner';
import type { Command, CommandKind } from '../../sim/types';
import { ANOHI_STORY, BUTTONS, HINT, INTRO, LABEL, VOICE } from '../../game/messages';
import { applyPlay, comboMultiplier, isPlayGreat } from '../../game/progression';
import { appendHistory } from '../../game/storage';
import { sfx, unlockAudio, vibrate } from '../audio';
import { Field } from '../components/Field';
import { OutsDots } from '../components/OutsDots';
import { R } from '../components/Ruby';
import { callAt, signalAt, trailAt } from '../playback';
import { useApp } from '../state';
import { playVoice } from '../voice';

type Phase = 'intro' | 'run' | 'hint' | 'done';

function ButtonLabel({ text, caption }: { text: string; caption?: string }) {
  const [icon, ...rest] = text.split(' ');
  return (
    <span className="decide-label">
      {caption && <span className="decide-caption">{caption}</span>}
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
  /** 'lead' = 二塁走者のヒント、'batter' = 打者走者のヒント */
  const [hintFor, setHintFor] = useState<'lead' | 'batter'>('lead');
  const batterHintShownRef = useRef(false);

  const decided = tl.runner.accepted.some((c) => c.kind !== 'slide');
  const signal = signalAt(tl, t);

  const fireEvents = useCallback((prev: number, now: number) => {
    const cur = tlRef.current;
    for (const e of cur.events) {
      // 0秒ちょうどのイベント（打球音）も鳴らす
      if ((e.t <= prev && !(prev === 0 && e.t === 0)) || e.t > now) continue;
      switch (e.kind) {
        case 'contact':
          sfx.bat();
          playVoice('contact', VOICE.contact[0]);
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
        case 'autoStop':
          if (e.detail === 'batter') playVoice('bstop', VOICE.bstop[0]);
          else playVoice('autostop', VOICE.stop[1]);
          break;
        case 'cutToThird':
          sfx.glove();
          break;
        case 'batterCall':
          // 三塁のタッチプレー
          if (e.detail === 'third') {
            playVoice('safe', VOICE.safe);
            sfx.safe();
            sfx.cheer();
          } else {
            playVoice('out', VOICE.out);
            sfx.out();
            sfx.groan();
          }
          if (cur.batter?.third) vibrate(120);
          break;
        case 'call':
          // 審判のコール：クロスプレーの瞬間に「セーフ！」「アウト！」
          if (cur.result === 'safe') {
            playVoice('safe', VOICE.safe);
            sfx.safe();
            sfx.cheer();
          } else if (cur.result !== 'stop') {
            playVoice('out', VOICE.out);
            sfx.out();
            sfx.groan();
          }
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
        setHintFor('lead');
        setPhase('hint');
        return;
      }
      // 打者走者の判断ウィンドウでも一度止める
      const b = tlRef.current.batter;
      const bWin = b?.eligible ? b.trace.tWindowStart : null;
      if (session.hint && !batterHintShownRef.current && bWin !== null && b!.trace.accepted.length === 0 && nt >= bWin) {
        nt = bWin;
        batterHintShownRef.current = true;
        fireEvents(prev, nt);
        tRef.current = nt;
        setT(nt);
        setHintFor('batter');
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
      const great = isPlayGreat(score);
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
        batter: score.batter
          ? {
              decision: score.batter.decision,
              pSafe: score.batter.pSafe,
              threshold: score.batter.threshold,
              grade: score.batter.grade.grade,
              result: final.batter!.result,
            }
          : undefined,
      });
      if (great) {
        sfx.fanfare();
        playVoice('nice', VOICE.nice[0]);
      }
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
    const acceptedList = kind === 'bsend' || kind === 'bstop' ? (next.batter?.eligible ? next.batter.trace.accepted : []) : next.runner.accepted;
    if (!acceptedList.some((c) => c.t === cmd.t && c.kind === kind)) return;
    cmdsRef.current = [...cmdsRef.current, cmd];
    tlRef.current = next;
    setTl(next);
    sfx.signal();
    // コーチャーの声：押した瞬間に出す
    const lines = { send: VOICE.send, stop: VOICE.stop, slide: VOICE.slide, bsend: VOICE.bsend, bstop: VOICE.bstop }[kind];
    playVoice(kind, lines[0]);
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

  // 打者走者（長打で二塁走者を回したとき）：二塁の手前 12m から、ボタンが打者走者用に変わる
  const bp = tl.batter?.eligible ? tl.batter : null;
  const bt = bp?.trace;
  const leadLocked = r.tHome !== null ? t >= r.tHome || rg > G_THIRD + RUNNER.changeMindLimit : false;
  const batterMode = !!bt && bt.tWindowStart !== null && t >= bt.tWindowStart && leadLocked && active;
  const bDecided = !!bt && bt.accepted.some((c) => c.t <= t);
  const bSignal = bt?.accepted.filter((c) => c.t <= t).at(-1)?.kind ?? null;
  const bAutoStoppedNow = !!bt && bt.autoStopped && bt.tHesitate !== null && t >= bt.tHesitate + RUNNER.hesitateDuration;
  const bg = bt ? runnerGAt(bt, t).g : 0;
  const bInWindow = batterMode && !bDecided && !bAutoStoppedNow;
  const canBSend = batterMode && !bDecided && !bAutoStoppedNow;
  const canBStop =
    batterMode && ((!bDecided && !bAutoStoppedNow) || (bSignal === 'bsend' && bg <= G_B_SECOND + RUNNER.changeMindLimit));

  const stopBtn = batterMode
    ? { kind: 'bstop' as const, text: BUTTONS.bstop, enabled: canBStop, glow: bInWindow, chosen: bSignal === 'bstop' }
    : { kind: 'stop' as const, text: BUTTONS.stop, enabled: canStop, glow: inWindow, chosen: signal === 'stop' };
  const sendBtn = batterMode
    ? { kind: 'bsend' as const, text: BUTTONS.bsend, enabled: canBSend, glow: bInWindow, chosen: bSignal === 'bsend' }
    : { kind: 'send' as const, text: BUTTONS.send, enabled: canSend, glow: inWindow, chosen: signal === 'send' };

  return (
    <div className="play">
      {phase === 'hint' ? (
        // フィールドを隠さないように、上のバーにヒントを出す
        <div className="hud hint-strip" onClick={start} role="button">
          <strong>
            ⏸ <R>{hintFor === 'batter' ? HINT.batterTitle : HINT.title}</R>
          </strong>
          {(hintFor === 'batter' ? HINT.batterPoints(sc) : HINT.points(sc)).map((p) => (
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
        <span className="hud-item">
          <R>{INTRO.runner}</R>
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
          className={`decide stop ${stopBtn.glow ? 'glow' : ''} ${stopBtn.chosen ? 'chosen' : ''} ${batterMode ? 'batter' : ''}`}
          disabled={!stopBtn.enabled}
          onPointerDown={(e) => {
            e.preventDefault();
            press(stopBtn.kind);
          }}
        >
          <ButtonLabel text={stopBtn.text} caption={batterMode ? BUTTONS.batterCaption : undefined} />
        </button>

        <div className="play-field">
          <Field
            frame={frame}
            trail={trailAt(tl, t)}
            coach={signal}
            pulse={inWindow || bInWindow}
            batterPulse={bInWindow}
            call={callAt(tl, t)}
            outs={sc.outs}
            arms={hideTraits ? 'hidden' : sc.outfieldArm}
            speeds={hideTraits ? 'hidden' : { runner: sc.runnerSpeed, batter: sc.batterSpeed ?? 'normal' }}
          />
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
          className={`decide send ${sendBtn.glow ? 'glow' : ''} ${sendBtn.chosen ? 'chosen' : ''} ${batterMode ? 'batter' : ''}`}
          disabled={!sendBtn.enabled}
          onPointerDown={(e) => {
            e.preventDefault();
            press(sendBtn.kind);
          }}
        >
          <ButtonLabel text={sendBtn.text} caption={batterMode ? BUTTONS.batterCaption : undefined} />
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
              <span>
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
              </span>
            </div>
            <div className="muted small-text">
              <R>
                {hideTraits
                  ? '{足|あし}と{肩|かた}はかくれているよ。{外野手|がいやしゅ}の{動|うご}きを{見|み}て{判断|はんだん}しよう'
                  : '⬆ {外野手|がいやしゅ}の{肩|かた}とランナーの{足|あし}は、{選手|せんしゅ}の{下|した}に{書|か}いてあるよ'}
              </R>
            </div>
          </div>
          <p className="tap">
            <R>{INTRO.tapToStart}</R>
          </p>
        </div>
      </div>
    );
  }
}
