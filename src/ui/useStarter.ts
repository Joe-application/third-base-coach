import { useState } from 'react';
import type { Scenario } from '../sim/types';
import { unlockAudio } from './audio';
import { buildSession } from './sessions';
import { useApp, type Mode } from './state';

/** モードを始める。問題づくりに少し時間がかかるので「じゅんび中」を先に描く */
export function useStarter() {
  const { state, dispatch } = useApp();
  const [busy, setBusy] = useState(false);
  const start = (mode: Mode, free?: Scenario) => {
    if (!state.profile || busy) return;
    unlockAudio();
    setBusy(true);
    setTimeout(() => {
      const session = buildSession(mode, state.profile!, state.settings, free);
      setBusy(false);
      dispatch({ type: 'startSession', session });
    }, 30);
  };
  return { start, busy };
}
