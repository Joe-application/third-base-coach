import type { OutCount } from '../../sim/types';
import { R } from './Ruby';

/** P_safe の横棒と、アウトカウントの基準線（§9.2） */
export function SafeMeter({
  pSafe,
  threshold,
  outs,
  batter = false,
  adjusted = false,
}: {
  pSafe: number;
  threshold: number;
  outs: OutCount;
  /** 打者走者（三塁へ行かせるか）用の文言にする */
  batter?: boolean;
  /** 試合の状況で基準が変わっている */
  adjusted?: boolean;
}) {
  const p = Math.round(pSafe * 100);
  const th = Math.round(threshold * 100);
  const send = pSafe >= threshold;
  return (
    <div className="meter">
      <div className="meter-text">
        <R>{batter ? '{三塁|さんるい}へ{行|い}かせたらセーフになる{確率|かくりつ} ' : `{回|まわ}したらセーフになる{確率|かくりつ} `}</R>
        <strong className="meter-num">{p}%</strong>
        <span className="muted">
          {' ／ '}
          <R>{adjusted ? `この{場面|ばめん}の{基準|きじゅん} ${th}%` : `${outs}アウトの{基準|きじゅん} ${th}%`}</R>
        </span>
        <span className={`pill ${send ? 'go' : 'stop'}`}>
          <R>
            {batter
              ? send
                ? '→ {三塁|さんるい}へ{行|い}かせるべき'
                : '→ {二塁|にるい}で{止|と}めるべき'
              : send
                ? '→ {回|まわ}すべき'
                : '→ {止|と}めるべき'}
          </R>
        </span>
      </div>
      <div className="meter-bar" role="img" aria-label={`セーフ確率 ${p}%、基準 ${th}%`}>
        <div className={`meter-fill ${send ? 'go' : 'stop'}`} style={{ width: `${p}%` }} />
        <div className="meter-th" style={{ left: `${th}%` }}>
          <span>
            <R>{'{基準|きじゅん}'}</R>
          </span>
        </div>
      </div>
      <div className="meter-scale">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
