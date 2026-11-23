# Changelog

## 0.16.0 (2026-11-24)

Grok Build の試用（2026-11-05）の所見のうち、未確認だった 2 件を直しました（hub の `eval/hosts/grok-build/reports/2026-11/FINDINGS.md` の F-09・F-11）。

### 変更（応答の項目名が変わります）

- **`list_data_modules` の DML の行の `reconciliation.notListed`（件数）を、`reconciliation.notListedCount` にしました。** s1000d-verify-mcp の `reconcile_dml` は、同じ件数を `notListedCount`、行の一覧を `notListed` と呼んでいます。同じ名前が、こちらでは数、verify では配列を指していました。`found`・`issue-mismatch`・`not-found`・`not-checked` は変わりません。

### 修正

- **`read_data_module` でコメント（ルートが `comment`）を読むと、`securityClassification.dataModule` が無く、`note` が「The document declares no securityClassification in its status section.」になっていました。** `commentStatus/security` に値があっても同じでした。識別・状態部から値が取れないときは、状態部（`commentStatus` など）の `security/@securityClassification` を読むようにしました。データモジュールの応答は変わりません。

### テスト

- 自作のコメントで、`securityClassification.dataModule` が `commentStatus` の値になることを確かめるテストを足しました。

## 0.15.0 (2026-11-24)

依存の `@shuji-bonji/s1000d-core` を `^0.17.0` に上げました（`CORE_INFO` を持つ版です）。 公開していない 0.14.1 の修正（`product` を渡さないときの `_notes`）も、この版に含めました。

### 追加

- **すべてのツールの応答の最後に、`_server`（`name`・`version`・`core`）を足しました。** 答えたサーバーのパッケージ名と版、実際に読み込んでいる s1000d-core の版です。成功の応答、想定内の失敗（`{"error": …}`）、想定外の失敗（`isError: true`）のすべてに付きます。ホストが古いプロセスのまま動いているときに、応答から見分けるためです（hub の DECISIONS の D-38、Issue [shuji-bonji/s1000d-stack#12](https://github.com/shuji-bonji/s1000d-stack/issues/12)）。成功の応答の、これまでの項目と順番は変わりません。結果がオブジェクトでないときは `{"result": …, "_server": …}` にします。サーバーの instructions にも `_server` の意味を書きました。

### 修正

- `product` を渡さないとき、`_notes` は「applicability is "undetermined" everywhere」と書いていましたが、式（`assert`・`evaluate`）の無い、表示文だけの適用性は、製品が無くても `applicable`（`reason: "no expression (display text only)"`）になります。同じ応答の中で `_notes` と `identAndStatus.applicability.state` が食い違っていました。`_notes` を「式のある適用性は `undetermined`、表示文だけの適用性は判定するものが無いので `applicable`」に直しました。

## 0.14.0 (2026-11-24)

依存の `@shuji-bonji/s1000d-core` を `^0.16.0` に上げました。このサーバーのコードは変えていませんが、core 0.16.0 が検証状態の参照の数え方を変えたので、`read_data_module`・`read_publication_module` などの `verification.references` が次のように変わります（Grok Build によるリファレンスとの照合で見つかりました。hub の `eval/hosts/grok-build/reports/2026-11/REFCHECK-FINDINGS.md` の R-09）。

### 変更（応答が変わります）

- **`verification.references` は、仕様書（モデル識別コード `S1000D`）への `dmRef` を未解決に数えません。** `unresolvedCount` と `state` は仕様書への参照を除いて決まり、その件数は `specificationReferences`（1 件以上のときだけ付く）に出ます。未解決が仕様書への参照だけの DM は `state` が `resolved` になります。s1000d-verify-mcp 0.9.0・s1000d-writer-mcp 0.7.0 と同じ数え方です。

## 0.13.1 (2026-11-24)

`read_data_module` の `includeLocation` の説明と `_notes` を、応答に合わせました。応答の項目は変わりません。

### 変更（説明と `_notes` の文が変わります）

- **手順の `textLocations` は、`section` が `content`・`all` のときだけ付きます。** これまでの説明と `_notes` は、`section: "outline"` のときにも付くように読めました（実際は、概要の節点には付きません）。`includeLocation` の説明に、概要には付かないことを書きました。`section: "outline"` と `includeLocation: true` の組では、`_notes` に、`textLocations` が付かないことと、手順の段落だけを取り除く・移すときは `content` か `all` で読み直すことを書きます。README（英・日）も合わせました。

### テスト

- 自作の DM のテストで、概要の節点に `textLocations` が無いことと、`_notes` の文を確かめるようにしました。

## 0.13.0 (2026-11-17)

依存の `@shuji-bonji/s1000d-core` を `^0.14.0` に上げ、その読み取りに合わせました。次の版は 0.13.0 です（応答に項目が増えます。これまでの項目は変わりません）。

### 追加

- **`read_data_module` が、更新の理由と変更の印を返します。** これまでは、どちらも応答に無く、無いことの知らせもありませんでした。値は書かれたまま返し、何が変わったかや、印の付け方が仕様に合っているかは判定しません。
  - `identAndStatus.reasonForUpdates`: `dmStatus/reasonForUpdate` を並びの順に返します（`id`・`updateReasonType`・`updateHighlight`・`applicRefId`・`paragraphs`）。1 つも無ければ、項目そのものがありません。
  - 節点と参照の `change`: その要素に書かれている `changeType`・`changeMark`・`reasonForUpdateRefIds`（配列）です。
  - `content.changeMarks`: 3 つの属性のどれかを持つ要素と `changeInline` を、文書の順にすべて返します（`element`・`path`・`line`・`column` と 3 つの属性）。節点にならない要素（`title`、表の `row`、手順の `text` にまとめた段落など）と、本文を構造化して読まない種類のデータモジュール（`structured: false`）の要素も入ります。`section: "outline"` でも返します。`includeLocation` が無くても、`path` は返します。
- **`includeLocation: true` のとき、手順の節点に `textLocations` が付きます。** 手順の `text` にまとめた段落ごとの `location` を、並びの順に持ちます。`edit_data_module` で、その段落だけを取り除く・移すときの場所に使えます。0.12.0 の「親の節点の `text` として返る段落は `location` もありません」は、手順については当たらなくなりました。リストの項目（段落が 1 つで、その段落が `text` になるもの）には付きません。

## 0.12.0 (2026-11-17)

### 追加

- **`read_data_module` に `includeLocation` を足しました。** `true` を渡すと、本文（`content.blocks`）と概要（`content.outline`）の各節点に、`location`（`path`・`line`・`column`）が付きます。s1000d-writer-mcp の `edit_data_module` は、編集する場所を `location.path` で受け取ります。これまでは応答から `location` を外していたので、場所を得る手段がありませんでした。既定は `false` で、応答はこれまでと変わりません。
  - 親の節点の `text` として返る段落（手順の最初の段落など）は、節点が無いので `location` もありません。

## 0.11.1 (2026-11-17)

依存の `@shuji-bonji/s1000d-core` を `^0.13.0` に上げました。core 0.13.0 の変更は、既にあるデータモジュールの構造を変える編集（`editContent`）の追加です。このサーバーの動きは変わりません。

## 0.11.0 (2026-11-17)

依存の `@shuji-bonji/s1000d-core` を `^0.12.0` に上げました。このサーバーのコードは変えていませんが、core が本文を読む範囲を広げたので、`read_data_module` の応答が次のように変わります。Issue 7 の Bike Samples では、本文を構造化して読むデータモジュールのどれにも、知らない要素（`kind: "unknown"`）が無くなりました。

### 変更（応答が変わります）

- **故障の報告（`faultReporting`）を、節点として返します。** これまでは、ほとんどの要素が `kind: "unknown"` の節点でした。不具合 1 件（`isolatedFault`・`detectedFault`・`observedFault`・`correlatedFault`）は `kind: "section"` の節点で、`id` と `attrs.faultCode` を持ちます。不具合を節点にしたので、fault の応答は階層が 1 段増えます。
- **回路遮断器の一覧（`circuitBreakerDescrGroup`）を返します。** グループは `kind: "list"`、遮断器 1 つは `listItem` です。`notReadElements` の `circuitBreakerDescrGroup` は無くなりました。
- **`dmIf` と `dmLoop` の条件の式を `attrs.expression` に返します。** 式は評価せず、文にします（例: `not(level equal "experienced")`）。`dmLoop` は `kind: "sequence"`・`element: "dmLoop"` の節点です。`question` に入るのは、人が書いた文（`humanReadableForm`）だけです。
- **プロセス DM の変数の宣言・代入・検査を返します。** `variableDeclarations` は `kind: "list"` の節点です。`userEntry` の `variableRef` は、`unknown` に数えなくなりました。
- **品目の危険性（`hazards`）、ほかの識別子、備考の脚注（`footnoteRemarks`）を返します。**
- **作業の場所・所要時間・間隔（`productionMaintData`）と、図の改訂の理由（`graphic/reasonForAmendment`）を返します。**

節点の形の詳しい決まりは、s1000d-core の CHANGELOG の 0.12.0 にあります。

### 文書

- ツールの説明文と README で、読んでいない要素の例を、core 0.12.0 でも残るもの（`behavior`・`pubMedia` など）に変えました。

## 0.10.0 (2026-11-16)

依存の `@shuji-bonji/s1000d-core` を `^0.11.0` に上げました。このサーバーのコードは変えていませんが、core が本文を読む範囲を広げたので、`read_data_module` の応答が次のように変わります（次の版は 0.10.0）。

### 変更（応答が変わります）

- **不具合の説明（`faultDescr`）を返します。** `kind: "para"`・`element: "faultDescr"` の節点で、`attrs.faultCode` に同じ親の `fault` のコードが入ります。これまでは何も返していませんでした。
- **メニューの選択肢（`menuChoice`）と、利用者への知らせ（`message`）の文を返します。** 選択肢は `listItem` の `text`、知らせは `prompt` ごとの `para` です。
- **図の凡例（`figure/legend`）と、定義リストの見出し（`definitionListHeader`）を返します。** 凡例は `figure` の `children`、見出しは `list` の `attrs.termTitle`・`attrs.definitionTitle` です。
- **折り込み（`foldout`）の中の図・表を、そのままの節点で返します。** これまでは `element: "foldout"` の `figure` 1 つで、中の図の題名と `id` が落ちていました。`element: "foldout"` の節点は返らなくなります。
- **外部の文書の版と発行日を返します。** `externalPubRef` の参照の `externalPubIssue`・`externalPubIssueDate` です。
- **入れ子の品目（`embedded…Descr`）を返します。** 親の品目（`equipment`・`supply`・`spare`）の `children` に入ります。
- **`content.notReadElements` に、プロセス DM の変数の操作（`variableDeclarations`・`variablePreSet`・`variablePostSet`・`validate`・`assertion`）と、図の改訂の理由（`reasonForAmendment`）を数えます。** 中身はこれまでどおり返しませんが、あることを知らせます。

## 0.9.0 (2026-11-16)

依存の `@shuji-bonji/s1000d-core` を `^0.10.0` に上げました（0.8.0 の時点は `^0.8.2`）。`read_data_module` の応答が、次のように変わります（s1000d-stack の docs/design/core-preliminary-rqmts.md、D-31）。

### 変更（応答が変わります）

- **作業前の要件（`preliminaryRqmts`）を、種類ごとの節点で返します。** `requirements` の子に、人員（`kind: "person"`）・文書（`document`）・品目（`equipment`・`supply`・`spare`）・安全の要件（`admonition`）が入ります。これまでは、要約の文だけでした。節点の数（`size.nodes`）と文字数（`size.chars`）が増えます。
- **共通の警告・注意への参照（`@warningRefs`・`@cautionRefs`）を読みます。** `safetyRqmts` が参照だけを持つ DM で、安全の要件が何も返っていませんでした。
- **プロセス DM の `dmIf` の条件の文を返します。** `kind: "if"` の節点の `question` に、`expression/@humanReadableForm` の文が入ります。これまでは `expression` が `unknown` になり、条件が読めませんでした。
- **参照に、版・言語・DM の中の場所（`fragment`）・適用性・題名を返します。**
- **品目の NATO 物品番号（`natoStockNumber`）を返します**（core 0.10.0）。`equipment`・`supply`・`spare` の節点の `natoStockNumber` に、`6850-00-181-7933` の形で入ります。要約の文にも「NSN …」が入ります。core 0.9 では、要素名だけを `attrs.otherIdentifiers` と `notReadElements` に返していました。
- **`content.notReadElements` を足しました。** あることは分かっていても中身を読んでいない要素・属性の名前と数です。空でないときは、応答に入っていない内容がその DM にあります。

## 0.8.0 (2026-11-06)

Grok Build の試用（hub の `eval/hosts/grok-build/reports/2026-11/FINDINGS.md` の F-02・F-03）で見つかった点を直しました（[#2](https://github.com/shuji-bonji/s1000d-reader-mcp/issues/2)・[#3](https://github.com/shuji-bonji/s1000d-reader-mcp/issues/3)）。依存の `@shuji-bonji/s1000d-core` は `^0.8.2` のままです。

### 変更（動きが変わります）

- **ツール引数の `csdbDirs` は、設定を置き換えます。** これまでは、渡したフォルダーと `S1000D_CSDB_DIR`・設定ファイル（`~/.config/s1000d-stack/config.json`）の `csdbDirs` を足し合わせていたため、渡したフォルダーだけを一覧にするつもりでも、設定側のフォルダーの DM が結果に混ざりました。引数で渡したときは、そのフォルダーだけを使います。渡さないときは、これまでどおり設定を使います。BREX は、これまでどおり `S1000D_SPEC_DIR`（既定 BREX）も探します。
- **存在しないフォルダーは `_notes` で知らせます。** これまでは、渡したフォルダーが無いと何も知らせずに落としていました。使わなかったフォルダーを `_notes` に書き、1 つも残らないときは `no-csdb` を返します（詳細に、無かったフォルダーを書きます）。
- **呼び出し側が直せる誤りは、`isError` ではなく `{"error": {"code", "path", "detail"}}` で返します**（s1000d-writer-mcp と同じ形）。`code` は `file-not-found`（`path`・`fromPath` にファイルが無い）・`no-csdb`（CSDB のフォルダーが 1 つも無い）・`not-found`（`dmc`・`pmc`・`icn` が CSDB に無い）・`input-error`（DMC・PMC の形が違う、必要な引数が無い、PM・IMF でない文書を渡したなど）。`path` は直す引数の場所（`/path`、`/csdbDirs` など）です。これまでの `{"error": "…"}`（文字列）と `isError: true` は、想定外の失敗（サーバーの障害）にだけ使います。

## 0.7.1 (2026-10-29)

hub の E2E テスト（`e2e/`）で見つかった 2 点を直しました。ツールの入出力は変えていません。依存の `@shuji-bonji/s1000d-core` は `^0.8.2` です。

### 修正

- CSDB の索引を、フォルダーの組み合わせごとに 1 回だけ作ってプロセスが動いている間は作り直していたため、サーバーを起動した後に writer などが書いた DM・PM が、`list_data_modules`・`read_data_module`・`resolve_reference` などから見えませんでした（再起動するまで「見つからない」）。呼び出しのたびに、索引を作ったときのフォルダーの指紋（core の `fingerprintDirs`: ファイルの相対パス・大きさ・更新時刻。中身は読まない）と今の指紋を比べ、違えば作り直します。適用性リポジトリの表は索引ごとに覚えるので、索引と一緒に作り直されます。XSD のフォルダーの探索結果は、配布物が変わらない前提でこれまでどおり覚えます。
- `read_data_module` の `verification` は core 0.8.2 の修正を受け取ります。`brexDmRef` が無く BREX の層も無い DM は、`brex.state` が `passed` ではなく `not-run`（`reason` 付き）になります。

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
