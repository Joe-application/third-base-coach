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
  /** 打者走者の足（省略時はふつう） */
  batterSpeed?: RunnerSpeed;
  outfieldArm: Record<OutfielderId, Arm>;
  outfieldDepth: Depth;
  seed: number;
};

/** send / stop / slide は二塁走者、bsend / bstop は打者走者（二塁を回るか）への合図 */
export type CommandKind = 'send' | 'stop' | 'slide' | 'bsend' | 'bstop';
/** コーチャーの合図。t はプレー開始（打球）からの秒 */
export type Command = { t: number; kind: CommandKind };

export type CatchType = 'forward' | 'side' | 'back';

export type PlayResult =
  | 'safe' // 生還
  | 'out_home' // 本塁アウト
  | 'stop' // 三塁ストップ
  | 'out_third'; // 帰塁が間に合わず三塁アウト

/** 打者走者の結果：二塁で止まった／三塁セーフ／三塁アウト */
export type BatterResult = 'second' | 'third' | 'out_third';

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
  /** 審判のコール（セーフ／アウト／ストップ） */
  | 'call'
  | 'throwThird'
  /** 打者走者：判断ウィンドウ・二塁到達・中継が三塁へ投げた・三塁でのコール */
  | 'batterWindow'
  | 'batterSecond'
  | 'cutToThird'
  | 'batterCall'
  | 'result';

export type PlayEvent = { t: number; kind: EventKind; detail?: string };

export type Frame = {
  t: number;
  ball: { x: number; y: number; h: number };
  runner: Vec;
  batter: Vec;
  fielders: Record<FielderId, Vec>;
};
