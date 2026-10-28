/**
 * s1000d-reader-mcp の組み立て。index.ts は起動だけを担い、テストからはこの関数を直接叩く。
 */
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { ENV, PACKAGE_INFO } from './config.js';
import { tools } from './tools/definitions.js';
import { toolHandlers } from './tools/handlers.js';

/**
 * `initialize` の応答としてクライアントへ返す説明。README やツール説明より早く読まれる。
 *
 * 潰したい誤解:
 * 1. 読めた本文がそのまま信用できると読まれること。verification を見て、XSD 未検証なら構造の読み取りも疑う。
 * 2. 適用性の式を LLM が解釈できると読まれること。判定はサーバーが行い、assert の中身は返さない（D-18）。
 * 3. 「undetermined」を「当てはまらない」と読まれること。製品の値が足りないだけ。describe_applicability で補う。
 * 4. BREX の違反や XSD の違反の中身がここで分かると読まれること。それは verify-mcp / brex-mcp。
 */
const INSTRUCTIONS = `This server READS S1000D data modules and publication modules as structure (sections, paragraphs, lists, tables, figures with ICN, warnings/cautions/notes, numbered steps, requirements, process flows, fault isolation questions, PM tables of contents) and EVALUATES applicability for a product. Every response carries "verification" (VerificationStatus): schema (valid / invalid / schema-not-found / not-run), brex and references ("not-run" unless verify="full"), and every read_data_module / read_publication_module response starts with "securityClassification" (the document's value and the values carried by elements in the body, as written — decide how to handle the content before quoting it; the server does not interpret the values).

It does NOT do the following:
- It does not return applicability expressions (assert/evaluate). The server evaluates them for the "product" you pass and returns applicable / notApplicable / undetermined with the human-readable displayText. "undetermined" means the product lacks a needed value (see reason) or no product was given — it is not "does not apply". Call describe_applicability to learn the attribute ids and values (ACT/CCT/PCT) and the values the PCT leaves unassigned.
- It does not decide S1000D conformance and does not list BREX or XSD errors in detail; use s1000d-verify-mcp for that and s1000d-brex-mcp to explain BREX rules.
- It does not summarize or translate. It keeps headings, step numbers, admonition levels and references ([→ DMC title] inline and in refs) so you can.
- It does not ship any S1000D specification, XSD or sample. XSD validation needs ${ENV.specDir} (the extracted S1000D distribution) or {"specDir": "/absolute/path"} in ~/.config/s1000d-stack/config.json (for hosts that do not pass environment variables to plugins); the CSDB is found via ${ENV.csdbDirs}, "csdbDirs" in that config file, or the "csdbDirs" argument.

Reading results: if verification.schema is schema-not-found or invalid, the structure may be misread — say so. Elements the reader does not know are kept as kind "unknown" with their text and counted in content.unknownElements. Data module kinds other than descript / proced / process / fault / pm return structured: false with identAndStatus only. References to the specification (modelIdentCode "S1000D") are not listed as unresolved.

Costly options: read_data_module with verify="full" runs BREX checks (about 0.1 s per data module). list_data_modules reads every file for titles; narrow with filter.

Budget: on a large data module call read_data_module with section "outline" first. It returns headings, step numbers, the first sentence of each and the size of each subtree (nodes / chars / warnings), without the body or the references; content.size says how big the full body is. Then read section "content" (optionally with maxNodes) once you know what you need.`;

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: PACKAGE_INFO.name, version: PACKAGE_INFO.version },
    { instructions: INSTRUCTIONS },
  );
  for (const tool of tools) {
    const handler = toolHandlers[tool.name];
    if (!handler) throw new Error(`No handler registered for tool: ${tool.name}`);
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
      },
      async (args) => {
        try {
          const result = await handler(args as Record<string, unknown>);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
            isError: true,
          };
        }
      },
    );
  }
  return server;
}
