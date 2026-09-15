# TurboWarp Camera Calibration App

[English](README.md) | **日本語**

市松模様の表示と撮影を1つのアプリで行い、カメラのレンズ校正プロファイルを作成して書き出すアプリです。

## 現在の内容

turbowarp-app-templateから生成した初期雛形です。用途固有の機能は未実装です。

- 共通app-shellを利用したモード選択・案内・エラー表示。
- 展開済みSB3ソースと、緑の旗で状態変数を更新する起動確認スクリプト。
- SB3と配布ページのビルド、SHA-256の記録、CI。

配布ページはTurboWarpプレイヤーを内蔵せず、起動確認用SB3のダウンロードを提供します。開発サーバーでダウンロードする際は事前にbuild:sb3を実行してください。

## 実装予定

- camera-calibration拡張の校正blockを呼び、開始・サンプル追加・solve・cancel・後始末を案内する。
- 異なる角度・距離での撮影を促し、サンプルの姿勢分散と品質を表示する。単一固定視点の連写で完了扱いにしない。
- 市松模様を全画面表示し、セル寸法と表示条件を記録する。内部校正に実寸は不要で、実寸は配置校正にのみ効くことを案内する。
- 再投影誤差と品質を表示し、校正に使っていない画像で検証する。
- 内部校正プロファイルをJSONで書き出し、消費側アプリへファイルで渡す。既存プロファイルの読込みと撮影条件への適合確認も行う。

## モード

- **模様を表示**：市松模様を全画面表示する。別のPCやカメラから撮影する。
- **撮影して校正**：表示画面または印刷した模様をカメラで撮影し、レンズ校正を解く。

## 依存と責務

- camera-source：カメラ取得・lease・撮影条件と、内部校正プロファイルの契約。
- camera-calibration：チェスボード抽出とsolve。OpenCVを含む。
- time-space-sync-app／realtime-motion-capture-app／photogrammetry-app：プロファイルの利用側。ファイルで受け取る。

実際の依存はpackage.jsonのturbowarp-app-shell 0.2.0のみです。上記の用途固有の接続は予定であり、未公開の初期拡張に依存しません。追加時には拡張のexact version、配布物hash、API manifest、評価順序を固定します。

## 構成と開発

Node.js >=22.18.0、pnpm 11.11.0。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

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
