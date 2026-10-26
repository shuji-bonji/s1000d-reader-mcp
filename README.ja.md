# @shuji-bonji/s1000d-reader-mcp

[English](./README.md) | **日本語**

S1000D® のデータモジュールとパブリケーションモジュールを、LLM が XML ではなく構造として読むための MCP サーバーです。見出しの階層、番号付きの手順、警告・注意・注記、図（ICN）、表、参照先の題名を保ったまま返し、どの製品に当てはまるか（適用性）はサーバーが判定して結果だけを渡します。すべての応答に「どこまで検証済みか」（`verification`）が付きます。

> [!IMPORTANT]
> このサーバーは ASD（Aerospace, Security and Defence Industries Association of Europe）とは無関係の個人プロジェクトです。S1000D® は ASD の登録商標です。
> S1000D の仕様書・XML スキーマ・公式サンプルは、利用条件により再配布できないため、このパッケージには含まれていません。XSD 検証を行うには、利用者ご自身で [s1000d.org](https://s1000d.org/) から配布物を入手し、展開したフォルダーを環境変数 `S1000D_SPEC_DIR` で指定してください。

## できること

| ツール | 内容 |
|---|---|
| `list_data_modules` | CSDB の中のデータモジュール（指定すれば PM・DML・DDN・IMF・UPF も）を、DMC・題名・版・言語・スキーマ名・適用性の表示文付きで一覧にします。モデル識別コード・システムコード・情報コード・スキーマ名・題名の文字で絞れます |
| `read_data_module` | データモジュール 1 件を構造で読みます。識別・状態部、本文の木（節・段落・リスト・表・図・警告・番号付き手順・要件、プロセスの分岐、故障探求の問いと答え）、参照（題名付き）、検証状態。`product` を渡すとブロックごとに applicable / notApplicable / undetermined を付けます |
| `read_publication_module` | パブリケーションモジュールを目次として読みます。`pmEntry` の木と、各 `dmRef` / `pmRef` の解決先（ファイル・題名・版） |
| `resolve_reference` | DMC・PMC・ICN を CSDB のファイルに解決します。ICN は参照元 DM の DOCTYPE 宣言（ファイル名と NOTATION）も返します |
| `describe_applicability` | 適用性の語彙を返します。ACT の製品属性（id・名前・列挙・識別子）、CCT の条件、PCT の製品（そのまま `product` に使える値）、DM の `applic` 文（id と表示文）、PCT が値を割り当てていない属性。ここでは何も判定しません |
| `read_icn_metadata` | ICN メタデータファイル（IMF）を読みます。ICN・版・題名・キーワード・機密区分と、状態部の項目の一覧 |

### 適用性の読み方

| 状態 | 意味 |
|---|---|
| `applicable` | 渡した製品に当てはまる |
| `notApplicable` | 当てはまらない。`omitNotApplicable: true` で本文から省ける |
| `undetermined` | 判定できない。`reason` に理由（製品に無い属性の名前、`product` 未指定、適用性リポジトリに無い `applicIdentValue`）。「当てはまらない」ではない |

`assert` / `evaluate` の式は返しません。必要な属性と値は `describe_applicability` で調べ、`product` に `{ "attributes": { "model": "…" }, "conditions": { … } }` の形で渡します。

### 検証状態（`verification`）

既定では XSD 検証だけを行います（`verify: "schema"`）。`verify: "full"` で BREX の連鎖への照合と参照の解決も行い、`verify: "none"` で省きます。省いた工程は `not-run`、XSD が見つからなければ `schema-not-found` と明記され、どちらも `valid` ではありません。XSD に違反した文書は要素の位置が仕様と違う可能性があるため、本文の読み取りも疑ってください。

## できないこと

> [!WARNING]
> - **要約・翻訳はしません。** 要約に要る材料（見出し、手順の番号、警告の種類、参照先）を落とさずに返すのが仕事です。
> - **S1000D への準拠は判定しません。** XSD・BREX の違反の中身は `s1000d-verify-mcp`、BREX のルールの説明は `s1000d-brex-mcp` で読んでください。
> - 本文を構造化しているのは `descript` / `proced` / `process` / `fault` / `pm` の 5 種です。他の種類は `content.structured: false` で、識別・状態部だけを返します。知らない要素は `kind: "unknown"` として文だけを残し、`content.unknownElements` に数えます。

## 設定

| 環境変数 | 内容 |
|---|---|
| `S1000D_SPEC_DIR` | 利用者が入手した S1000D の配布物を展開したフォルダー。XSD（`xml_schema_flat/`）と既定 BREX をこの下から探します。データ辞書の中にある XSD の写しは使いません |
| `S1000D_CSDB_DIR` | プロジェクトのデータモジュールが置かれたフォルダー。`:`（Windows は `;`）区切りで複数指定できます。DMC での読み取り、参照先、ACT・CCT・PCT、適用性リポジトリをここから探します |

ツールの引数 `csdbDirs` でフォルダーを追加することもできます。

### Claude Desktop / Claude Code の設定例

```json
{
  "mcpServers": {
    "s1000d-reader": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/s1000d-reader-mcp"],
      "env": {
        "S1000D_SPEC_DIR": "/path/to/s1000d/issue-7",
        "S1000D_CSDB_DIR": "/path/to/your/csdb"
      }
    }
  }
}
```

## 仕組み

読み取り・判定・検証の処理はすべて共有ライブラリ [`@shuji-bonji/s1000d-core`](https://www.npmjs.com/package/@shuji-bonji/s1000d-core) にあり、このサーバーは引数の解釈と応答の形だけを持ちます。検証状態は `s1000d-verify-mcp` と同じ関数で作るので、2 つのサーバーの結果は一致します。

## 開発

```sh
npm install
npm test            # 自作のテストデータだけで動く
npm run test:spec   # 利用者が入手した配布物を使う（S1000D_SPEC_DIR で場所を指定。既定 ../../specs/s1000d/issue-7）
npm run build && S1000D_SPEC_DIR=/path/to/issue-7 S1000D_CSDB_DIR=/path/to/csdb npm start   # stdio で起動
```

## ライセンス

MIT。S1000D® は ASD の登録商標です。このソフトウェアは ASD とは無関係で、仕様書・スキーマ・公式サンプルを含みません。
