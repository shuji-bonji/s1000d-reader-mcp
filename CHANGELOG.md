# Changelog

## 未リリース（0.1.0 に向けて）

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
