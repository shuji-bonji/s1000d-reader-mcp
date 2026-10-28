# Changelog

## 0.7.0 (2026-10-28)

### 追加

- `read_data_module` の `section: "outline"`（概要モード。段階 2.5 の作業 7、D-19）。見出し・手順の番号・最初の 1 文と、部分木の大きさ（節点数・文字数・種類ごとの数・警告の数）だけを返し、本文と参照の一覧は返しません。`outlineDepth` で深さを絞れます。適用性の判定は本文と同じ規則で付きます。処理は core 0.7.0 の `outlineContent` / `measureContent`。
- `read_data_module` と `read_publication_module` の応答の先頭に `securityClassification`（識別・状態部の値 `dataModule` と、本文の要素に付いた値ごとの数 `inContent`）を必ず付けるようにしました。値は解釈しません。本文の各節点にも `securityClassification` が付きます（core 0.7.0）。
- 本文（`content`）に `size` を付けました。

### 変更

- 依存を core `^0.7.0` に上げました。`instructions` に、大きなデータモジュールは概要モードから読む手順と、機密区分を見てから引用する注意を足しました。

## 0.6.0 (2026-10-28)

### 追加

- `list_data_modules` の `include` に `dml` / `ddn` を渡したとき、行にコード・発行日・行数（納入物の件数）と、CSDB との照合の集計 `reconciliation`（`found` / `issue-mismatch` / `not-found` / `not-checked`。DML では `notListed` の数も）を付けるようにしました（段階 2.5 の作業 5、D-19。core 0.6.0 の `readDml` / `readDdn` / `reconcileDml` / `reconcileDdn`）。行ごとの結果は `s1000d-verify-mcp` の `reconcile_dml` が返します。
- `include` に `dme`（拡張 DMC のデータモジュール）を足しました。

### 変更

- 依存を core `^0.6.0` に上げました。

## 0.5.0 (2026-10-27)

### 追加

- Streamable HTTP での起動（`--http`。`--host` / `--port` / `--path` / `--allowed-host` / `--allowed-origin`。段階 2.5 の作業 4、D-19）。MCP SDK v2 の `createMcpHandler` を `node:http` に載せました。`GET /healthz` は名前と版を返します。loopback に束縛したときは `Host` と `Origin` を localhost 系に限り、それ以外では検査しません。認証・権限・マルチテナントは持ちません（製品側の責務）。既定の stdio は変わりません。

## 0.4.0 (2026-10-27)

### 変更

- 依存を core `^0.5.0` に上げ、CSDB の中身（DMC・PMC で指定された DM、ACT・CCT・PCT、適用性リポジトリ、参照先の題名、IMF）を `readFileSync(o.path)` ではなく索引の `read()`（core 0.5.0 の `CsdbSource`）から読むようにしました。既定のフォルダー実装では結果は変わりません。製品側が `CsdbSource` を差し込む土台です（段階 2.5 の作業 3）。ツール引数の `path` と `xml` の読み取りはこれまでどおりです。

## 0.3.0 (2026-10-27)

### 追加

- `S1000D_SPEC_DIR` / `S1000D_CSDB_DIR` が無いときに、設定ファイル `~/.config/s1000d-stack/config.json`（`XDG_CONFIG_HOME` に従う、`S1000D_CONFIG` で変更可）の `specDir` / `csdbDirs` を読むようにしました（core の `resolveStackConfig`）。Claude Desktop が plugin で入れたサーバーに環境変数を渡さず、plugin の `env` の `${VAR}` も置き換えないためです。置き換えられずに渡った `${VAR}` は使わず、応答の `_notes` に理由を書きます。配布物の場所が決まらないときの案内にも、設定ファイルの場所を出します。
- `instructions` と README（英語・日本語）に設定ファイルの説明を足しました。

**core 0.4.0（`resolveStackConfig`）の公開後に依存を上げてから公開します。**

## 0.2.0 (2026-10-27)

依存を `@shuji-bonji/s1000d-core` `^0.3.0` に上げました（Issue #1）。ツールと応答は変わりません。core の版に合わせて 0.2.0 として公開しました（CHANGELOG の見出しは当初 0.1.2 と書いていた）。

### 変更

- ACT・CCT・PCT の探索（`describe_applicability` が使う）を、`services/context.ts` の自前の実装から core 0.3.0 の `findApplicTables` に切り替えました。処理は同じで、s1000d-verify-mcp の `suggest_fixes` と共有するために core へ移したものです。
- core 0.3.0 で BREX の NOTATION の照合が直りました（除外だけの `notationRuleList` を「すべて禁止」と読んでいた誤り）。reader-mcp は既定では BREX を照合しないので、影響は `verify: "full"` のときの `verification.brex` だけです。

## 0.1.1 (2026-10-27)

MCP Registry と claude-plugins marketplace に載せるための版。ツールと応答は 0.1.0 から変わっていません。

### 追加

- `package.json` に `mcpName`（`io.github.shuji-bonji/s1000d-reader-mcp`）、リポジトリ直下に `server.json`（MCP Registry 用。npm パッケージには同梱しない）、`.claude-plugin/plugin.json`（Claude Code の plugin 定義）
- `scripts/sync-plugin-version.mjs`: `npm version` のフックで `plugin.json` と `server.json` の版を `package.json` に揃える

## 0.1.0 (2026-10-26)

最初の版。段階 2 の s1000d-reader-mcp です（ROADMAP の作業 7、design/reader-mcp.md、DECISIONS D-18）。

### 追加

- 6 ツール: `list_data_modules` / `read_data_module` / `read_publication_module` / `resolve_reference` / `describe_applicability` / `read_icn_metadata`
- `initialize` の `instructions` に「しないこと」（式を返さない、準拠を判定しない、要約しない、仕様書を同梱しない）と `undetermined` の読み方を先に書く
- 読み取り・判定・検証は `@shuji-bonji/s1000d-core` 0.2.0（`readContentFromXml` / `ApplicEvaluator` / `verifyDataModule` / `CsdbIndex`）を呼ぶだけ。すべての応答に `verification` を含める。既定は XSD 検証だけ、`verify: "full"` で BREX と参照も
- `product` を渡さないときは適用性を `undetermined` とし、`displayText` だけを返す。`omitNotApplicable` で当てはまらないブロックを省ける
- 適用性リポジトリ（`applic/@applicIdentValue` を持つ DM）を CSDB から集め、`referencedApplicGroupRef/applicRef` 経由の参照を解決する
- `describe_applicability` は、DM の `applic` 文が使う属性のうち PCT が値を割り当てていないものを一覧にする（Bike Samples では `type`）

### 注記

- `S1000D_SPEC_DIR` の下のデータ辞書にある XSD の写しは使いません（import が絶対 URL のため）。
