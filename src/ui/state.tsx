// アプリ全体の状態（useReducer + Context）

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Draws } from '../sim/draws';
import type { PlayScore } from '../sim/evaluate';
import type { PlayTimeline } from '../sim/play';
import type { Scenario } from '../sim/types';
import type { BadgeDef } from '../game/progression';
import {
  loadCurrentId,
  loadProfile,
  loadProfiles,
  loadSettings,
  saveCurrentId,
  saveProfile,
  saveSettings,
  type Profile,
  type Settings,
} from '../game/storage';
import { setSoundEnabled, setVibrateEnabled } from './audio';
import { setVoiceEnabled } from './voice';

export type Mode = 'tutorial' | 'challenge' | 'compare' | 'anohi' | 'free';

export type SessionItem = {
  scenario: Scenario;
  presetId?: string;
};

export type PlayRecord = {
  item: SessionItem;
  timeline: PlayTimeline;
  draws: Draws;
  score: PlayScore;
  /** コンボ倍率 */
  multiplier: number;
  /** 倍率をかけたあとの点 */
  points: number;
  combo: number;
  newBadges: BadgeDef[];
};

export type Session = {
  mode: Mode;
  items: SessionItem[];
  index: number;
  records: PlayRecord[];
  combo: number;
  /** ランクで決まる再生速度・ヒント・表示 */
  speed: number;
  hint: boolean;
  hideTraits: boolean;
};

export type Screen = 'home' | 'tutorial' | 'play' | 'result' | 'summary' | 'setup' | 'records' | 'settings';

export type State = {
  screen: Screen;
  profile: Profile | null;
  settings: Settings;
  session: Session | null;
  /** セッション終了時に増えた★ */
  lastStarsGained: number;
};

export type Action =
  | { type: 'go'; screen: Screen }
  | { type: 'profile'; profile: Profile | null }
  | { type: 'settings'; settings: Settings }
  | { type: 'startSession'; session: Session; screen?: Screen }
  | { type: 'recordPlay'; record: PlayRecord; profile: Profile }
  | { type: 'next' }
  | { type: 'retry' }
  | { type: 'finishSession'; profile: Profile; gained: number }
  | { type: 'replaceItems'; items: SessionItem[] };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'go':
      return { ...state, screen: a.screen };
    case 'profile':
      return { ...state, profile: a.profile };
    case 'settings':
      return { ...state, settings: a.settings };
    case 'startSession':
      return { ...state, session: a.session, screen: a.screen ?? 'play', lastStarsGained: 0 };
    case 'replaceItems':
      return state.session ? { ...state, session: { ...state.session, items: a.items } } : state;
    case 'recordPlay': {
      if (!state.session) return state;
      const s = state.session;
      return {
        ...state,
        profile: a.profile,
        session: { ...s, records: [...s.records, a.record], combo: a.record.combo },
        screen: 'result',
      };
    }
    case 'next': {
      if (!state.session) return state;
      const s = state.session;
      if (s.index + 1 >= s.items.length) return { ...state, screen: 'summary' };
      return { ...state, session: { ...s, index: s.index + 1 }, screen: 'play' };
    }
    case 'retry':
      return { ...state, screen: 'play' };
    case 'finishSession':
      return { ...state, profile: a.profile, lastStarsGained: a.gained };
  }
}

function init(): State {
  const settings = loadSettings();
  const id = loadCurrentId();
  const ref = loadProfiles().find((p) => p.id === id);
  return {
    screen: 'home',
    profile: ref ? loadProfile(ref) : null,
    settings,
    session: null,
    lastStarsGained: 0,
  };
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  // 保存は state の変化に合わせてまとめて行う
  useEffect(() => {
    if (state.profile) {
      saveProfile(state.profile);
      saveCurrentId(state.profile.id);
    }
  }, [state.profile]);
  useEffect(() => {
    saveSettings(state.settings);
    setSoundEnabled(state.settings.sound);
    setVibrateEnabled(state.settings.vibrate);
    setVoiceEnabled(state.settings.voice);
  }, [state.settings]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider がありません');
  return v;
}
