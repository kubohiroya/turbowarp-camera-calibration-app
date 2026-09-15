# 抽出元と共通化した構成

- turbowarp-kamishibai-app（remote: kubohiroya/tm-kamishibai）、commit df327c6dfdb54f9afd165b49b0187dc9a95fdee4: app-shellの依存利用、ソースから配布ページとSB3を生成する構成、用途固有のDSLと配布物を区別する方針。
- turbowarp-realtime-motion-capture-app、commit 58870c32e6ba340999ab20cebef92465051269e9: apps/<app>/sourceの展開済みSB3、sb3-toolchainによる検証・ビルド、TypeScriptを正本とする起動スクリプト、起動時固定・既定OFFのフラグ、releaseのSHA-256。

既存アプリは変更しない。用途固有のblock、モデル、認証情報、peer設定、拡張bundleは抽出しない。上記の設計パターンを最小構成へ一般化し、生成器と背景SVGは新規に作成した。既存コードの全文コピーではない。共有DOM機能はMPL-2.0のturbowarp-app-shell 0.2.0を依存として再利用する。

将来の拡張埋め込みではexact version、artifact hash、API manifest、評価順序を固定する。初期雛形には拡張はなく、SB3の緑の旗で状態変数が更新されるだけ。配布ページはプレイヤーを内蔵しない。player、local-host、オフライン配布は用途確定後の追加項目。
