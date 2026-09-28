import { useMemo, useState } from 'react';
import type { OutCount } from '../../sim/types';
import { describeBall, GRADE_MARK, RECORDS, RESULT_CALL } from '../../game/messages';
import { BADGES } from '../../game/progression';
import { clearRecords, loadHistory } from '../../game/storage';
import { R } from '../components/Ruby';
import { useApp } from '../state';

export function RecordsScreen() {
  const { state, dispatch } = useApp();
  const p = state.profile!;
  const [version, setVersion] = useState(0);
  // version を変えると読み直す
  const history = useMemo(() => loadHistory(p.id), [p.id, version]);
  const s = p.stats;

  const tendencies: string[] = [];
  for (const o of [0, 1, 2] as OutCount[]) {
    const x = s.byOuts[o];
    if (x.stops >= 3 && x.stoppedShouldSend / x.stops >= 0.3) tendencies.push(RECORDS.tendency(o, 'stop', x.stoppedShouldSend / x.stops));
    if (x.sends >= 3 && x.sentShouldStop / x.sends >= 0.3) tendencies.push(RECORDS.tendency(o, 'send', x.sentShouldStop / x.sends));
  }

  const clear = () => {
    if (!confirm(RECORDS.clearConfirm.replace(/\{([^|]+)\|[^}]+\}/g, '$1'))) return;
    dispatch({ type: 'profile', profile: clearRecords(p) });
    setVersion((v) => v + 1);
  };

  return (
    <div className="records screen-scroll">
      <div className="tut-head">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })} aria-label="もどる">
          ✕
        </button>
        <h2>
          <R>{`${p.nickname} の{記録|きろく}`}</R>
        </h2>
      </div>

      <section className="card">
        <h3>
          <R>{'アウトカウント{別|べつ}の{正解率|せいかいりつ}'}</R>
        </h3>
        {([0, 1, 2] as OutCount[]).map((o) => {
          const x = s.byOuts[o];
          const pct = (n: number) => (x.plays ? Math.round((n / x.plays) * 100) : 0);
          return (
            <div key={o} className="acc-row">
              <span className="acc-label">{o}アウト</span>
              <div className="acc-bar" aria-label={`◎${pct(x.great)}% ○${pct(x.ok)}% ×${pct(x.bad)}%`}>
                <div className="acc-great" style={{ width: `${pct(x.great)}%` }} />
                <div className="acc-ok" style={{ width: `${pct(x.ok)}%` }} />
                <div className="acc-bad" style={{ width: `${pct(x.bad)}%` }} />
              </div>
              <span className="acc-num">
                {x.plays ? `◎${pct(x.great)}% ○${pct(x.ok)}%` : '—'} <span className="muted">({x.plays})</span>
              </span>
            </div>
          );
        })}
        {s.batterPlays > 0 && (
          <p className="small-text">
            <R>{`バッターランナー（{二塁|にるい}を{回|まわ}るか）：◎ ${Math.round((s.batterGreat / s.batterPlays) * 100)}%（${s.batterPlays}{回|かい}）`}</R>
          </p>
        )}
        <div className="tendency">
          {s.plays < 6 ? (
            <p className="muted">
              <R>{RECORDS.needMore}</R>
            </p>
          ) : tendencies.length ? (
            tendencies.map((t) => (
              <p key={t}>
                💡 <R>{t}</R>
              </p>
            ))
          ) : (
            <p>
              👍 <R>{RECORDS.noTendency}</R>
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <h3>バッジ</h3>
        <div className="badges">
          {BADGES.map((b) => {
            const got = p.badges.includes(b.id);
            return (
              <div key={b.id} className={`badge ${got ? 'got' : ''}`} title={b.desc}>
                <span className="badge-icon">{got ? b.icon : '🔒'}</span>
                <span className="badge-name">{b.name}</span>
                <span className="badge-desc muted">{b.desc}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3>
          <R>{`プレー{履歴|りれき}（{最近|さいきん}${Math.min(30, history.length)}{件|けん}）`}</R>
        </h3>
        {history.length === 0 ? (
          <p className="muted">まだないよ</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日時</th>
                <th>アウト</th>
                <th>打球</th>
                <th>判断</th>
                <th>確率</th>
                <th>結果</th>
                <th>点</th>
              </tr>
            </thead>
            <tbody>
              {history
                .slice(-30)
                .reverse()
                .map((h, i) => (
                  <tr key={i}>
                    <td className="nowrap">{new Date(h.playedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{h.scenario.outs}</td>
                    <td className="left">
                      <R>{describeBall(h.scenario)}</R>
                    </td>
                    <td className="nowrap">
                      <R>{`${h.decision === 'send' ? '{回|まわ}す' : '{止|と}める'}${GRADE_MARK[h.grade] ?? ''}`}</R>
                    </td>
                    <td>{Math.round(h.pSafe * 100)}%</td>
                    <td className="nowrap">
                      <R>{RESULT_CALL[h.result] ?? ''}</R>
                    </td>
                    <td>{h.score}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="row center-row">
        <button className="danger" onClick={clear}>
          <R>{'データを{消|け}す'}</R>
        </button>
      </div>
    </div>
  );
}
