import { thresholdBreakdown } from '../../sim/evaluate';
import { useMemo, useState } from 'react';
import { simulatePlay } from '../../sim/play';
import type { Command } from '../../sim/types';
import {
  BATTER_RESULT,
  batterChecklist,
  batterMessage,
  checklist,
  COMBO_TEXT,
  GRADE_MARK,
  managerComment,
  managerMood,
  RESULT_CALL,
  resultMessage,
  timingMessage,
  TIMING_LABEL,
  VERDICT_LABEL,
} from '../../game/messages';
import { Manager } from '../components/Manager';
import { Replay } from '../components/Replay';
import { R } from '../components/Ruby';
import { SafeMeter } from '../components/SafeMeter';
import { TimelineChart } from '../components/TimelineChart';
import { replayItem } from '../sessions';
import { useApp } from '../state';

export function ResultScreen() {
  const { state, dispatch } = useApp();
  const session = state.session!;
  const rec = session.records[session.records.length - 1];
  const { score, timeline: tl, draws } = rec;
  const [view, setView] = useState<'none' | 'replay' | 'whatif'>('none');

  const opposite = score.decision === 'send' ? 'stop' : 'send';
  const whatIf = useMemo(() => {
    const cmds: Command[] = [{ t: score.decisionTime, kind: opposite }];
    return simulatePlay(tl.scenario, cmds, draws);
  }, [tl, draws, score.decisionTime, opposite]);

  const g = score.grade.grade;
  const msg =
    timingMessage(score.timing, score.pSafe, score.threshold) ??
    resultMessage(g, score.decision, tl.result, tl.scenario.outs, score.pSafe);
  const mood = managerMood(score);
  const noSignal = !tl.runner.accepted.some((c) => c.kind !== 'slide');
  const comment = managerComment(mood, score.timing, tl, tl.scenario.seed);
  const br = thresholdBreakdown(tl.scenario, { thresholds: state.settings.thresholds });
  const items = checklist(tl, br, score.timing);
  const bs = score.batter;
  const bItems = bs ? batterChecklist(tl, bs.threshold, bs.timing) : [];
  const isLast = session.index + 1 >= session.items.length;
  const repeatable = session.mode === 'free' || session.mode === 'anohi';

  const again = () => {
    const items = [...session.items];
    items[session.index] = replayItem(items[session.index]);
    dispatch({ type: 'replaceItems', items });
    dispatch({ type: 'retry' });
  };

  const whatIfTitle =
    opposite === 'send' ? 'もし{回|まわ}していたら…' : 'もし{止|と}めていたら…';

  return (
    <div className="result screen-scroll">
      <div className="result-grid">
        <section className="result-main">
          <div className={`grade grade-${g}`}>
            <span className="grade-mark">{GRADE_MARK[g]}</span>
            <div>
              <div className="grade-verdict">
                <R>{VERDICT_LABEL[score.grade.verdict]}</R>
              </div>
              <div className="muted">
                <R>{`あなたの{判断|はんだん}：${noSignal ? '{合図|あいず}なし' : score.decision === 'send' ? '{回|まわ}れ' : '{止|と}まれ'}${score.timing === 'late' ? '（おそい）' : score.timing === 'early' ? '（はやすぎ）' : ''} → ${RESULT_CALL[tl.result]}`}</R>
              </div>
            </div>
          </div>
          <p className="result-msg">
            <R>{msg}</R>
          </p>

          <div className="score-box">
            <div>
              <span>
                <R>{'{判断|はんだん}'}</R>
              </span>
              <b>+{score.grade.points}</b>
            </div>
            <div>
              <span>
                <R>{TIMING_LABEL[score.timing]}</R>
              </span>
              <b>{score.timingPoints >= 0 ? `+${score.timingPoints}` : score.timingPoints}</b>
            </div>
            {score.resultPoints > 0 && (
              <div>
                <span>
                  <R>{'{生還|せいかん}'}</R>
                </span>
                <b>+{score.resultPoints}</b>
              </div>
            )}
            {score.slidePoints > 0 && (
              <div>
                スライディング <b>+{score.slidePoints}</b>
              </div>
            )}
            {rec.multiplier > 1 && (
              <div className="combo-line">
                <span>
                  <R>{COMBO_TEXT(rec.combo)}</R>
                </span>
                <b>×{rec.multiplier}</b>
              </div>
            )}
            {bs && (
              <>
                <div className="score-sub">
                  <span>
                    <R>{`バッターランナー ${GRADE_MARK[bs.grade.grade]}`}</R>
                  </span>
                  <b>+{bs.grade.points}</b>
                </div>
                {bs.timingPoints !== 0 && (
                  <div className="score-sub">
                    <span>
                      <R>{`└ ${TIMING_LABEL[bs.timing]}`}</R>
                    </span>
                    <b>{bs.timingPoints > 0 ? `+${bs.timingPoints}` : bs.timingPoints}</b>
                  </div>
                )}
                {bs.resultPoints > 0 && (
                  <div className="score-sub">
                    <span>
                      <R>{'└ {三塁|さんるい}セーフ'}</R>
                    </span>
                    <b>+{bs.resultPoints}</b>
                  </div>
                )}
              </>
            )}
            <div className="score-total">
              スコア <b>{rec.points}</b>
            </div>
          </div>

          {rec.newBadges.length > 0 && (
            <div className="badge-toast">
              {rec.newBadges.map((b) => (
                <div key={b.id}>
                  {b.icon} <R>{`バッジゲット！「${b.name}」`}</R>
                </div>
              ))}
            </div>
          )}

          <Manager mood={mood} text={comment} />

          <div className="row wrap">
            {isLast ? (
              <button className="primary" onClick={() => dispatch({ type: 'next' })}>
                <R>{session.items.length > 1 ? 'まとめを{見|み}る' : 'おわり'}</R>
              </button>
            ) : (
              <button className="primary" onClick={() => dispatch({ type: 'next' })}>
                つぎのプレーへ ▶
              </button>
            )}
            {repeatable && (
              <button onClick={again}>
                <R>{'もう{一回|いっかい}'}</R>
              </button>
            )}
          </div>
        </section>

        <section className="result-detail">
          <SafeMeter pSafe={score.pSafe} threshold={score.threshold} outs={tl.scenario.outs} adjusted={br.adjustments.length > 0} />

          <div className="row wrap">
            <button onClick={() => setView(view === 'replay' ? 'none' : 'replay')}>🎬 リプレイ</button>
            <button onClick={() => setView(view === 'whatif' ? 'none' : 'whatif')}>
              🔀 <R>{whatIfTitle}</R>
            </button>
          </div>
          {view === 'replay' && <Replay key="replay" tl={tl} title="リプレイ" onClose={() => setView('none')} />}
          {view === 'whatif' && (
            <>
              <Replay key="whatif" tl={whatIf} title={<R>{whatIfTitle}</R>} onClose={() => setView('none')} />
              {opposite === 'send' && (
                <p className="whatif-stat">
                  <R>
                    {`{今回|こんかい}は「${RESULT_CALL[whatIf.result]}」。{同|おな}じ{場面|ばめん}で${score.mcRuns}{回|かい}{回|まわ}したら、セーフは ${score.safeCount}{回|かい}（${Math.round(score.pSafe * 100)}%）`}
                  </R>
                </p>
              )}
            </>
          )}

          <h3>
            <R>{'タイムライン（{秒|びょう}）'}</R>
          </h3>
          <TimelineChart tl={tl} decisionTime={score.decisionTime} />

          <h3>
            <R>{'{判断|はんだん}ポイント'}</R>
          </h3>
          <ul className="checklist">
            {items.map((it) => (
              <li key={it.label} className={`tone-${it.tone}`}>
                <span className="check-label">
                  <R>{it.label}</R>
                </span>
                <span>
                  <R>{it.text}</R>
                </span>
              </li>
            ))}
          </ul>

          {bs && tl.batter && (
            <div className="batter-section">
              <h3>
                <R>{'② バッターランナー（{二塁|にるい}を{回|まわ}るか）'}</R>
              </h3>
              <div className={`grade grade-${bs.grade.grade} small`}>
                <span className="grade-mark">{GRADE_MARK[bs.grade.grade]}</span>
                <div>
                  <div className="grade-verdict">
                    <R>{VERDICT_LABEL[bs.grade.verdict]}</R>
                  </div>
                  <div className="muted">
                    <R>{`あなたの{合図|あいず}：${tl.batter.trace.accepted.length === 0 ? 'なし' : bs.decision === 'send' ? '{三塁|さんるい}へ' : '{二塁|にるい}ストップ'}${bs.timing === 'late' ? '（おそい）' : ''} → ${BATTER_RESULT[tl.batter.result]}`}</R>
                  </div>
                </div>
              </div>
              <p className="result-msg">
                <R>
                  {timingMessage(bs.timing, bs.pSafe, bs.threshold, true) ??
                    batterMessage(bs.grade.grade, bs.decision, tl.batter.result, tl.scenario.outs, bs.pSafe)}
                </R>
              </p>
              <SafeMeter pSafe={bs.pSafe} threshold={bs.threshold} outs={tl.scenario.outs} batter />
              <ul className="checklist">
                {bItems.map((it) => (
                  <li key={it.label} className={`tone-${it.tone}`}>
                    <span className="check-label">
                      <R>{it.label}</R>
                    </span>
                    <span>
                      <R>{it.text}</R>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
