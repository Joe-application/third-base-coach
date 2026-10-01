import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RUNNER } from '../../sim/constants';
import { drawsFromSeed } from '../../sim/draws';
import { decisionWindow, scorePlay, windowOpen } from '../../sim/evaluate';
import { G_B_SECOND, leadGeom } from '../../sim/field';
import { frameAt, simulatePlay } from '../../sim/play';
import { runnerGAt } from '../../sim/runner';
import type { Command, CommandKind } from '../../sim/types';
import { ANOHI_STORY, BUTTONS, HINT, INTRO, LABEL, VOICE } from '../../game/messages';
import { applyPlay, comboMultiplier, isPlayGreat } from '../../game/progression';
import { appendHistory } from '../../game/storage';
import { sfx, unlockAudio, vibrate } from '../audio';
import { Field } from '../components/Field';
import { OutsDots } from '../components/OutsDots';
import { buildLabel } from '../../buildInfo';
import { R } from '../components/Ruby';
import { callAt, signalAt, trailAt } from '../playback';
import { useApp } from '../state';
import { playVoice } from '../voice';

type Phase = 'intro' | 'run' | 'done';

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
  const geom = useMemo(() => leadGeom(sc), [sc]);

  const [tl, setTl] = useState(() => simulatePlay(sc, [], draws));
  const tlRef = useRef(tl);
  const cmdsRef = useRef<Command[]>([]);
  const tRef = useRef(0);
  const skippedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [t, setT] = useState(0);
  /** 合図を出した瞬間のダメ出し（はやすぎ） */
  const [flash, setFlash] = useState<string | null>(null);

  const decided = tl.runner.accepted.some((c) => c.kind !== 'slide');
  const signal = signalAt(tl, t);

  /** callsOnly = スキップしたとき。審判のコールだけ鳴らす（音が重なりすぎないように） */
  const fireEvents = useCallback((prev: number, now: number, callsOnly = false) => {
    const cur = tlRef.current;
    for (const e of cur.events) {
      // 0秒ちょうどのイベント（打球音）も鳴らす
      if ((e.t <= prev && !(prev === 0 && e.t === 0)) || e.t > now) continue;
      if (callsOnly && e.kind !== 'call' && e.kind !== 'batterCall') continue;
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
      // 現実の試合は待ってくれない：締め切りを過ぎても合図がなければ、その場で ×（ブザー）
      const cur = tlRef.current;
      const undecided = !cur.runner.accepted.some((c) => c.kind !== 'slide');
      if (undecided && prev < win.tDeadline && nt >= win.tDeadline) {
        sfx.buzzer();
        vibrate([60, 40, 60]);
      }
      const b = cur.batter?.eligible ? cur.batter.trace : null;
      if (b && b.tDeadline !== null && b.accepted.length === 0 && prev < b.tDeadline && nt >= b.tDeadline) {
        sfx.buzzer();
        vibrate([60, 40, 60]);
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
  }, [phase, session.speed, win.tDeadline, fireEvents]);


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
    }, skippedRef.current ? 900 : 1300);
    return () => clearTimeout(id);
    // 1回だけ実行したい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const press = (kind: CommandKind | 'skip') => {
    if (phase === 'intro' || phase === 'done') return;
    if (kind === 'skip') {
      skip();
      return;
    }
    unlockAudio();
    const cmd: Command = { t: tRef.current, kind };
    const next = simulatePlay(sc, [...cmdsRef.current, cmd], draws);
    const acceptedList = kind === 'bsend' || kind === 'bstop' ? (next.batter?.eligible ? next.batter.trace.accepted : []) : next.runner.accepted;
    if (!acceptedList.some((c) => c.t === cmd.t && c.kind === kind)) return;
    cmdsRef.current = [...cmdsRef.current, cmd];
    tlRef.current = next;
    setTl(next);
    sfx.signal();
    if ((kind === 'send' || kind === 'stop') && !cmdsRef.current.slice(0, -1).some((c) => c.kind === 'send' || c.kind === 'stop')) {
      if (cmd.t < windowOpen(win, next.fielding.tCatch)) {
        // はやすぎ：合図はそのまま通るが、その場でダメ出し
        sfx.buzzer();
        setFlash('❌ はやすぎ！');
        setTimeout(() => setFlash(null), 1500);
      }
    }
    // コーチャーの声：押した瞬間に出す
    const lines = { send: VOICE.send, stop: VOICE.stop, slide: VOICE.slide, bsend: VOICE.bsend, bstop: VOICE.bstop }[kind];
    playVoice(kind, lines[0]);
    vibrate(kind === 'slide' ? 20 : 40);
  };

  const start = () => {
    unlockAudio();
    if (phase === 'intro') setPhase('run');
  };

  const frame = frameAt(tl.frames, Math.min(t, tl.duration));
  const rg = runnerGAt(tl.runner, t).g;
  const r = tl.runner;
  const active = phase === 'run';
  // 判断してよい時間：開く（捕球の少し前／三塁の手前12m）〜締め切り（三塁の手前3m）
  const tOpen = windowOpen(win, tl.fielding.tCatch);
  const beforeDeadline = t <= win.tDeadline;
  const inWindow = active && !decided && t >= tOpen && beforeDeadline;
  const leadLate = active && !decided && !beforeDeadline;
  // はやすぎても押せる（その場でダメ出し）。締め切りを過ぎたら押せない
  const canSend = active && !decided && beforeDeadline;
  const canStop =
    active && ((!decided && beforeDeadline) || (signal === 'send' && rg <= geom.gThird + RUNNER.changeMindLimit));
  // タイムラインは未来まで計算済みなので、「今」までに起きたかで判定する
  const autoStoppedNow = r.autoStopped && r.tHesitate !== null && t >= r.tHesitate + RUNNER.hesitateDuration;
  const canSlide = signal === 'send' && !r.slideCalled && rg < geom.gHome - RUNNER.slideDeadline && phase !== 'done';
  const hideTraits = session.hideTraits;

  // 打者走者（長打で二塁走者を回したとき）：二塁の手前 12m から、ボタンが打者走者用に変わる
  const bp = tl.batter?.eligible ? tl.batter : null;
  const bt = bp?.trace;
  const leadLocked = r.tHome !== null ? t >= r.tHome || rg > geom.gThird + RUNNER.changeMindLimit : false;
  const batterMode = !!bt && bt.tWindowStart !== null && t >= bt.tWindowStart && leadLocked && active;
  const bDecided = !!bt && bt.accepted.some((c) => c.t <= t);
  const bSignal = bt?.accepted.filter((c) => c.t <= t).at(-1)?.kind ?? null;
  const bAutoStoppedNow = !!bt && bt.autoStopped && bt.tHesitate !== null && t >= bt.tHesitate + RUNNER.hesitateDuration;
  const bg = bt ? runnerGAt(bt, t).g : 0;
  const bBeforeDeadline = !!bt && bt.tDeadline !== null && t <= bt.tDeadline;
  const bInWindow = batterMode && !bDecided && bBeforeDeadline;
  const batterLate = !!bt && active && !bDecided && bt.tDeadline !== null && t > bt.tDeadline;
  const canBSend = batterMode && !bDecided && bBeforeDeadline;
  const canBStop =
    batterMode && ((!bDecided && bBeforeDeadline) || (bSignal === 'bsend' && bg <= G_B_SECOND + RUNNER.changeMindLimit));

  // もう押せる合図がなければ、最後まで飛ばせる
  const leadDone =
    leadLate ||
    autoStoppedNow ||
    (decided && (signal === 'stop' || rg > geom.gThird + RUNNER.changeMindLimit || (r.tHome !== null && t >= r.tHome)));
  const batterDone =
    !bt ||
    batterLate ||
    bAutoStoppedNow ||
    (bDecided && (bSignal === 'bstop' || bg > G_B_SECOND + RUNNER.changeMindLimit || (bt.tHome !== null && t >= bt.tHome)));
  const canSkip = phase === 'run' && leadDone && batterDone && !canSlide && t < tl.duration;

  const skip = () => {
    const end = tlRef.current.duration;
    fireEvents(tRef.current, end, true);
    tRef.current = end;
    setT(end);
    skippedRef.current = true;
    setPhase('done');
  };

  const stopBtn = batterMode
    ? { kind: 'bstop' as const, text: BUTTONS.bstop, enabled: canBStop, glow: bInWindow, chosen: bSignal === 'bstop' }
    : { kind: 'stop' as const, text: BUTTONS.stop, enabled: canStop, glow: inWindow, chosen: signal === 'stop' };
  // もう押せる合図がなければ、右のボタンが「スキップ」になる（下の方にあって押しやすい）
  const sendBtn = canSkip
    ? { kind: 'skip' as const, text: BUTTONS.skip, enabled: true, glow: false, chosen: false }
    : batterMode
      ? { kind: 'bsend' as const, text: BUTTONS.bsend, enabled: canBSend, glow: bInWindow, chosen: bSignal === 'bsend' }
      : { kind: 'send' as const, text: BUTTONS.send, enabled: canSend, glow: inWindow, chosen: signal === 'send' };

  // 判断できる残り時間（タイミングの練習用のバー）
  const timingBar = inWindow
    ? Math.max(0, (win.tDeadline - t) / Math.max(0.3, win.tDeadline - tOpen))
    : bInWindow && bt?.tDeadline != null && bt.tWindowStart != null
      ? Math.max(0, (bt.tDeadline - t) / Math.max(0.3, bt.tDeadline - bt.tWindowStart))
      : null;
  const lateText = leadLate ? '❌ おそい！' : batterLate ? '❌ おそい！（バッターランナー）' : null;
  const showHint = session.hint && (inWindow || bInWindow);

  return (
    <div className="play">
      {showHint ? (
        // 見習いのうちは、判断のときに上のバーにヒントを出す（止まらない）
        <div className="hud hint-strip">
          <strong>
            <R>{bInWindow ? HINT.batterTitle : HINT.title}</R>
          </strong>
          {(bInWindow ? HINT.batterPoints(sc) : HINT.points(sc)).map((p) => (
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
            <R>{INTRO.runnerOn(sc)}</R>
          </span>
          {session.items.length > 1 && (
            <span className="hud-item muted">
              {session.index + 1}/{session.items.length}
            </span>
          )}
          {session.combo >= 2 && <span className="hud-item combo">🔥×{session.combo}</span>}
          <span className="hud-build">{buildLabel()}</span>
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
          {(flash || lateText) && <div className="judge-flash">{flash ?? lateText}</div>}
          {timingBar !== null && (
            <div className="timing-bar" aria-label="判断できる残り時間">
              <div style={{ width: `${Math.round(timingBar * 100)}%` }} />
            </div>
          )}
          {phase === 'intro' && <IntroCard onStart={start} storyMode={item.presetId === 'anohi'} />}
        </div>

        <button
          className={`decide send ${sendBtn.glow ? 'glow' : ''} ${sendBtn.chosen ? 'chosen' : ''} ${batterMode && !canSkip ? 'batter' : ''} ${canSkip ? 'skip' : ''}`}
          disabled={!sendBtn.enabled}
          onPointerDown={(e) => {
            e.preventDefault();
            press(sendBtn.kind);
          }}
        >
          <ButtonLabel text={sendBtn.text} caption={batterMode && !canSkip ? BUTTONS.batterCaption : undefined} />
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
                <R>{INTRO.runnerOn(sc)}</R>
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
