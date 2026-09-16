import {
  createAppShellApplicationMenu,
  createRuntimeMessageIndicator,
} from '@kubohiroya/turbowarp-app-shell';
import config from '../config/app.json';
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
  'いまできるのは市松模様の表示までです。撮影・solve・プロファイルの書き出しはまだ動作しません。',
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
  '1 / 2 / 3 … 市松模様を表示する（内側コーナー 9x6 / 7x5 / 5x4）',
  'c … 撮影して校正する側になる（段階2で実装）',
  'space … 役割を選び直す。模様を消してモニタを戻す',
])
  keyList.append(element('li', line));
keys.append(keyList);
mount.append(keys);

const notes = element('section', '');
notes.append(element('h2', '校正するときの注意'));
const noteList = document.createElement('ul');
for (const line of [
  '内部校正に実寸は要りません。マスの実寸は fx・fy・cx・cy と歪み係数のどれにも影響せず、効くのは外部姿勢のスケールだけです。実寸が必要になるのは turbowarp-time-space-sync の配置校正で、ここではありません。',
  '画面に表示した模様はモアレ、輝度の飽和、そして傾けられる角度の少なさに注意してください。印刷した板は自由に傾けられます。どちらを使ったかは結果に記録します。',
  '固定rigへ搭載したあとは角度も距離も変えにくくなります。搭載前に校正するか、搭載後はカメラではなく模様のほうを動かしてください。',
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
if (featureFlags.experimentalRuntime) {
  errors.show({
    message: '実験機能は未実装です。フラグをOFFに戻してください。',
  });
}
