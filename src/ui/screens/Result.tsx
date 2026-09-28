import { useMemo, useState } from 'react';
import { simulatePlay } from '../../sim/play';
import type { Command } from '../../sim/types';
import {
  checklist,
  COMBO_TEXT,
  GRADE_MARK,
  managerComment,
  RESULT_CALL,
  resultMessage,
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
  const msg = resultMessage(g, score.decision, tl.result, tl.scenario.outs, score.pSafe);
  const comment = managerComment(g, score.timing, tl, tl.scenario.seed);
  const items = checklist(tl, score.threshold, score.timing);
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
                <R>{`あなたの{判断|はんだん}：${score.decision === 'send' ? '{回|まわ}せ' : '{止|と}まれ'}${score.timing === 'hesitate' ? '（{迷|まよ}い）' : ''} → ${RESULT_CALL[tl.result]}`}</R>
              </div>
            </div>
          </div>
          <p className="result-msg">
            <R>{msg}</R>
          </p>

          <div className="score-box">
            <div>
              <R>{'{判断|はんだん}'}</R> <b>+{score.grade.points}</b>
            </div>
            <div>
              <R>{TIMING_LABEL[score.timing]}</R>{' '}
              <b>{score.timingPoints >= 0 ? `+${score.timingPoints}` : score.timingPoints}</b>
            </div>
            {score.resultPoints > 0 && (
              <div>
                <R>{'{生還|せいかん}'}</R> <b>+{score.resultPoints}</b>
              </div>
            )}
            {score.slidePoints > 0 && (
              <div>
                スライディング <b>+{score.slidePoints}</b>
              </div>
            )}
            {rec.multiplier > 1 && (
              <div className="combo-line">
                <R>{COMBO_TEXT(rec.combo)}</R> <b>×{rec.multiplier}</b>
              </div>
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

          <Manager mood={g} text={comment} />

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
          <SafeMeter pSafe={score.pSafe} threshold={score.threshold} outs={tl.scenario.outs} />

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
        </section>
      </div>
    </div>
  );
}
