import { useState } from 'react';
import { APP_TITLE, MODE_INFO } from '../../game/messages';
import { nextRank, rankFor } from '../../game/progression';
import { createProfile, deleteProfile, loadProfile, loadProfiles, MAX_PROFILES } from '../../game/storage';
import { R } from '../components/Ruby';
import { useApp, type Mode } from '../state';
import { useStarter } from '../useStarter';

function ProfilePicker({ onDone }: { onDone?: () => void }) {
  const { state, dispatch } = useApp();
  const [list, setList] = useState(loadProfiles);
  const [name, setName] = useState('');
  const full = list.length >= MAX_PROFILES;

  const create = () => {
    const p = createProfile(name);
    if (!p) return;
    setName('');
    setList(loadProfiles());
    dispatch({ type: 'profile', profile: p });
    onDone?.();
  };

  return (
    <div className="card profile-picker">
      <h2>
        <R>{'ニックネームを{選|えら}んでね'}</R>
      </h2>
      {list.length > 0 && (
        <div className="row wrap">
          {list.map((p) => (
            <span key={p.id} className="chip-group">
              <button
                className={state.profile?.id === p.id ? 'primary' : ''}
                onClick={() => {
                  dispatch({ type: 'profile', profile: loadProfile(p) });
                  onDone?.();
                }}
              >
                {p.nickname}
              </button>
              <button
                className="ghost small"
                aria-label={`${p.nickname} を消す`}
                onClick={() => {
                  if (!confirm(`「${p.nickname}」の記録を消しますか？`)) return;
                  deleteProfile(p.id);
                  setList(loadProfiles());
                  if (state.profile?.id === p.id) dispatch({ type: 'profile', profile: null });
                }}
              >
                🗑
              </button>
            </span>
          ))}
        </div>
      )}
      {!full ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            value={name}
            maxLength={12}
            placeholder="ニックネーム（本名はダメ）"
            onChange={(e) => setName(e.target.value)}
            aria-label="ニックネーム"
          />
          <button className="primary" type="submit" disabled={!name.trim()}>
            <R>{'{作|つく}る'}</R>
          </button>
        </form>
      ) : (
        <p className="muted">
          <R>{`{登録|とうろく}できるのは${MAX_PROFILES}{人|にん}までです`}</R>
        </p>
      )}
    </div>
  );
}

export function HomeScreen() {
  const { state, dispatch } = useApp();
  const { start, busy } = useStarter();
  const [picking, setPicking] = useState(false);
  const p = state.profile;

  if (!p || picking) {
    return (
      <div className="home screen-scroll">
        <h1 className="title">
          <R>{APP_TITLE}</R>
        </h1>
        <ProfilePicker onDone={() => setPicking(false)} />
      </div>
    );
  }

  const rank = rankFor(p.stars);
  const next = nextRank(p.stars);
  const progress = next ? (p.stars - rank.minStars) / (next.minStars - rank.minStars) : 1;
  const modes: Mode[] = ['tutorial', 'challenge', 'compare', 'anohi', 'free'];

  return (
    <div className="home screen-scroll">
      <header className="home-head">
        <h1 className="title">
          <R>{APP_TITLE}</R>
        </h1>
        <div className="me">
          <button className="ghost" onClick={() => setPicking(true)}>
            👤 {p.nickname}
          </button>
          <div className="rank">
            <span className="rank-name">{rank.name}</span>
            <span className="stars">★ {p.stars}</span>
          </div>
          <div className="progress" aria-label="つぎのランクまで">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="muted small-text">
            {next ? <R>{`つぎの「${next.name}」まで ★${next.minStars - p.stars}`}</R> : '最高ランク！'}
          </div>
        </div>
      </header>

      {busy && (
        <div className="overlay">
          <div className="card">
            <R>{'じゅんび{中|ちゅう}…'}</R>
          </div>
        </div>
      )}

      <div className="modes">
        {modes.map((m) => {
          const info = MODE_INFO[m];
          const onClick = () => {
            if (m === 'tutorial') dispatch({ type: 'go', screen: 'tutorial' });
            else if (m === 'free') dispatch({ type: 'go', screen: 'setup' });
            else start(m);
          };
          const best = p.bestStars[m];
          return (
            <button key={m} className={`mode mode-${m}`} onClick={onClick} disabled={busy}>
              <span className="mode-title">
                <R>{info.title}</R>
                {m === 'anohi' && p.stats.anohiCleared && ' 🏆'}
                {m === 'tutorial' && !p.stats.tutorialDone && <span className="new">はじめに</span>}
              </span>
              <span className="mode-desc">
                <R>{info.desc}</R>
              </span>
              {best !== undefined && best > 0 && <span className="mode-stars">{'★'.repeat(best)}</span>}
            </button>
          );
        })}
      </div>

      <div className="row wrap center-row">
        <button onClick={() => dispatch({ type: 'go', screen: 'records' })}>
          📊 <R>{'{記録|きろく}'}</R>
        </button>
        <button onClick={() => dispatch({ type: 'go', screen: 'settings' })}>
          ⚙️ <R>{'{設定|せってい}'}</R>
        </button>
      </div>
    </div>
  );
}
