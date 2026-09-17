import {
  createAppShellApplicationMenu,
  createRuntimeMessageIndicator,
} from '@kubohiroya/turbowarp-app-shell';
import config from '../config/app.json';
import { BOARDS, printedCellMillimetres, squaresLabel } from './board.ts';
import { boardId, findBoard, patternFile, showPattern } from './pattern.ts';
import { featureFlags } from '../config/feature-flags.ts';
import './style.css';

const mount = document.querySelector<HTMLElement>('#app');
if (!mount) throw new Error('Application mount is missing.');

function element(tag: string, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
document.title = config.title;
mount.append(element('h1', config.title), element('p', config.summary));
const note = element(
  'p',
  '模様の表示はこのページが、撮影と校正はダウンロードしたSB3が行います。プロファイルの書き出しはまだ動作しません。',
);
note.className = 'note';
mount.append(note);
const status = element('section', 'モードを選ぶと予定する操作を表示します。');
const menuMount = element('section', '');
mount.append(menuMount, status);
const errors = createRuntimeMessageIndicator({
  document,
  mount,
  locales: { ja: { title: '起動エラー' }, en: { title: 'Startup error' } },
  initialLocale: 'ja',
});
const menu = createAppShellApplicationMenu({
  document,
  mount: menuMount,
  initialLocale: 'ja',
  actions: config.modes.map((mode) => ({
    id: mode.id,
    labels: { ja: mode.label, en: mode.label },
    onSelect: () => {
      status.textContent = mode.description;
    },
  })),
  onError: (error) =>
    errors.show({
      message: error instanceof Error ? error.message : String(error),
    }),
});
menu.show();
const download = document.createElement('a');
download.href = './downloads/app.sb3';
download.download = `${config.slug}.sb3`;
download.textContent = '起動確認用SB3をダウンロード';
mount.append(download);
const keys = element('section', '');
keys.append(element('h2', 'SB3の操作'));
const keyList = document.createElement('ul');
for (const line of [
  '緑の旗 … 最初の画面を開きます。ここで、この端末に板を表示するか、カメラを校正するかを選びます',
  '「ボードを表示」の 10x7 / 8x6 / 6x5 … この端末に板を出します。数字は横×縦のマスの数です。画面をクリックすると最初の画面に戻ります',
  '「校正を始める」の 10x7 / 8x6 / 6x5 … 手元の板と同じものを押すと、カメラが起動して校正が始まります',
  '撮影中 … 押すものはありません。画面の絵と音の案内に従って板を傾けてください。撮影・計算・camera-source への登録まで自動で進みます',
  '校正できたら … 画面のQRコードを別の端末で読み取るか、profile欄の項目上で右クリックして「書き出し」を選び、ファイルに保存します。「戻る」で最初の画面に戻ります',
  'i … profile欄に「読み込み」したプロファイルを適用し、このカメラに使えるかを表示します',
  '停止ボタン … 校正をやめ、カメラを返します',
])
  keyList.append(element('li', line));
keys.append(keyList);
mount.append(keys);

const notes = element('section', '');
notes.append(element('h2', '校正するときの注意'));
const noteList = document.createElement('ul');
for (const line of [
  '内部校正に実寸は要りません。マスの実寸は fx・fy・cx・cy と歪み係数のどれにも影響せず、効くのは外部姿勢のスケールだけです。実寸が必要になるのは turbowarp-time-space-sync の配置校正で、ここではありません。',
  '板は傾けてください。正対したままのサンプルばかりだと焦点距離と距離が分離できず、解が縮退します。傾けずに横へずらすだけでは足りません。',
  'カメラと板の、動かしやすいほうを動かします。内蔵カメラなら板を持って動かすのが確実です。画面に表示した模様は傾けられないので、その場合はカメラのほうを動かします。',
  '固定rigへ搭載したあとは角度も距離も変えにくくなります。搭載前に校正するか、搭載後は板のほうを動かしてください。表示した模様は動かせないので、この場合は印刷板だけが使えます。',
])
  noteList.append(element('li', line));
notes.append(noteList);
mount.append(notes);

const plan = element('section', '');
plan.append(element('h2', '実装予定'));
const list = document.createElement('ul');
for (const feature of config.plannedFeatures)
  list.append(element('li', feature));
plan.append(list);
mount.append(plan);
const build = element('section', '');
build.append(element('h2', 'このビルドの状態'));
const buildList = document.createElement('ul');
buildList.append(
  element(
    'li',
    featureFlags.captureAndSolveV1
      ? '撮影と校正：有効。camera-source・camera-calibration・qr-display をSB3へ埋め込んでいます（OpenCVを含むため数MBになります）。'
      : '撮影と校正：無効。拡張はSB3へ埋め込んでいないので、配布物は数KBです。config/feature-flags.ts の captureAndSolveV1 をONにして pnpm source:update すると、拡張を埋め込んだSB3が作られます。',
  ),
);
buildList.append(element('li', '模様の表示：有効。拡張もカメラも使いません。'));
build.append(buildList);
mount.append(build);

/**
 * The board, over the page rather than instead of it.
 *
 * An overlay rather than a navigation, so leaving it costs nothing and the page
 * underneath keeps its state. `?pattern=9x6` opens it directly, which is what
 * the second window this page opens is pointed at -- and it means the view can
 * be bookmarked, dragged to another screen, and reopened after a stray Escape.
 */
function openPattern(board: (typeof BOARDS)[number]): void {
  const overlay = document.createElement('div');
  overlay.className = 'pattern-overlay';
  const stage = document.createElement('div');
  stage.className = 'pattern-stage';
  const readout = element('p', '');
  readout.className = 'pattern-readout';
  overlay.append(stage, readout);
  document.body.append(overlay);

  const view = showPattern(stage, board, () => {
    view.close();
    overlay.remove();
    if (new URLSearchParams(location.search).has('pattern')) {
      history.replaceState(null, '', location.pathname);
    }
  });

  const update = () => {
    const size = view.measure();
    readout.textContent =
      `マス ${squaresLabel(board)}` +
      `（内側コーナー ${board.columns}x${board.rows}）` +
      ` 1マス ≈ ${size.cellMillimetres.toFixed(1)} mm（公称値。実寸は定規で測ってください）` +
      ' — クリックまたは Esc で戻る';
  };
  update();
  window.addEventListener('resize', update);
}

const patterns = element('section', '');
patterns.append(element('h2', 'ChArUcoボードを表示する'));
const intro = element(
  'p',
  '校正する側のカメラに見せるための板です。表示した画面、または印刷した紙のどちらでも構いません。レンズの校正そのものにマスの実寸は要りません。スケールは解に入らないためです。',
);
patterns.append(intro);
patterns.append(
  element(
    'p',
    `実寸が効くのは、校正の副産物として板の姿勢を測るときだけです。そちらは距離がそのまま実寸に比例するので、下に書いた「A4原寸で刷ったときの1マス」がずれていれば、同じ割合で距離がずれます。正確に出したい場合は、刷った紙に定規を当てて測ってください。`,
  ),
);
patterns.append(
  element(
    'p',
    '白いマスの中にある小さな模様はArUcoマーカーで、それぞれが周囲のコーナーに名前を与えます。おかげで板が画面からはみ出していても、写っている分だけを校正に使えます。ふつうの市松模様は全体が写っていないと1点も使えません。',
  ),
);

const boardList = document.createElement('ul');
boardList.className = 'boards';
for (const board of BOARDS) {
  const item = document.createElement('li');
  const name = element(
    'span',
    `マス ${squaresLabel(board)}（内側コーナー ${board.columns}x${board.rows}）` +
      ` / A4原寸で1マス ${printedCellMillimetres(board).toFixed(1)} mm`,
  );
  const openHere = document.createElement('button');
  openHere.type = 'button';
  openHere.textContent = '全画面で表示';
  openHere.addEventListener('click', () => openPattern(board));

  const openThere = document.createElement('button');
  openThere.type = 'button';
  openThere.textContent = '別ウィンドウで開く';
  openThere.addEventListener('click', () => {
    // For the two-screen arrangement: move this window to the other display
    // and put it full screen there. The two windows never talk to each other;
    // calibration needs no data to pass between them.
    window.open(`${location.pathname}?pattern=${boardId(board)}`, '_blank');
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'SVGを保存';
  save.addEventListener('click', () => {
    const url = URL.createObjectURL(patternFile(board));
    const link = document.createElement('a');
    link.href = url;
    link.download = `charuco-${boardId(board)}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  });

  item.append(name, openHere, openThere, save);
  boardList.append(item);
}
patterns.append(boardList);

const handover = element('section', '');
handover.append(element('h3', '校正できたあと — プロファイルの受け渡し'));
for (const line of [
  '緑の旗で始まり、停止ボタンで終わります。それ以外に押すものはありません — 撮る・解く・登録まで自動です。板も、かざしたものを見つけます。',
  '校正が終わると、その場で camera-source に登録されます。',
  '同時に、ステージ左の profile リストに校正データ（JSON）が入ります。リストを右クリックして「書き出す」で、ファイルとして保存できます。これが消費側アプリへの受け渡し経路です。',
  '既存のプロファイルを読み込むときは、同じリストを右クリックして「読み込む」でファイルを選び、そのあと i キーを押してください。ここだけは操作が要ります — ファイルを選ぶのは人にしかできないので。',
  '読み込んだあと、fit の欄がこのカメラに使えるかを言います。「判定できません」は「たぶん使える」ではありません。撮影条件を確かめられなかったという意味で、そのときプロファイルは適用されません。',
]) {
  handover.append(element('p', line));
}
mount.append(handover);

const media = element('section', '');
media.append(element('h3', '見せ方によっては結果が偏ります'));
const mediaList = document.createElement('ul');
for (const line of [
  '印刷板：平らで非光沢のものを。A4横に「実際のサイズ」「100%」で刷ってください。「用紙に合わせる」で縮むと1マスの実寸が上の値からずれ、片方だけ伸びればマスが長方形になって校正そのものが偏ります。',
  '液晶モニタ・テレビ：1:1で表示してください。テレビは既定でオーバースキャンやアスペクト補正を掛けることがあり、これもマスを長方形にします。',
  'タブレット：自動回転・自動輝度・スリープを切ってください。映り込みに注意。',
  'プロジェクタは推奨しません。投影面に正対していない、台形補正が入っている、プロジェクタ自身のレンズ歪みがある、のいずれでも格子が正則でなくなります。厄介なことに、この偏りは再投影誤差には現れません。',
])
  mediaList.append(element('li', line));
media.append(mediaList);
patterns.append(media);
mount.append(patterns);

const deepLink = findBoard(new URLSearchParams(location.search).get('pattern'));
if (deepLink) openPattern(deepLink);
