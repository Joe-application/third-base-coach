// 子ども向けの文言はすべてここに集める。保護者・コーチが直しやすいように。
// ふりがなは {漢字|よみ} と書くと <ruby> で表示される。

import type { Grade, Timing, Verdict } from '../sim/evaluate';
import type { PlayTimeline } from '../sim/play';
import { ARM } from '../sim/constants';
import type { Arm, BallType, BatterResult, CatchType, OutCount, OutfielderId, PlayResult, RunnerSpeed, Scenario, Strength } from '../sim/types';

export const APP_TITLE = '三塁コーチャー{判断|はんだん}トレーナー';

export const BUTTONS = {
  stop: '✋ 止まれ！',
  send: '🔄 回せ！',
  slide: '⬇ スライディング',
  /** 打者走者（二塁を回るか）への合図 */
  bstop: '✋ 二塁ストップ',
  bsend: '🔄 三塁へ！',
  batterCaption: 'バッターランナー',
};

export const LABEL = {
  outs: (n: OutCount) => `${n}アウト`,
  runnerSpeed: { slow: 'おそい', normal: 'ふつう', fast: 'はやい' } satisfies Record<RunnerSpeed, string>,
  arm: { weak: '{弱|よわ}い', normal: 'ふつう', strong: '{強|つよ}い' } satisfies Record<Arm, string>,
  strength: { weak: '{弱|よわ}い', normal: 'ふつうの', hard: '{強|つよ}い' } satisfies Record<Strength, string>,
  fielder: { LF: 'レフト', CF: 'センター', RF: 'ライト' } satisfies Record<OutfielderId, string>,
  catchType: {
    forward: '{前|まえ}に{出|で}ながら',
    side: '{横|よこ}に{動|うご}いて',
    back: '{後|うし}ろ{向|む}きで',
  } satisfies Record<CatchType, string>,
  hidden: '？',
  depth: { shallow: '{前進|ぜんしん}{守備|しゅび}', normal: 'ふつう', deep: '{後|うし}ろに{下|さ}がった{守備|しゅび}' },
};

export const RESULT_CALL: Record<PlayResult, string> = {
  safe: 'セーフ！',
  out_home: 'アウト！',
  stop: '{三塁|さんるい}ストップ',
  out_third: '{三塁|さんるい}でアウト！',
};

export const GRADE_MARK: Record<Grade, string> = { great: '◎', ok: '○', bad: '×' };

export const VERDICT_LABEL: Record<Verdict, string> = {
  nice: 'ナイス{判断|はんだん}！',
  close: 'ギリギリ（どちらもアリ）',
  reckless: 'ちょっと{無理|むり}しすぎ',
  too_cautious: '{慎重|しんちょう}すぎ',
};

export const TIMING_LABEL: Record<Timing, string> = {
  best: 'ベストタイミング！',
  good: 'タイミングOK',
  early: 'ちょっと{早|はや}すぎ（まだ{外野手|がいやしゅ}が{捕|と}る{前|まえ}）',
  hesitate: '{迷|まよ}っちゃった（ランナーが{遅|おそ}くなった）',
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** 評価と結果の組み合わせメッセージ（§5.3） */
export function resultMessage(grade: Grade, decision: 'send' | 'stop', result: PlayResult, outs: OutCount, pSafe: number): string {
  const safe = result === 'safe';
  if (grade === 'great') {
    if (decision === 'send' && safe) return 'ナイス{判断|はんだん}！ {監督|かんとく}もにっこり';
    if (decision === 'send') return '{判断|はんだん}は{正|ただ}しかった！ {今回|こんかい}は{送球|そうきゅう}がよすぎた。{同|おな}じ{場面|ばめん}ならまた{回|まわ}してOK';
    if (result === 'out_third') return '{止|と}めたのは{正解|せいかい}！ でも{止|と}めるのがおそくて{帰|かえ}れなかった。もっと{早|はや}く{合図|あいず}しよう';
    return `ナイスストップ！ {回|まわ}していたら${pct(pSafe)}しかセーフにならなかったよ`;
  }
  if (grade === 'ok') {
    if (safe) return 'ギリギリの{場面|ばめん}、よく{回|まわ}した！ どちらを{選|えら}んでもアリだよ';
    if (decision === 'send') return 'ギリギリの{場面|ばめん}だった。{回|まわ}すのもアリだよ';
    return 'ギリギリの{場面|ばめん}だった。{止|と}めるのもアリだよ';
  }
  if (decision === 'send') {
    if (safe) return '{結果|けっか}オーライ！ でもこの{場面|ばめん}は{止|と}めたほうが{確率|かくりつ}が{高|たか}いよ';
    return `この{場面|ばめん}は{止|と}めるのが{正解|せいかい}。セーフになるのは${pct(pSafe)}くらいだったよ`;
  }
  if (outs === 2) return `2アウトだよ！ {回|まわ}していれば${pct(pSafe)}でセーフだった`;
  return `{回|まわ}していれば${pct(pSafe)}でセーフだった。{思|おも}い{切|き}って{回|まわ}そう！`;
}

/** 監督のひとこと（§6.5）。× でも前向きに */
export function managerComment(grade: Grade, timing: Timing, tl: PlayTimeline, pick: number): string {
  const f = tl.fielding;
  const who = LABEL.fielder[f.fielder];
  const lines: Record<Grade, string[]> = {
    great: [
      'いいぞ！ その{判断|はんだん}が{試合|しあい}を{決|き}めるんだ',
      'よく{見|み}てたな！ コーチャーはチームの{目|め}だ',
      'はっきりした{合図|あいず}、ランナーも{走|はし}りやすいぞ',
    ],
    ok: [
      'むずかしい{場面|ばめん}だったな。どっちもアリだ',
      '{悪|わる}くない！ {外野手|がいやしゅ}の{動|うご}きをもう{一歩|いっぽ}よく{見|み}よう',
    ],
    bad: [
      `ドンマイ！ ${who}の{捕|と}り{方|かた}をよく{見|み}てみよう`,
      '{次|つぎ}はアウトカウントを{思|おも}い{出|だ}してから{決|き}めよう',
      'だいじょうぶ、{練習|れんしゅう}すれば{必|かなら}ずわかるようになる',
    ],
  };
  if (timing === 'hesitate') return '{迷|まよ}ったら{負|ま}けだ！ {早|はや}めに、はっきり{合図|あいず}しよう';
  const arr = lines[grade];
  return arr[pick % arr.length];
}

export function directionName(angleDeg: number): string {
  const a = angleDeg;
  if (a < -33) return 'レフト{線|せん}';
  if (a < -21) return 'レフト';
  if (a < -8) return '{左中間|さちゅうかん}';
  if (a <= 8) return 'センター';
  if (a <= 21) return '{右中間|うちゅうかん}';
  if (a <= 33) return 'ライト';
  return 'ライト{線|せん}';
}

const TYPE_SUFFIX: Record<BallType, string> = {
  ground: 'へのゴロ',
  liner: 'へのライナー',
  fly_drop: 'の{前|まえ}にポトリと{落|お}ちる{打球|だきゅう}',
  over: 'の{頭|あたま}を{越|こ}える{打球|だきゅう}',
};

export function describeBall(sc: Scenario, tl?: PlayTimeline): string {
  const angle = tl?.ball.angleDeg ?? sc.battedBall.angleDeg;
  const s = LABEL.strength[sc.battedBall.strength];
  return `${directionName(angle)}${TYPE_SUFFIX[sc.battedBall.type]}（${s}{打球|だきゅう}）`;
}

export const OUTS_ADVICE: Record<OutCount, string> = {
  0: '0アウト → {慎重|しんちょう}に（あとのバッターが{返|かえ}してくれる）',
  1: '1アウト → ふつう',
  2: '2アウト → {積極的|せっきょくてき}に（つぎのバッターがアウトなら{点|てん}が{入|はい}らない）',
};

export type ChecklistItem = { label: string; text: string; tone: 'go' | 'stop' | 'neutral' };

/** 判断ポイントの解説（§9.5） */
export function checklist(tl: PlayTimeline, threshold: number, timing: Timing): ChecklistItem[] {
  const sc = tl.scenario;
  const f = tl.fielding;
  const th = tl.throwPlan;
  const arm = sc.outfieldArm[f.fielder];
  const items: ChecklistItem[] = [];
  items.push({
    label: 'アウトカウント',
    text: `${OUTS_ADVICE[sc.outs]}。{基準|きじゅん}は ${pct(threshold)}`,
    tone: sc.outs === 2 ? 'go' : sc.outs === 0 ? 'stop' : 'neutral',
  });
  items.push({ label: '{打球|だきゅう}', text: describeBall(sc, tl), tone: 'neutral' });
  const speedWord = { forward: '{送球|そうきゅう}が{早|はや}い', side: '{送球|そうきゅう}まで{少|すこ}し{時間|じかん}がかかる', back: '{送球|そうきゅう}まで{時間|じかん}がかかる' }[f.catchType];
  let fText = `${LABEL.fielder[f.fielder]}は${LABEL.catchType[f.catchType]}{捕球|ほきゅう} → ${speedWord}`;
  if (f.fumble) fText += '。しかもファンブル！ → チャンス';
  items.push({ label: '{外野手|がいやしゅ}', text: fText, tone: f.fumble || f.catchType === 'back' ? 'go' : f.catchType === 'forward' ? 'stop' : 'neutral' });
  const d = Math.round(th.distance);
  let aText = `${LABEL.arm[arm]}、{送球|そうきゅう}{距離|きょり} ${d}m → `;
  if (th.relay) aText += '{遠|とお}すぎて{中継|ちゅうけい}が{入|はい}る（{時間|じかん}がかかる）';
  else if (d > ARM[arm].dMax / 2) aText += '{山|やま}なり{送球|そうきゅう}になりやすい';
  else aText += 'ノーバウンドで{速|はや}い{送球|そうきゅう}がくる';
  items.push({ label: '{肩|かた}', text: aText, tone: th.relay || d > ARM[arm].dMax * 0.8 ? 'go' : d <= ARM[arm].dMax / 2 ? 'stop' : 'neutral' });
  items.push({
    label: 'ランナー',
    text: `{足|あし}は${LABEL.runnerSpeed[sc.runnerSpeed]}`,
    tone: sc.runnerSpeed === 'fast' ? 'go' : sc.runnerSpeed === 'slow' ? 'stop' : 'neutral',
  });
  items.push({ label: 'タイミング', text: TIMING_LABEL[timing], tone: timing === 'best' || timing === 'good' ? 'go' : 'stop' });
  return items;
}

export const HINT = {
  title: 'ここで{判断|はんだん}！',
  /** 上のバーに1行で出すので短く */
  points: (sc: Scenario) => {
    const list = [
      ['0アウト→{慎重|しんちょう}に', '1アウト→ふつう', '2アウト→{積極的|せっきょくてき}に'][sc.outs],
      '{外野手|がいやしゅ}は{前|まえ}？{横|よこ}？{後|うし}ろ？',
    ];
    list.push('（タップでつづける）');
    return list;
  },
  resume: 'タップしてつづける',
  batterTitle: 'バッターランナーも{判断|はんだん}！',
  /** 打者走者の判断のヒント（上のバーに1行） */
  batterPoints: (sc: Scenario) => {
    const list = [
      [
        '0アウト→{確実|かくじつ}なら三塁へ',
        '1アウト→三塁ならフライやゴロでも1{点|てん}！',
        '2アウト→{無理|むり}しない',
      ][sc.outs],
      'ボールは{今|いま}どこ？ {中継|ちゅうけい}に{返|かえ}った？',
    ];
    list.push('（タップでつづける）');
    return list;
  },
};

export const INTRO = {
  tapToStart: 'タップでスタート',
  runner: 'ランナー{二塁|にるい}',
  runnerSpeed: 'ランナーの{足|あし}',
  batterSpeed: 'バッターの{足|あし}',
  arms: '{外野手|がいやしゅ}の{肩|かた}',
  inning: (n: number) => `${n}{回|かい}`,
  score: (d: number) => (d === 0 ? '{同点|どうてん}' : d > 0 ? `${d}{点|てん}リード` : `${-d}{点|てん}{負|ま}けている`),
};

export const TUTORIAL_PAGES: { title: string; body: string[]; art: 'role' | 'signs' | 'outs' | 'points' | 'fast' | 'batter' }[] = [
  {
    title: '{三塁|さんるい}コーチャーってなに？',
    art: 'role',
    body: [
      '{三塁|さんるい}の{横|よこ}にいて、ランナーに「{本塁|ほんるい}へ{行|い}け」か「{止|と}まれ」を{伝|つた}える{役|やく}だよ。',
      'ランナーは{前|まえ}を{向|む}いて{走|はし}っているから、{後|うし}ろの{打球|だきゅう}や{外野手|がいやしゅ}が{見|み}えない。',
      'コーチャーは、ランナーの「{目|め}」なんだ。',
    ],
  },
  {
    title: '{合図|あいず}は2つ',
    art: 'signs',
    body: [
      '🔄 {回|まわ}せ！ … {腕|うで}をぐるぐる{回|まわ}す。「{本塁|ほんるい}まで{行|い}け！」',
      '✋ {止|と}まれ！ … {両手|りょうて}を{上|あ}げる。「{三塁|さんるい}で{止|と}まれ！」',
      'ランナーから{見|み}えるように、{大|おお}きく、はっきり！',
    ],
  },
  {
    title: 'アウトカウントで{変|か}わる',
    art: 'outs',
    body: [
      '2アウト：つぎのバッターがアウトならチェンジ。{点|てん}をとるチャンスは{今|いま}！ → {積極的|せっきょくてき}に{回|まわ}す',
      '0アウト：まだあとのバッターが{返|かえ}してくれる。{本塁|ほんるい}でアウトはもったいない → {慎重|しんちょう}に',
      '{同|おな}じ{打球|だきゅう}でも、アウトカウントで{答|こた}えが{変|か}わるよ！',
    ],
  },
  {
    title: 'ここを{見|み}よう',
    art: 'points',
    body: [
      '{打球|だきゅう}の{強|つよ}さ：{強|つよ}い{打球|だきゅう}はすぐ{外野手|がいやしゅ}に{届|とど}く',
      '{外野手|がいやしゅ}の{捕|と}り{方|かた}：{前|まえ}に{出|で}ながら{捕|と}ると{送球|そうきゅう}が{早|はや}い。{横|よこ}や{後|うし}ろ{向|む}きなら{時間|じかん}がかかる',
      '{肩|かた}と{距離|きょり}：{遠|とお}いと{山|やま}なりや{中継|ちゅうけい}になる',
      'ランナーの{足|あし}：{速|はや}い{子|こ}なら{少|すこ}し{無理|むり}できる',
    ],
  },
  {
    title: '{早|はや}く、はっきり',
    art: 'fast',
    body: [
      'ランナーが{三塁|さんるい}の{手前|てまえ}12mに{来|き}たら、ボタンが{光|ひか}るよ。',
      '{迷|まよ}っているとランナーが{遅|おそ}くなって、どっちを{選|えら}んでも{悪|わる}い{結果|けっか}になる。',
      '{外野手|がいやしゅ}がボールを{捕|と}るところを{見|み}て、すぐ{決|き}めよう！',
    ],
  },
  {
    title: 'バッターランナーにも{合図|あいず}',
    art: 'batter',
    body: [
      '{外野|がいや}の{間|あいだ}を{抜|ぬ}けたり、{頭|あたま}を{越|こ}えたりした{長打|ちょうだ}では、バッターランナーも{二塁|にるい}を{回|まわ}って{三塁|さんるい}をねらえる。',
      '{二塁|にるい}ランナーを{回|まわ}したあと、ボタンが「二塁ストップ」「三塁へ！」に{変|か}わるよ。',
      '1アウトなら{三塁|さんるい}にいる{価値|かち}が{大|おお}きい。2アウトなら{無理|むり}しない。「{三塁|さんるい}でアウトになるな」が{合言葉|あいことば}！',
    ],
  },
];

export const MODE_INFO = {
  tutorial: { title: '{入門|にゅうもん}', desc: 'コーチャーの{役目|やくめ}と{見|み}るポイント。かんたんな3{問|もん}' },
  challenge: { title: 'チャレンジ', desc: 'ランダム10プレーで{合計|ごうけい}スコア。★1〜3' },
  compare: { title: 'アウトカウント{比較|ひかく}', desc: '{同|おな}じ{打球|だきゅう}を0・1・2アウトで。{答|こた}えが{変|か}わる！' },
  anohi: { title: 'あの{日|ひ}の{場面|ばめん}', desc: '2アウト{二塁|にるい}、{左中間|さちゅうかん}へのゴロ。{君|きみ}ならどうする？' },
  free: { title: '{自由|じゆう}{練習|れんしゅう}', desc: '{状況|じょうきょう}と{打球|だきゅう}を{自分|じぶん}で{決|き}める（コーチ{向|む}け）' },
};

export const ANOHI_STORY =
  '2アウト、ランナー{二塁|にるい}。ショートの{横|よこ}を{抜|ぬ}けるゴロが{左中間|さちゅうかん}へ。レフトが{前|まえ}に{出|で}ながら{捕|と}った。あの{日|ひ}のコーチャーは{止|と}めた。{監督|かんとく}は「{回|まわ}せ！」と{言|い}った。…{君|きみ}ならどうする？';

export const COMBO_TEXT = (n: number) => `🔥 ${n}{連続|れんぞく}ナイス{判断|はんだん}！`;

export const RECORDS = {
  tendency: (outs: OutCount, kind: 'stop' | 'send', rate: number) =>
    kind === 'stop'
      ? `${outs}アウトで{止|と}めすぎの{傾向|けいこう}があるよ（{止|と}めた{場面|ばめん}の${pct(rate)}は{回|まわ}すのが{正解|せいかい}だった）`
      : `${outs}アウトで{回|まわ}しすぎの{傾向|けいこう}があるよ（{回|まわ}した{場面|ばめん}の${pct(rate)}は{止|と}めるのが{正解|せいかい}だった）`,
  noTendency: 'いい{感|かん}じ！ {目立|めだ}ったクセはないよ',
  needMore: 'もっと{遊|あそ}ぶと、クセがわかるよ',
  clearConfirm: '{記録|きろく}を{全部|ぜんぶ}{消|け}しますか？（★・バッジも{消|き}えます）',
};

/** 声（端末の読み上げでしゃべる）。ふりがな記法は使わない */
export const VOICE = {
  contact: ['打ったー！', 'カキーン！ 打ったー！'],
  send: ['回れ回れー！', '回れー！', '行けー！ 回れー！'],
  stop: ['止まれー！', 'ストップ、ストップ！'],
  slide: ['滑れー！'],
  safe: 'セーフ！',
  out: 'アウト！',
  nice: ['ナイス判断！', 'ナイス！'],
  bsend: ['三塁まで来い！', '回れ回れ、三塁！'],
  bstop: ['二塁ストップ！', 'ストップ、二塁！'],
};

// ---- 打者走者（二塁を回るか） ----

export const BATTER_RESULT: Record<BatterResult, string> = {
  second: '{二塁|にるい}ストップ',
  third: '{三塁|さんるい}セーフ！',
  out_third: '{三塁|さんるい}でアウト！',
};

export const BATTER_OUTS_ADVICE: Record<OutCount, string> = {
  0: '0アウト → {確実|かくじつ}なときだけ三塁へ（{三塁|さんるい}でアウトになるのはもったいない）',
  1: '1アウト → 三塁にいれば{外野|がいや}フライやゴロでも1{点|てん}。ねらう{価値|かち}が{大|おお}きい',
  2: '2アウト → {無理|むり}しない。{二塁|にるい}でも三塁でも、ヒット1{本|ぽん}で{帰|かえ}れるのは{同|おな}じ',
};

/** 打者走者の判断のメッセージ */
export function batterMessage(grade: Grade, decision: 'send' | 'stop', result: BatterResult, outs: OutCount, pSafe: number): string {
  const p = `${Math.round(pSafe * 100)}%`;
  if (grade === 'great') {
    if (decision === 'send' && result === 'third') return 'ナイス！ {三塁|さんるい}まで{行|い}けた。これで{次|つぎ}のチャンスが{広|ひろ}がる';
    if (decision === 'send') return `{判断|はんだん}は{正|ただ}しかった！ セーフになるのは${p}。{今回|こんかい}は{守備|しゅび}がうまかった`;
    return `ナイスストップ！ 三塁へ{行|い}かせていたら${p}しかセーフにならなかった`;
  }
  if (grade === 'ok') return 'ギリギリの{場面|ばめん}。どちらを{選|えら}んでもアリだよ';
  if (decision === 'send') {
    if (result === 'third') return '{結果|けっか}オーライ！ でも{二塁|にるい}で{止|と}めたほうが{安全|あんぜん}だったよ';
    return outs === 2
      ? '2アウトは{無理|むり}しない！ {二塁|にるい}でもヒット1{本|ぽん}で{帰|かえ}れるよ'
      : `{三塁|さんるい}でアウトはもったいない。セーフになるのは${p}くらいだったよ`;
  }
  return outs === 1
    ? `1アウトなら{三塁|さんるい}へ！ ${p}でセーフだった`
    : `{三塁|さんるい}へ{行|い}かせていれば${p}でセーフだった`;
}

/** 打者走者の判断ポイント */
export function batterChecklist(tl: PlayTimeline, threshold: number, timing: Timing): ChecklistItem[] {
  const sc = tl.scenario;
  const f = tl.fielding;
  const b = tl.batter!;
  const items: ChecklistItem[] = [
    {
      label: 'アウトカウント',
      text: `${BATTER_OUTS_ADVICE[sc.outs]}。{基準|きじゅん}は ${Math.round(threshold * 100)}%`,
      tone: sc.outs === 1 ? 'go' : sc.outs === 2 ? 'stop' : 'neutral',
    },
  ];
  let ball = `${LABEL.fielder[f.fielder]}は${LABEL.catchType[f.catchType]}{捕球|ほきゅう}`;
  if (tl.ball.reachesFence) ball = 'フェンスまで{転|ころ}がった → ' + ball;
  if (tl.throwPlan.relay) ball += '、{中継|ちゅうけい}が{入|はい}る';
  if (f.fumble) ball += '。しかもファンブル！';
  items.push({ label: 'ボール', text: ball, tone: f.catchType === 'back' || f.fumble ? 'go' : 'neutral' });
  if (b.throw?.via === 'cut')
    items.push({
      label: '{守備|しゅび}',
      text: '{二塁|にるい}ランナーが{楽|らく}に{帰|かえ}れるので、{中継|ちゅうけい}は三塁へ{投|な}げてきた',
      tone: 'stop',
    });
  items.push({
    label: 'バッター',
    text: `{足|あし}は${LABEL.runnerSpeed[sc.batterSpeed ?? 'normal']}`,
    tone: sc.batterSpeed === 'fast' ? 'go' : sc.batterSpeed === 'slow' ? 'stop' : 'neutral',
  });
  items.push({ label: 'タイミング', text: TIMING_LABEL[timing], tone: timing === 'best' || timing === 'good' ? 'go' : 'stop' });
  return items;
}
