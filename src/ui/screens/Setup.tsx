// シチュエーション設定（自由練習モード）

import { useMemo, useState } from 'react';
import { baselinePSafe, thresholdFor } from '../../sim/evaluate';
import { dirFromAngle, fenceDistance } from '../../sim/field';
import { PRESET_ORDER, PRESETS } from '../../sim/scenario';
import type { Arm, BallType, Depth, OutCount, RunnerSpeed, Scenario, Strength } from '../../sim/types';
import { describeBall, LABEL } from '../../game/messages';
import { R } from '../components/Ruby';
import { useApp } from '../state';
import { useStarter } from '../useStarter';

const HANG: Record<Exclude<BallType, 'ground'>, number> = { liner: 1.6, fly_drop: 2.5, over: 3.0 };
const DIST: Record<Exclude<BallType, 'ground'>, number> = { liner: 44, fly_drop: 40, over: 62 };

type Form = {
  outs: OutCount;
  type: BallType;
  angle: number;
  strength: Strength;
  distance: number;
  runnerSpeed: RunnerSpeed;
  batterSpeed: RunnerSpeed;
  arms: Record<'LF' | 'CF' | 'RF', Arm>;
  depth: Depth;
  inning: number;
  scoreDiff: number;
  useScore: boolean;
};

function toScenario(f: Form): Scenario {
  const sc: Scenario = {
    id: 'free',
    name: '自由練習',
    outs: f.outs,
    runners: { first: false, second: true, third: false },
    battedBall: { type: f.type, angleDeg: f.angle, strength: f.strength },
    runnerSpeed: f.runnerSpeed,
    batterSpeed: f.batterSpeed,
    outfieldArm: { ...f.arms },
    outfieldDepth: f.depth,
    seed: 1,
  };
  if (f.type !== 'ground') {
    const d = dirFromAngle(f.angle);
    const dist = Math.min(f.distance, fenceDistance(f.angle) - 4);
    sc.battedBall.landing = { x: d.x * dist, y: d.y * dist, hangTime: HANG[f.type] };
  }
  if (f.useScore) {
    sc.inning = f.inning;
    sc.scoreDiff = f.scoreDiff;
  }
  return sc;
}

function fromScenario(sc: Scenario): Form {
  const l = sc.battedBall.landing;
  return {
    outs: sc.outs,
    type: sc.battedBall.type,
    angle: sc.battedBall.angleDeg,
    strength: sc.battedBall.strength,
    distance: l ? Math.round(Math.hypot(l.x, l.y)) : 44,
    runnerSpeed: sc.runnerSpeed,
    batterSpeed: sc.batterSpeed ?? 'normal',
    arms: { ...sc.outfieldArm },
    depth: sc.outfieldDepth,
    inning: sc.inning ?? 6,
    scoreDiff: sc.scoreDiff ?? 0,
    useScore: sc.scoreDiff !== undefined,
  };
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg-ctl">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)} type="button">
          <R>{o.label}</R>
        </button>
      ))}
    </div>
  );
}

const armOpts: { v: Arm; label: string }[] = [
  { v: 'weak', label: LABEL.arm.weak },
  { v: 'normal', label: LABEL.arm.normal },
  { v: 'strong', label: LABEL.arm.strong },
];

export function SetupScreen() {
  const { state, dispatch } = useApp();
  const { start, busy } = useStarter();
  const [f, setF] = useState<Form>(() => fromScenario(PRESETS.anohi));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const sc = useMemo(() => toScenario(f), [f]);
  const th = thresholdFor(sc, { thresholds: state.settings.thresholds, situational: state.settings.situational });
  const p = useMemo(() => baselinePSafe(sc, 400), [sc]);

  return (
    <div className="setup screen-scroll">
      <div className="tut-head">
        <button className="ghost small" onClick={() => dispatch({ type: 'go', screen: 'home' })} aria-label="もどる">
          ✕
        </button>
        <h2>
          <R>{'{自由|じゆう}{練習|れんしゅう}：シチュエーション{設定|せってい}'}</R>
        </h2>
      </div>

      <div className="row wrap">
        <span className="muted">プリセット：</span>
        {PRESET_ORDER.map((id) => (
          <button key={id} className="small" onClick={() => setF(fromScenario(PRESETS[id]))}>
            {PRESETS[id].name}
            {id === 'anohi0' ? '' : `（${PRESETS[id].outs}アウト）`}
          </button>
        ))}
      </div>

      <div className="form-grid">
        <label>アウト</label>
        <Seg value={f.outs} onChange={(v) => set('outs', v)} options={[0, 1, 2].map((o) => ({ v: o as OutCount, label: `${o}` }))} />

        <label>
          <R>{'{打球|だきゅう}'}</R>
        </label>
        <Seg
          value={f.type}
          onChange={(v) => setF((x) => ({ ...x, type: v, distance: v === 'ground' ? x.distance : DIST[v] }))}
          options={[
            { v: 'ground', label: 'ゴロ' },
            { v: 'liner', label: 'ライナー' },
            { v: 'fly_drop', label: 'ポテン' },
            { v: 'over', label: '{頭|あたま}を{越|こ}える' },
          ]}
        />

        <label>
          <R>{'{方向|ほうこう}'}</R>
        </label>
        <div className="slider">
          <input type="range" min={-40} max={40} step={1} value={f.angle} onChange={(e) => set('angle', Number(e.target.value))} aria-label="方向" />
          <span>
            <R>{describeBall(sc).split('（')[0]}</R>
          </span>
        </div>

        <label>
          <R>{'{強|つよ}さ'}</R>
        </label>
        <Seg
          value={f.strength}
          onChange={(v) => set('strength', v)}
          options={[
            { v: 'weak', label: '{弱|よわ}い' },
            { v: 'normal', label: 'ふつう' },
            { v: 'hard', label: '{強|つよ}い' },
          ]}
        />

        {f.type !== 'ground' && (
          <>
            <label>
              <R>{'{落|お}ちる{場所|ばしょ}'}</R>
            </label>
            <div className="slider">
              <input type="range" min={30} max={72} step={1} value={f.distance} onChange={(e) => set('distance', Number(e.target.value))} aria-label="落ちる距離" />
              <span>
                <R>{`{本塁|ほんるい}から ${f.distance}m`}</R>
              </span>
            </div>
          </>
        )}

        <label>
          <R>{'ランナーの{足|あし}'}</R>
        </label>
        <Seg
          value={f.runnerSpeed}
          onChange={(v) => set('runnerSpeed', v)}
          options={(['slow', 'normal', 'fast'] as RunnerSpeed[]).map((v) => ({ v, label: LABEL.runnerSpeed[v] }))}
        />

        <label>
          <R>{'バッターの{足|あし}'}</R>
        </label>
        <Seg
          value={f.batterSpeed}
          onChange={(v) => set('batterSpeed', v)}
          options={(['slow', 'normal', 'fast'] as RunnerSpeed[]).map((v) => ({ v, label: LABEL.runnerSpeed[v] }))}
        />

        {(['LF', 'CF', 'RF'] as const).map((k) => (
          <FragmentRow key={k} label={`${LABEL.fielder[k]}の{肩|かた}`}>
            <Seg value={f.arms[k]} onChange={(v) => set('arms', { ...f.arms, [k]: v })} options={armOpts} />
          </FragmentRow>
        ))}

        <label>
          <R>{'{外野|がいや}の{守備|しゅび}{位置|いち}'}</R>
        </label>
        <Seg
          value={f.depth}
          onChange={(v) => set('depth', v)}
          options={[
            { v: 'shallow', label: '{前進|ぜんしん}' },
            { v: 'normal', label: 'ふつう' },
            { v: 'deep', label: '{後|うし}ろ' },
          ]}
        />

        <label>
          <R>{'{点差|てんさ}・イニング'}</R>
        </label>
        <div className="row wrap">
          <label className="check">
            <input type="checkbox" checked={f.useScore} onChange={(e) => set('useScore', e.target.checked)} />
            <R>{'{入|い}れる'}</R>
          </label>
          {f.useScore && (
            <>
              <select value={f.inning} onChange={(e) => set('inning', Number(e.target.value))} aria-label="イニング">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}回
                  </option>
                ))}
              </select>
              <select value={f.scoreDiff} onChange={(e) => set('scoreDiff', Number(e.target.value))} aria-label="点差">
                {[-5, -3, -2, -1, 0, 1, 2, 3, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? '同点' : n > 0 ? `${n}点リード` : `${-n}点負け`}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="card setup-preview">
        <R>{`コーチ{向|む}け{目安|めやす}：{回|まわ}した{場合|ばあい}のセーフ{確率|かくりつ} 約${Math.round(p * 100)}% ／ {基準|きじゅん} ${Math.round(th * 100)}%`}</R>
        {!state.settings.situational && f.useScore && (
          <div className="muted small-text">
            <R>{'※{点差|てんさ}・イニングの{補正|ほせい}は{設定|せってい}で ON にすると{効|き}きます'}</R>
          </div>
        )}
      </div>

      <div className="row center-row">
        <button className="primary big" onClick={() => start('free', sc)} disabled={busy}>
          ▶ この<R>{'{場面|ばめん}'}</R>でプレー
        </button>
      </div>
    </div>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <label>
        <R>{label}</R>
      </label>
      {children}
    </>
  );
}
