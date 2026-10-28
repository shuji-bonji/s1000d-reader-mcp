/**
 * ツール定義（入力スキーマ）。実装は handlers.ts。
 * すべてのツールは additionalProperties: false を持ち、未知の引数は SDK の入力検証で弾かれる。
 */
import type { JsonSchemaType, Tool } from '@modelcontextprotocol/server';

export type ToolDefinition = Omit<Tool, 'inputSchema'> & { inputSchema: JsonSchemaType };

const csdbDirsParam = {
  type: 'array',
  items: { type: 'string' },
  description:
    'Extra CSDB folders to search (in addition to S1000D_CSDB_DIR) for data modules by DMC, referenced objects, ACT/CCT/PCT and BREX.',
} as const;
const pathParam = { type: 'string', description: 'File path of the document.' } as const;
const xmlParam = {
  type: 'string',
  description: 'The document as an XML string (alternative to path; max 5 MB).',
} as const;
const dmcParam = {
  type: 'string',
  description:
    'DMC of the data module to read from the CSDB (e.g. "S1000DBIKE-AAA-D00-00-00-00AA-041A-A"; "DMC-" prefix optional). Alternative to path/xml.',
} as const;
const productParam = {
  type: 'object',
  description:
    'The product to evaluate applicability for. attributes: ACT productAttribute id → value (e.g. {"model": "Brook trekker", "version": "Mk9"}); conditions: CCT cond id → value. Omit to get "undetermined" with display texts only. Use describe_applicability to learn the available ids and values.',
  properties: {
    attributes: { type: 'object', additionalProperties: { type: 'string' } },
    conditions: { type: 'object', additionalProperties: { type: 'string' } },
  },
  additionalProperties: false,
} as const;
const verifyParam = {
  type: 'string',
  enum: ['schema', 'full', 'none'],
  description:
    'How much to verify before reading: "schema" (default) runs XSD validation only; "full" also checks BREX along the brexDmRef chain and resolves references; "none" skips verification (reported as not-run).',
  default: 'schema',
} as const;

export const tools: ToolDefinition[] = [
  {
    name: 'list_data_modules',
    description:
      'List the CSDB objects (data modules by default; optionally publication modules, DML, DDN, IMF, UPF, ICN) in the CSDB folders with DMC parts, techName/infoName, issue, language, schema name (descript/proced/…), S1000D issue and applicability display text. A DML or DDN row also carries its code, issue date, entry/item count and a reconciliation summary against the CSDB (found / issue-mismatch / not-found / not-checked; for a DML also how many DMs and PMs it does not list). Filter by modelIdentCode, systemCode, infoCode, schemaName or title text. Paged with offset/limit.',
    inputSchema: {
      type: 'object',
      properties: {
        csdbDirs: csdbDirsParam,
        include: {
          type: 'array',
          items: { type: 'string', enum: ['dm', 'dme', 'pm', 'dml', 'ddn', 'imf', 'upf', 'icn'] },
          description: 'Object kinds to list (default: dm).',
        },
        filter: {
          type: 'object',
          properties: {
            modelIdentCode: { type: 'string' },
            systemCode: { type: 'string' },
            infoCode: {
              type: 'string',
              description: 'e.g. "040" (description), "520" (procedure), "022" (BREX), "00W" (ACT)',
            },
            schemaName: {
              type: 'string',
              description: 'descript / proced / process / fault / pm / brex / …',
            },
            text: {
              type: 'string',
              description: 'Case-insensitive text to find in techName or infoName.',
            },
          },
          additionalProperties: false,
        },
        offset: {
          type: 'number',
          description: 'Index of the first object (default 0).',
          default: 0,
        },
        limit: {
          type: 'number',
          description: 'Objects per call (default 100, max 1000).',
          default: 100,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'read_data_module',
    description:
      'Read one data module as structure, not XML: identification and status (DMC, issue, language, title, BREX ref, QA, DM-level applicability), the body as a tree of blocks (sections, paragraphs, lists, tables, figures with ICN, warnings/cautions/notes, numbered steps, requirements; processes and fault isolation too), the references it makes, and ALWAYS a "verification" status (XSD by default). Applicability of each block is evaluated for the given product (applicable / notApplicable / undetermined); without a product, only display texts are returned — assert expressions are never returned.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathParam,
        xml: xmlParam,
        dmc: dmcParam,
        csdbDirs: csdbDirsParam,
        product: productParam,
        section: {
          type: 'string',
          enum: ['identAndStatus', 'content', 'all'],
          description: 'Which part to return (default all).',
          default: 'all',
        },
        verify: verifyParam,
        omitNotApplicable: {
          type: 'boolean',
          description:
            'Drop blocks that are notApplicable for the given product (default false: keep them, marked). The number dropped is reported.',
          default: false,
        },
        maxNodes: {
          type: 'number',
          description: 'Cap on body nodes returned (default 5000).',
          default: 5000,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'read_publication_module',
    description:
      'Read a publication module (PMC) as a table of contents: the pmEntry tree with titles, and for each dmRef/pmRef the resolved target (file, techName/infoName, issue) from the CSDB. Also returns the PM identification and a verification status.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathParam,
        xml: xmlParam,
        pmc: {
          type: 'string',
          description:
            'PMC to read from the CSDB (e.g. "S1000DBIKE-B6865-EPWG1-00"; "PMC-" prefix optional). Alternative to path/xml.',
        },
        csdbDirs: csdbDirsParam,
        verify: verifyParam,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_reference',
    description:
      'Resolve one reference to a CSDB object: a DMC, a PMC, or an ICN (file name or entity name). Returns the file path(s), issue(s) and title. For an ICN, pass "fromPath" of the data module whose DOCTYPE declares the entity to get the declared file and notation.',
    inputSchema: {
      type: 'object',
      properties: {
        dmc: { type: 'string', description: 'DMC to resolve.' },
        pmc: { type: 'string', description: 'PMC to resolve.' },
        icn: { type: 'string', description: 'ICN (entity name or file name) to resolve.' },
        fromPath: {
          type: 'string',
          description: 'Data module whose DOCTYPE declares the ICN entity (optional).',
        },
        csdbDirs: csdbDirsParam,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'describe_applicability',
    description:
      'Describe the applicability vocabulary of a data module so a product can be chosen: the ACT product attributes (ids, names, enumerations/patterns, which one identifies the product), the CCT condition types and conditions, the PCT products (ready-made product values), the applic statements in the data module (ids and display texts), and which attributes used by the statements have no value in the PCT. Nothing is evaluated here; pass the chosen values as "product" to read_data_module.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathParam,
        xml: xmlParam,
        dmc: dmcParam,
        csdbDirs: csdbDirsParam,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'read_icn_metadata',
    description:
      'Read an ICN metadata file (IMF, icnmetadata.xsd): ICN, issue, title, keywords, security, source/originator and other status items as a flat list, plus the related ICN files found in the CSDB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathParam,
        xml: xmlParam,
        icn: {
          type: 'string',
          description:
            'ICN whose IMF to read from the CSDB (e.g. "C0419-S1000D0360-001-01" or "ICN-C0419-…").',
        },
        csdbDirs: csdbDirsParam,
      },
      additionalProperties: false,
    },
  },
];
