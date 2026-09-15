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
  '初期雛形：カメラ取得・同期・追跡・再構成はまだ動作しません。',
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
