# @shuji-bonji/s1000d-reader-mcp

**English** | [日本語](./README.ja.md)

An MCP server that lets an LLM read S1000D® data modules and publication modules as structure rather than as XML. It returns the heading hierarchy, numbered steps, warnings, cautions and notes, illustrations (ICN), tables and the titles of reference targets intact, and the server evaluates which product the content applies to (applicability) and passes on only the result. Every response carries how far the document has been verified (`verification`).

> [!IMPORTANT]
> This is a personal project and is not affiliated with ASD (Aerospace, Security and Defence Industries Association of Europe). S1000D® is a registered trademark of ASD.
> The S1000D specification, XML schemas, default BREX and official samples are not included in any package or repository, because their terms of use do not grant redistribution. Obtain them from [s1000d.org](https://s1000d.org/) and point the `S1000D_SPEC_DIR` environment variable at the extracted folder.

## What it does

| Tool | Description |
|---|---|
| `list_data_modules` | Lists the data modules in a CSDB (and, on request, PMs, DMLs, DDNs, IMFs and UPFs) with their DMC, title, issue, language, schema name and applicability display text. Filters by model identification code, system code, information code, schema name and title text |
| `read_data_module` | Reads one data module as structure: the identification and status section, the body tree (sections, paragraphs, lists, tables, illustrations, warnings, numbered steps and requirements, process branches, fault isolation questions and answers), references (with titles) and the verification status. Pass `product` to mark each block applicable / notApplicable / undetermined |
| `read_publication_module` | Reads a publication module as a table of contents: the `pmEntry` tree and the resolved target of each `dmRef` / `pmRef` (file, title, issue) |
| `resolve_reference` | Resolves a DMC, PMC or ICN to a file in the CSDB. For an ICN it also returns the DOCTYPE declaration of the referencing DM (file name and NOTATION) |
| `describe_applicability` | Returns the applicability vocabulary: product attributes from the ACT (id, name, enumerations, identifiers), conditions from the CCT, products from the PCT (values that can be passed to `product` as they are), the `applic` statements of the DM (id and display text), and attributes to which the PCT assigns no value. It evaluates nothing |
| `read_icn_metadata` | Reads an ICN metadata file (IMF): ICN, issue, title, keywords, security classification and a list of the items in the status section |

### Reading applicability

| State | Meaning |
|---|---|
| `applicable` | Applies to the product you passed |
| `notApplicable` | Does not apply. `omitNotApplicable: true` leaves it out of the body |
| `undetermined` | Cannot be evaluated. `reason` says why (the name of an attribute the product lacks, `product` not given, an `applicIdentValue` missing from the applicability repository). This does not mean "does not apply" |

The server does not return `assert` / `evaluate` expressions. Look up the attributes and values you need with `describe_applicability` and pass them to `product` in the form `{ "attributes": { "model": "…" }, "conditions": { … } }`.

### Verification status (`verification`)

By default the server runs XSD validation only (`verify: "schema"`). `verify: "full"` also checks against the BREX (Business Rules Exchange) chain and resolves references; `verify: "none"` skips them. A skipped step is reported as `not-run`, and a missing XSD as `schema-not-found`; neither is `valid`. In a document that violates the XSD, elements may be in positions that differ from the specification, so treat the reading of the body with suspicion as well.

## What it does not do

> [!WARNING]
> - **It does not summarise or translate.** Its job is to return the material a summary needs (headings, step numbers, warning types, reference targets) without dropping anything.
> - **It does not judge conformance to S1000D.** Read the details of XSD and BREX violations with `s1000d-verify-mcp`, and the explanation of BREX rules with `s1000d-brex-mcp`.
> - The body is structured for 5 types only: `descript` / `proced` / `process` / `fault` / `pm`. Other types return `content.structured: false` and only the identification and status section. Unknown elements are kept as `kind: "unknown"` with their text only and counted in `content.unknownElements`.

## Configuration

| Environment variable | Description |
|---|---|
| `S1000D_SPEC_DIR` | The folder where you extracted the S1000D distribution you obtained. The server looks for the XSD (`xml_schema_flat/`) and the default BREX under it. It does not use the copies of the XSD inside the data dictionary |
| `S1000D_CSDB_DIR` | The folder that holds the project's data modules. Several folders can be given, separated by `:` (`;` on Windows). Reading by DMC, reference targets, the ACT, CCT and PCT, and the applicability repository are looked up here |

Folders can also be added with the tool argument `csdbDirs`.

### Example configuration for Claude Desktop / Claude Code

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

## How it works

All reading, evaluation and validation code lives in the shared library [`@shuji-bonji/s1000d-core`](https://www.npmjs.com/package/@shuji-bonji/s1000d-core); this server holds only the interpretation of arguments and the shape of the responses. The verification status is built with the same function as `s1000d-verify-mcp`, so the results of the two servers agree.

## Development

```sh
npm install
npm test            # runs on self-made test data only
npm run test:spec   # uses the distribution you obtained (location given by S1000D_SPEC_DIR; default ../../specs/s1000d/issue-7)
npm run build && S1000D_SPEC_DIR=/path/to/issue-7 S1000D_CSDB_DIR=/path/to/csdb npm start   # start over stdio
```

## License

MIT. S1000D® is a registered trademark of ASD. This software is not affiliated with ASD and does not include the specification, schemas or official samples.
