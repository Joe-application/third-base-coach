import { EVAL } from '../../sim/constants';
import type { OutCount } from '../../sim/types';
import type { Settings } from '../../game/storage';
import { R } from '../components/Ruby';
import { useApp } from '../state';

export function SettingsScreen() {
  const { state, dispatch } = useApp();
  const s = state.settings;
  const set = (patch: Partial<Settings>) => dispatch({ type: 'settings', settings: { ...s, ...patch } });

  return (
    <div className="settings screen-scroll">
      <div className="tut-head">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })} aria-label="もどる">
          ✕
        </button>
        <h2>
          <R>{'{設定|せってい}'}</R>
        </h2>
      </div>

      <div className="card form-grid">
        <label>
          <R>{'{速|はや}さ'}</R>
        </label>
        <div className="seg-ctl">
          {(
            [
              ['auto', 'ランクに{合|あ}わせる'],
              ['slow', 'スロー'],
              ['normal', '{等速|とうそく}'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={s.speed === v ? 'on' : ''} onClick={() => set({ speed: v })}>
              <R>{l}</R>
            </button>
          ))}
        </div>

        <label>
          <R>{'{効果音|こうかおん}'}</R>
        </label>
        <div className="seg-ctl">
          <button className={s.sound ? 'on' : ''} onClick={() => set({ sound: true })}>
            ON
          </button>
          <button className={!s.sound ? 'on' : ''} onClick={() => set({ sound: false })}>
            OFF
          </button>
        </div>

        <label>
          <R>{'{声|こえ}'}</R>
        </label>
        <div className="seg-ctl">
          <button className={s.voice ? 'on' : ''} onClick={() => set({ voice: true })}>
            ON
          </button>
          <button className={!s.voice ? 'on' : ''} onClick={() => set({ voice: false })}>
            OFF
          </button>
        </div>

        <label>
          <R>{'{振動|しんどう}'}</R>
        </label>
        <div className="seg-ctl">
          <button className={s.vibrate ? 'on' : ''} onClick={() => set({ vibrate: true })}>
            ON
          </button>
          <button className={!s.vibrate ? 'on' : ''} onClick={() => set({ vibrate: false })}>
            OFF
          </button>
        </div>
      </div>

      <details className="card">
        <summary>
          <R>{'{詳細|しょうさい}{設定|せってい}（コーチ{向|む}け）'}</R>
        </summary>
        <p className="muted small-text">
          「回すべきセーフ確率の基準」。止めた場合に、そのあとの打者でこの走者が生還する確率の目安です。チームの方針に合わせて変えられます。
        </p>
        <div className="form-grid">
          {([0, 1, 2] as OutCount[]).map((o) => (
            <FragmentRow key={o} label={`${o}アウト`}>
              <div className="slider">
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={s.thresholds[o]}
                  onChange={(e) => set({ thresholds: { ...s.thresholds, [o]: Number(e.target.value) } })}
                  aria-label={`${o}アウトの基準`}
                />
                <span>{Math.round(s.thresholds[o] * 100)}%</span>
              </div>
            </FragmentRow>
          ))}
          <label>点差・イニング補正</label>
          <label className="check">
            <input type="checkbox" checked={s.situational} onChange={(e) => set({ situational: e.target.checked })} />
            最終回で同点・1点負けの2アウトは −5%、5点差以上リードは +10%
          </label>
        </div>
        <button className="small" onClick={() => set({ thresholds: { ...EVAL.thresholds }, situational: false })}>
          初期値に戻す
        </button>
      </details>
    </div>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <label>{label}</label>
      {children}
    </>
  );
}
