export interface AppMode {
  id: string;
  label: string;
  description: string;
}
export interface AppTranslation {
  summary?: string;
  modes?: Record<string, { label?: string; description?: string }>;
  plannedFeatures?: string[];
  plannedDependencies?: string[];
}
export interface AppConfig {
  slug: string;
  title: string;
  summary: string;
  modes: AppMode[];
  plannedFeatures: string[];
  plannedDependencies: string[];
  en?: AppTranslation;
}
function list(items: string[], fallback: string): string {
  return items.map((item) => `- ${item}`).join('\n') || fallback;
}
function translatedModes(config: AppConfig): AppMode[] {
  return config.modes.map((mode) => ({
    id: mode.id,
    label: config.en?.modes?.[mode.id]?.label ?? mode.label,
    description: config.en?.modes?.[mode.id]?.description ?? mode.description,
  }));
}
export function readmeJa(config: AppConfig): string {
  return `# ${config.title}

[English](README.md) | **日本語**

${config.summary}

## 現在の内容

turbowarp-app-templateから生成した初期雛形です。用途固有の機能は未実装です。

- 共通app-shellを利用したモード選択・案内・エラー表示。
- 展開済みSB3ソースと、緑の旗で状態変数を更新する起動確認スクリプト。
- SB3と配布ページのビルド、SHA-256の記録、CI。

配布ページはTurboWarpプレイヤーを内蔵せず、起動確認用SB3のダウンロードを提供します。開発サーバーでダウンロードする際は事前にbuild:sb3を実行してください。

## 実装予定

${list(config.plannedFeatures, '- 用途固有の操作と拡張接続を実装する。')}

## モード

${config.modes.map((mode) => `- **${mode.label}**：${mode.description}`).join('\n')}

## 依存と責務

${list(config.plannedDependencies, '- テンプレートには用途固有の拡張依存を含めません。')}

実際の依存はpackage.jsonのturbowarp-app-shell 0.2.0のみです。上記の用途固有の接続は予定であり、未公開の初期拡張に依存しません。追加時には拡張のexact version、配布物hash、API manifest、評価順序を固定します。

## 構成と開発

Node.js >=22.18.0、pnpm 11.11.0。

\`\`\`bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
\`\`\`

- config/app.json：名前、モード、説明、実装予定。英語READMEの訳文はenに置きます。
- config/feature-flags.ts：起動時固定・既定OFFの実験機能フラグ。
- scripts/project.ts：起動確認用SB3の正本。
- apps/main/source：生成した展開済みSB3ソース。
- src：共通シェルを利用する配布ページ。
- public/downloads：生成SB3とrelease.json。
- dist：配布ページとダウンロードのビルド結果。

project.tsやtitleを変更したらpnpm source:updateで生成ソースを更新します。生成SB3・distはGit管理対象外です。アーカイブはsb3-toolchainで生成します。

## 段階導入と受け入れ基準

1. 関連GitHub Issueで既存実装の抽出対象、依存、DoD、切戻しを確定する。
2. 用途固有の経路を既定OFFで追加し、既存側は委譲へ置き換える。
3. 機材による統合検証で誤差・遅延・停止と復旧を記録する。
4. 本体拡張のアルゴリズムをアプリに重複実装しない。

初期雛形のDoDはpnpm check成功、SB3で緑の旗による状態更新、配布ページで説明・モード選択・SB3ダウンロードが確認できることです。カメラを使う用途機能の実機検証は未実施です。

## ロールバックとタスク管理

新経路はconfig/feature-flags.tsのフラグOFFで止め、移行中は旧アプリ経路と互換読取りを保持します。初期フラグをONにしても用途固有の機能は実装されません。

GitHub Issuesを進捗の正本とし、start/done/blockedを記録します。本READMEはローカル草案であり、Issue投稿・push・公開は行っていません。

## 抽出元

紙芝居アプリとrealtime-motion-capture-appから抽出した共通構成を利用しています。詳しくは[抽出記録](docs/extraction.md)を参照してください。

## ライセンス

MPL-2.0。packageは初期状態ではprivateです。
`;
}
export function readmeEn(config: AppConfig): string {
  return `# ${config.title}

**English** | [日本語](README.ja.md)

${config.en?.summary ?? config.summary}

## What's included

This is the initial scaffold generated from turbowarp-app-template. Use-case-specific features are not implemented.

- Mode selection, guidance, and error display built on the shared app-shell.
- Unpacked SB3 sources plus a startup-check script that updates a state variable when the green flag is clicked.
- Builds for the SB3 and the distribution page, SHA-256 recording, and CI.

The distribution page does not embed the TurboWarp player; it offers the startup-check SB3 for download. Run \`build:sb3\` before downloading from the dev server.

## Planned

${list(config.en?.plannedFeatures ?? config.plannedFeatures, '- Implement use-case-specific operations and extension connections.')}

## Modes

${translatedModes(config)
  .map((mode) => `- **${mode.label}**: ${mode.description}`)
  .join('\n')}

## Dependencies and responsibilities

${list(config.en?.plannedDependencies ?? config.plannedDependencies, '- The template does not bundle use-case-specific extension dependencies.')}

The only actual dependency is turbowarp-app-shell 0.2.0 in package.json. The use-case-specific connections above are planned, and do not rely on any unreleased early extension. When one is added, its exact version, artifact hash, API manifest, and evaluation order will be pinned.

## Layout and development

Node.js >=22.18.0, pnpm 11.11.0.

\`\`\`bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
\`\`\`

- \`config/app.json\`: name, modes, description, and planned work. English README text goes under \`en\`.
- \`config/feature-flags.ts\`: experimental feature flags, fixed at startup and OFF by default.
- \`scripts/project.ts\`: the source of truth for the startup-check SB3.
- \`apps/main/source\`: the generated unpacked SB3 sources.
- \`src\`: the distribution page built on the shared shell.
- \`public/downloads\`: the generated SB3 and release.json.
- \`dist\`: build output for the distribution page and downloads.

After changing \`project.ts\` or the title, run \`pnpm source:update\` to regenerate the sources. Generated SB3 files and \`dist\` are not tracked by Git. Archives are produced with sb3-toolchain.

## Staged rollout and acceptance criteria

1. In the related GitHub Issue, settle what to extract from the existing implementation, its dependencies, the DoD, and the rollback path.
2. Add the use-case-specific path behind a flag that is OFF by default, and replace the existing path with delegation.
3. Record error, latency, stalls, and recovery in hardware integration testing.
4. Do not reimplement the core extension's algorithms inside the app.

The DoD for the initial scaffold is: \`pnpm check\` passes, the SB3 updates its state on the green flag, and the distribution page shows the description, mode selection, and SB3 download. Real-device verification of camera-based features has not been performed.

## Rollback and task management

New paths are stopped by turning their flag OFF in \`config/feature-flags.ts\`, and compatibility reads for the old app path are kept during migration. Turning the initial flags ON does not implement any use-case-specific feature.

GitHub Issues are the source of truth for progress, recording start/done/blocked. This README is a local draft; nothing has been posted to Issues, pushed, or published.

## Origin

The shared structure is extracted from the kamishibai (picture-story) app and realtime-motion-capture-app. See the [extraction notes](docs/extraction.md) (Japanese) for details.

## License

MPL-2.0. The package is private in its initial state.
`;
}
