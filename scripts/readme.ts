export interface AppConfig {
  slug: string;
  title: string;
  summary: string;
  modes: { id: string; label: string; description: string }[];
  plannedFeatures: string[];
  plannedDependencies: string[];
}
export function readme(config: AppConfig): string {
  return `# ${config.title}

${config.summary}

## 現在の内容

turbowarp-app-templateから生成した初期雛形です。用途固有の機能は未実装です。

- 共通app-shellを利用したモード選択・案内・エラー表示。
- 展開済みSB3ソースと、緑の旗で状態変数を更新する起動確認スクリプト。
- SB3と配布ページのビルド、SHA-256の記録、CI。

配布ページはTurboWarpプレイヤーを内蔵せず、起動確認用SB3のダウンロードを提供します。開発サーバーでダウンロードする際は事前にbuild:sb3を実行してください。

## 実装予定

${config.plannedFeatures.map((item) => `- ${item}`).join('\n')}

## モード

${config.modes.map((mode) => `- **${mode.label}**：${mode.description}`).join('\n')}

## 依存と責務

${config.plannedDependencies.map((item) => `- ${item}`).join('\n') || '- テンプレートには用途固有の拡張依存を含めません。'}

実際の依存はpackage.jsonのturbowarp-app-shell 0.2.0のみです。上記の用途固有の接続は予定であり、未公開の初期拡張に依存しません。追加時には拡張のexact version、配布物hash、API manifest、評価順序を固定します。

## 構成と開発

Node.js >=22.18.0、pnpm 11.11.0。

\`\`\`bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
\`\`\`

- config/app.json：名前、モード、説明、実装予定。
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
