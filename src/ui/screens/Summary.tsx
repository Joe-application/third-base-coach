import { useEffect, useRef } from 'react';
import { correctAnswer } from '../../sim/evaluate';
import { describeBall, GRADE_MARK, RESULT_CALL } from '../../game/messages';
import { awardStars, challengeStars, gradeStars, rankFor } from '../../game/progression';
import { R } from '../components/Ruby';
import { useApp } from '../state';
import { useStarter } from '../useStarter';

function starsFor(mode: string, records: { points: number; score: { grade: { grade: string } } }[]): number {
  const n = records.length;
  const greats = records.filter((r) => r.score.grade.grade === 'great').length;
  const oks = records.filter((r) => r.score.grade.grade === 'ok').length;
  switch (mode) {
    case 'challenge':
      return challengeStars(
        records.reduce((a, r) => a + r.points, 0),
        n,
      );
    case 'compare':
      return Math.min(2, gradeStars(greats, oks, n));
    case 'tutorial':
      return n >= 3 ? 1 + Math.min(2, greats) : 0;
    case 'anohi':
      return greats > 0 ? 3 : oks > 0 ? 1 : 0;
    default:
      return 0;
  }
}

export function SummaryScreen() {
  const { state, dispatch } = useApp();
  const session = state.session!;
  const profile = state.profile!;
  const records = session.records;
  const stars = starsFor(session.mode, records);
  const total = records.reduce((a, r) => a + r.points, 0);
  const done = useRef(false);
  const rankBefore = useRef(rankFor(profile.stars));

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const repeatable = session.mode === 'challenge' || session.mode === 'compare';
    let { profile: p, gained } = awardStars(profile, session.mode, stars, repeatable);
    if (session.mode === 'tutorial') p = { ...p, stats: { ...p.stats, tutorialDone: true } };
    dispatch({ type: 'finishSession', profile: p, gained });
    // 1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rankAfter = rankFor(state.profile!.stars);
  const rankUp = rankAfter.index > rankBefore.current.index;

  const { start, busy } = useStarter();
  const again = () => start(session.mode, session.items[0]?.scenario);

  return (
    <div className="summary screen-scroll">
      <h1>
        <R>{'まとめ'}</R>
      </h1>
      <div className="stars-big" aria-label={`星 ${stars}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < stars ? 'on' : ''}>
            ★
          </span>
        ))}
      </div>
      <p className="center">
        スコア <b className="big-num">{total}</b>
        {state.lastStarsGained > 0 && (
          <span className="pill go">
            <R>{`★+${state.lastStarsGained}`}</R>
          </span>
        )}
      </p>
      {rankUp && (
        <div className="badge-toast center">
          🎉 <R>{`ランクアップ！「${rankAfter.name}」になった！`}</R>
        </div>
      )}

      {session.mode === 'compare' && (
        <div className="compare-box">
          <p>
            <R>{`{打球|だきゅう}：${describeBall(records[0].timeline.scenario, records[0].timeline)}`}</R>
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>アウト</th>
                <th>
                  <R>{'セーフ{確率|かくりつ}'}</R>
                </th>
                <th>
                  <R>{'{基準|きじゅん}'}</R>
                </th>
                <th>
                  <R>{'{正解|せいかい}'}</R>
                </th>
                <th>
                  <R>{'あなた'}</R>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const ans = correctAnswer(r.score.pSafe, r.score.threshold);
                return (
                  <tr key={i}>
                    <td>{r.timeline.scenario.outs}</td>
                    <td>{Math.round(r.score.pSafe * 100)}%</td>
                    <td>{Math.round(r.score.threshold * 100)}%</td>
                    <td>
                      <R>{ans === 'send' ? '{回|まわ}す' : ans === 'stop' ? '{止|と}める' : 'どちらも'}</R>
                    </td>
                    <td>
                      <R>{`${r.score.decision === 'send' ? '{回|まわ}す' : '{止|と}める'} ${GRADE_MARK[r.score.grade.grade]}`}</R>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted">
            <R>{'{同|おな}じ{打球|だきゅう}でも、アウトカウントで{基準|きじゅん}が{変|か}わる。0・1アウトはランナーのスタートも{遅|おそ}れるよ。'}</R>
          </p>
        </div>
      )}

      {session.mode !== 'compare' && (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>アウト</th>
              <th>
                <R>{'{打球|だきゅう}'}</R>
              </th>
              <th>
                <R>{'{判断|はんだん}'}</R>
              </th>
              <th>
                <R>{'{結果|けっか}'}</R>
              </th>
              <th>点</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.timeline.scenario.outs}</td>
                <td className="left">
                  <R>{describeBall(r.timeline.scenario, r.timeline)}</R>
                </td>
                <td>
                  <R>{`${r.score.decision === 'send' ? '{回|まわ}す' : '{止|と}める'} ${GRADE_MARK[r.score.grade.grade]}`}</R>
                </td>
                <td>
                  <R>{RESULT_CALL[r.timeline.result]}</R>
                </td>
                <td>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row wrap center-row">
        <button className="primary" onClick={again} disabled={busy}>
          <R>{'もう{一回|いっかい}'}</R>
        </button>
        <button onClick={() => dispatch({ type: 'go', screen: 'home' })}>ホームへ</button>
      </div>
    </div>
  );
}
