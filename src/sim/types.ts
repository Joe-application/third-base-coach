export type Vec = { x: number; y: number };

export type OutCount = 0 | 1 | 2;
export type Arm = 'weak' | 'normal' | 'strong';
export type Strength = 'weak' | 'normal' | 'hard';
export type RunnerSpeed = 'slow' | 'normal' | 'fast';
export type Depth = 'shallow' | 'normal' | 'deep';
export type BallType = 'ground' | 'liner' | 'fly_drop' | 'over';
export type OutfielderId = 'LF' | 'CF' | 'RF';
export type FielderId = 'P' | 'C' | '1B' | '2B' | 'SS' | '3B' | OutfielderId;

export type Scenario = {
  id: string;
  /** プリセット名 */
  name?: string;
  outs: OutCount;
  /** MVP は second のみ true */
  runners: { first: boolean; second: boolean; third: boolean };
  inning?: number;
  /** 自チーム − 相手 */
  scoreDiff?: number;
  battedBall: {
    type: BallType;
    /** 0=センター、負=レフト側 */
    angleDeg: number;
    strength: Strength;
    /** liner / fly_drop / over 用。着地点と滞空時間 */
    landing?: { x: number; y: number; hangTime: number };
  };
  runnerSpeed: RunnerSpeed;
  outfieldArm: Record<OutfielderId, Arm>;
  outfieldDepth: Depth;
  seed: number;
};

export type CommandKind = 'send' | 'stop' | 'slide';
/** コーチャーの合図。t はプレー開始（打球）からの秒 */
export type Command = { t: number; kind: CommandKind };

export type CatchType = 'forward' | 'side' | 'back';

export type PlayResult =
  | 'safe' // 生還
  | 'out_home' // 本塁アウト
  | 'stop' // 三塁ストップ
  | 'out_third'; // 帰塁が間に合わず三塁アウト

export type SafeReason = 'beat_throw' | 'tag_missed' | 'wild_throw' | 'catcher_drop';

export type EventKind =
  | 'contact'
  | 'runnerStart'
  | 'land'
  | 'windowStart'
  | 'catch'
  | 'fumble'
  | 'release'
  | 'relayCatch'
  | 'relayRelease'
  | 'runnerThird'
  | 'hesitate'
  | 'autoStop'
  | 'decision'
  | 'ballHome'
  | 'runnerHome'
  | 'runnerStopped'
  | 'throwThird'
  | 'result';

export type PlayEvent = { t: number; kind: EventKind; detail?: string };

export type Frame = {
  t: number;
  ball: { x: number; y: number; h: number };
  runner: Vec;
  batter: Vec;
  fielders: Record<FielderId, Vec>;
};
