import type { OutCount } from '../../sim/types';

export function OutsDots({ outs, big = false }: { outs: OutCount; big?: boolean }) {
  return (
    <span className={`outs ${big ? 'big' : ''}`} aria-label={`${outs}アウト`}>
      <span className="outs-label">OUT</span>
      {[0, 1].map((i) => (
        <span key={i} className={`dot ${i < outs ? 'on' : ''}`} />
      ))}
    </span>
  );
}
