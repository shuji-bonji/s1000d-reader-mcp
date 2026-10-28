/**
 * ツールの実装。definitions.ts の name と 1 対 1 で対応する。
 * 読み取り・判定・検証の中身はすべて s1000d-core。ここは引数の解釈と応答の形だけ。
 */
import {
  ApplicEvaluator,
  collectReferences,
  defaultXmlEngine,
  findApplicTables,
  formatDmc,
  formatPmc,
  parseDmc,
  parsePmc,
  productFromPct,
  readContentFromXml,
  readDataModuleInfo,
  readDdn,
  readDml,
  reconcileDdn,
  reconcileDml,
  resolveReferences,
  verifyDataModule,
  type ApplicExpr,
  type ApplicResult,
  type ContentNode,
  type CsdbObject,
  type Element,
  type Product,
  type VerificationStatus,
  type VerifyOptions,
} from '@shuji-bonji/s1000d-core';
import { ENV, LIMITS } from '../config.js';
import {
  applicRepository,
  brexResolver,
  configNotes,
  csdbIndex,
  csdbSearchDirs,
  loadObject,
  loadXml,
  readDmByCode,
  readObjectText,
  schemaDirs,
  schemaValidator,
  type ContextOptions,
} from '../services/context.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;
export type ToolHandler = (args: Args) => Promise<unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}
function strArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}
function int(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}
function productArg(v: unknown): Product | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as { attributes?: Record<string, string>; conditions?: Record<string, string> };
  if (!o.attributes && !o.conditions) return undefined;
  return { attributes: o.attributes ?? {}, conditions: o.conditions ?? {} };
}

const STANDARD_NOTES = [
  'verification tells how far this document has been checked. schema-not-found and not-run are NOT "valid"; see the reason. S1000D conformance is never decided here.',
  'Applicability states are evaluated by the server for the given product; "undetermined" means the product lacks a value the statement needs (see reason) or no product was given. Assert expressions are not returned.',
];

/** 検証状態。既定は XSD だけ、full で BREX と参照も（D-18） */
async function verification(
  xml: string,
  mode: string,
  ctx: ContextOptions,
  path?: string,
): Promise<VerificationStatus> {
  if (mode === 'none') {
    return (await verifyDataModule(xml, { path })).status;
  }
  const options: VerifyOptions = {
    path,
    schema: { validator: schemaValidator(), schemaDirs: schemaDirs() },
    brex: mode === 'full' ? { resolver: brexResolver(ctx) } : false,
    references: mode === 'full' ? { csdb: csdbIndex(ctx) } : false,
  };
  const r = await verifyDataModule(xml, options);
  return r.status;
}

function titleOf(xml: string): {
  techName?: string;
  infoName?: string;
  issueInfo?: { issueNumber: string; inWork: string };
} {
  try {
    const info = readDataModuleInfo(xml);
    return {
      techName: info.identAndStatus?.techName,
      infoName: info.identAndStatus?.infoName,
      issueInfo: info.identAndStatus?.issueInfo,
    };
  } catch {
    return {};
  }
}

/** 本文の節点に適用性の判定を付け、必要なら notApplicable を省く */
function annotate(
  nodes: ContentNode[],
  evaluator: ApplicEvaluator,
  product: Product | undefined,
  omit: boolean,
  counter: { nodes: number; dropped: number; max: number },
): Array<ContentNode & { applicability?: ApplicResult }> {
  const out: Array<ContentNode & { applicability?: ApplicResult }> = [];
  for (const n of nodes) {
    if (counter.nodes >= counter.max) break;
    let applicability: ApplicResult | undefined;
    if (n.applicRefId) {
      applicability = evaluator.forRefId(n.applicRefId, product);
      if (omit && applicability.state === 'notApplicable') {
        counter.dropped++;
        continue;
      }
    }
    counter.nodes++;
    const children = annotate(n.children, evaluator, product, omit, counter);
    const node: ContentNode & { applicability?: ApplicResult } = { ...n, children };
    if (applicability) node.applicability = applicability;
    out.push(node);
  }
  return out;
}

function stripLocationDeep<T extends { location?: unknown; children?: T[] }>(nodes: T[]): T[] {
  return nodes.map((n) => {
    const { location, ...rest } = n;
    void location;
    return { ...rest, children: n.children ? stripLocationDeep(n.children) : [] } as T;
  });
}

async function listDataModules(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  const index = csdbIndex(ctx);
  if (!index) throw new Error(`No CSDB folders. Pass "csdbDirs" or set ${ENV.csdbDirs}.`);
  const include = new Set(strArray(args.include) ?? ['dm']);
  const f = (args.filter ?? {}) as Record<string, string | undefined>;
  const text = str(f.text)?.toLowerCase();
  const rows: Array<Record<string, unknown>> = [];
  for (const o of index.objects) {
    if (!include.has(o.kind)) continue;
    if (o.kind === 'dm' && o.dm) {
      const c = o.dm.dmCode;
      if (str(f.modelIdentCode) && c.modelIdentCode !== f.modelIdentCode) continue;
      if (str(f.systemCode) && c.systemCode !== f.systemCode) continue;
      if (str(f.infoCode) && c.infoCode !== f.infoCode) continue;
    } else if (str(f.modelIdentCode) || str(f.systemCode) || str(f.infoCode)) {
      if (!(
        o.kind === 'pm' &&
        o.pm &&
        (!str(f.modelIdentCode) || o.pm.pmCode.modelIdentCode === f.modelIdentCode) &&
        !str(f.systemCode) &&
        !str(f.infoCode)
      ))
        continue;
    }
    let row: Record<string, unknown> = { kind: o.kind, path: o.path, fileName: o.fileName };
    if (o.kind === 'dm' || o.kind === 'pm') {
      let xml: string;
      try {
        xml = index.read(o);
      } catch {
        continue;
      }
      const info = readDataModuleInfo(xml);
      if (str(f.schemaName) && info.schemaName !== f.schemaName!.toLowerCase()) continue;
      const ident = info.identAndStatus;
      const techName =
        ident?.techName ??
        defaultXmlEngine.selectString(
          '//pmAddressItems/pmTitle',
          defaultXmlEngine.parse(xml).document,
        );
      const infoName = ident?.infoName;
      if (text && !`${techName ?? ''} ${infoName ?? ''}`.toLowerCase().includes(text)) continue;
      row = {
        ...row,
        dmc: o.dm ? formatDmc(o.dm.dmCode) : undefined,
        pmc: o.pm ? formatPmc(o.pm.pmCode) : undefined,
        dmCode: o.dm?.dmCode,
        issueInfo: o.dm?.issueInfo ?? o.pm?.issueInfo,
        language: o.dm?.language ?? o.pm?.language,
        schemaName: info.schemaName,
        issue: info.issue,
        techName,
        infoName,
        applicDisplayText: ident?.applicDisplayText,
      };
    } else if (text || str(f.schemaName)) continue;
    else if (o.kind === 'dml' || o.kind === 'ddn') {
      // DML・DDN は読み取った中身（行数・納入物の件数）と CSDB との照合の集計を添える（core 0.6.0、段階 2.5 の作業 5）。
      // 行ごとの結果は s1000d-verify-mcp の reconcile_dml
      try {
        const xml = index.read(o);
        if (o.kind === 'dml') {
          const dml = readDml(xml);
          if (dml.ok) {
            const rec = reconcileDml(dml.value, index);
            row = {
              ...row,
              dmlCode: rec.dmlCode,
              issueInfo: dml.value.issueInfo,
              issueDate: dml.value.issueDate,
              issueType: dml.value.issueType,
              entryCount: rec.entryCount,
              reconciliation: { ...rec.counts, notListed: rec.notListed.length },
            };
          } else row.error = dml.error;
        } else {
          const ddn = readDdn(xml);
          if (ddn.ok) {
            const rec = reconcileDdn(ddn.value, index);
            row = {
              ...row,
              ddnCode: rec.ddnCode,
              issueDate: ddn.value.issueDate,
              dispatchFrom: ddn.value.dispatchFrom,
              dispatchTo: ddn.value.dispatchTo,
              itemCount: rec.itemCount,
              reconciliation: rec.counts,
            };
          } else row.error = ddn.error;
        }
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
      }
    }
    rows.push(row);
  }
  const offset = int(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = int(args.limit, LIMITS.defaultListLimit, 1, LIMITS.maxListLimit);
  const bySchema: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r.schemaName ?? r.kind);
    bySchema[k] = (bySchema[k] ?? 0) + 1;
  }
  return {
    searched: csdbSearchDirs(ctx),
    page: {
      offset,
      returned: Math.min(limit, Math.max(0, rows.length - offset)),
      total: rows.length,
    },
    countsBySchema: bySchema,
    objects: rows.slice(offset, offset + limit),
    _notes: [
      ...configNotes(ctx),
      ...(include.has('dml') || include.has('ddn')
        ? [
            'DML / DDN rows carry "reconciliation" (found / issue-mismatch / not-found / not-checked, and for a DML the count of DMs and PMs the DML does not list). For the per-entry result use reconcile_dml in s1000d-verify-mcp.',
          ]
        : []),
    ],
  };
}

async function readDataModule(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  const { xml, path } = loadObject(
    { path: str(args.path), xml: str(args.xml), dmc: str(args.dmc) },
    ctx,
    LIMITS.maxInlineXmlBytes,
  );
  const section = str(args.section) ?? 'all';
  const verify = str(args.verify) ?? 'schema';
  const product = productArg(args.product);
  const omit = args.omitNotApplicable === true;
  const notes = [...STANDARD_NOTES, ...configNotes(ctx)];

  const info = readDataModuleInfo(xml);
  const doc = defaultXmlEngine.parse(xml).document;
  const index = csdbIndex(ctx);
  const evaluator = new ApplicEvaluator(doc, { repository: applicRepository(index) });
  const dmApplicability = evaluator.dmLevel(product);
  const status = await verification(xml, verify, ctx, path);
  if (!product)
    notes.push(
      'No product was given: applicability is "undetermined" everywhere. Call describe_applicability, then pass "product".',
    );

  const result: Record<string, unknown> = {
    target: status.target,
    identAndStatus:
      section === 'content'
        ? undefined
        : { ...info.identAndStatus, applicability: dmApplicability },
    verification: status,
  };
  if (section !== 'identAndStatus') {
    const content = readContentFromXml(xml);
    const counter = {
      nodes: 0,
      dropped: 0,
      max: int(args.maxNodes, LIMITS.maxContentNodes, 1, 100000),
    };
    const blocks = annotate(content.blocks, evaluator, product, omit, counter);
    if (counter.nodes >= counter.max)
      notes.push(`The body was cut at ${counter.max} nodes (maxNodes).`);
    if (counter.dropped > 0)
      notes.push(
        `${counter.dropped} block(s) that are notApplicable for the product were omitted (omitNotApplicable).`,
      );
    notes.push(...content.notes);
    // 参照: 本文中の dmRef / pmRef を CSDB で解決して題名を添える
    const refs = collectReferences(doc);
    const resolved = resolveReferences(refs, { csdb: index });
    const references = resolved.resolved
      .filter(
        (r) =>
          r.reference.kind === 'dmRef' ||
          r.reference.kind === 'pmRef' ||
          r.reference.kind === 'icn',
      )
      .map((r) => ({
        kind: r.reference.kind,
        target: r.target,
        context: r.reference.context,
        path: r.path,
        ...(r.path && r.reference.kind === 'dmRef' ? titleOf(readObjectText(index, r.path)) : {}),
        notation: r.notation,
      }));
    const unresolved = resolved.unresolved
      .filter(
        (u) =>
          !(u.reference.kind === 'dmRef' && u.reference.ref.dmCode.modelIdentCode === 'S1000D'),
      )
      .map((u) => ({ kind: u.reference.kind, target: u.target, reason: u.reason }));
    result.content = {
      kind: content.kind,
      structured: content.structured,
      blocks: stripLocationDeep(blocks),
      unknownElements: content.unknownElements,
    };
    result.references = { resolved: references, unresolved };
  }
  result._notes = notes;
  return result;
}

async function readPublicationModule(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  const { xml, path } = loadObject(
    { path: str(args.path), xml: str(args.xml), pmc: str(args.pmc) },
    ctx,
    LIMITS.maxInlineXmlBytes,
  );
  const doc = defaultXmlEngine.parse(xml).document;
  if (doc.documentElement?.nodeName !== 'pm')
    throw new Error(
      `Not a publication module (root element is <${doc.documentElement?.nodeName}>)`,
    );
  const sel = (e: string) => defaultXmlEngine.selectString(e, doc);
  const pmCodeEl = defaultXmlEngine.selectNodes('//pmIdent/pmCode', doc)[0] as Element | undefined;
  const ident = {
    pmCode: pmCodeEl
      ? {
          modelIdentCode: pmCodeEl.getAttribute('modelIdentCode'),
          pmIssuer: pmCodeEl.getAttribute('pmIssuer'),
          pmNumber: pmCodeEl.getAttribute('pmNumber'),
          pmVolume: pmCodeEl.getAttribute('pmVolume'),
        }
      : undefined,
    issueInfo: {
      issueNumber: sel('//pmIdent/issueInfo/@issueNumber'),
      inWork: sel('//pmIdent/issueInfo/@inWork'),
    },
    language: {
      languageIsoCode: sel('//pmIdent/language/@languageIsoCode'),
      countryIsoCode: sel('//pmIdent/language/@countryIsoCode'),
    },
    pmTitle: sel('//pmAddressItems/pmTitle'),
    issueDate:
      [
        sel('//pmAddressItems/issueDate/@year'),
        sel('//pmAddressItems/issueDate/@month'),
        sel('//pmAddressItems/issueDate/@day'),
      ]
        .filter(Boolean)
        .join('-') || undefined,
  };
  const index = csdbIndex(ctx);
  const content = readContentFromXml(xml);
  const resolveEntry = (n: ContentNode): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      kind: n.kind,
      element: n.element,
      title: n.title,
      target: n.text,
    };
    if (n.kind === 'entry' && n.refs?.[0]) {
      const ref = n.refs[0];
      if (ref.kind === 'dmRef') {
        const dmc = parseDmc(ref.target);
        const found = dmc.ok ? readDmByCode(index, dmc.value) : undefined;
        base.titleInRef = ref.title;
        base.resolved = found ? { path: found.path, ...titleOf(found.xml) } : undefined;
        if (!found) base.unresolved = index ? 'not-found' : 'no-csdb';
      } else if (ref.kind === 'pmRef') {
        const pmc = parsePmc(ref.target);
        const found = pmc.ok ? index?.findPublicationModules(pmc.value)[0] : undefined;
        base.titleInRef = ref.title;
        base.resolved = found ? { path: found.path, issueInfo: found.pm?.issueInfo } : undefined;
        if (!found) base.unresolved = index ? 'not-found' : 'no-csdb';
      }
    }
    if (n.children.length > 0) base.children = n.children.map(resolveEntry);
    return base;
  };
  const entries = content.blocks.map(resolveEntry);
  const status = await verification(xml, str(args.verify) ?? 'schema', ctx, path);
  return {
    identAndStatus: ident,
    verification: status,
    entries,
    _notes: [...STANDARD_NOTES.slice(0, 1), ...configNotes(ctx)],
  };
}

async function resolveReference(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  const index = csdbIndex(ctx);
  if (!index) throw new Error(`No CSDB folders. Pass "csdbDirs" or set ${ENV.csdbDirs}.`);
  const describe = (o: CsdbObject) => ({
    path: o.path,
    fileName: o.fileName,
    issueInfo: o.dm?.issueInfo ?? o.pm?.issueInfo,
    language: o.dm?.language ?? o.pm?.language,
  });
  if (str(args.dmc)) {
    const dmc = parseDmc(str(args.dmc)!);
    if (!dmc.ok) throw new Error(dmc.error);
    const found = index.findDataModules(dmc.value);
    return {
      kind: 'dmRef',
      target: formatDmc(dmc.value),
      found: found.map((o) => ({ ...describe(o), ...titleOf(index.read(o)) })),
      searched: csdbSearchDirs(ctx),
    };
  }
  if (str(args.pmc)) {
    const pmc = parsePmc(str(args.pmc)!);
    if (!pmc.ok) throw new Error(pmc.error);
    return {
      kind: 'pmRef',
      target: formatPmc(pmc.value),
      found: index.findPublicationModules(pmc.value).map(describe),
      searched: csdbSearchDirs(ctx),
    };
  }
  if (str(args.icn)) {
    const icn = str(args.icn)!;
    let declared: { systemId?: string; notation?: string } | undefined;
    if (str(args.fromPath)) {
      const refs = collectReferences(
        defaultXmlEngine.parse(loadXml({ path: str(args.fromPath) }, LIMITS.maxInlineXmlBytes))
          .document,
      );
      const d = refs.entities.get(icn) ?? refs.entities.get(icn.replace(/^ICN-/, ''));
      if (d) declared = { systemId: d.systemId, notation: d.notation };
    }
    const names = new Set<string>([
      icn.toLowerCase(),
      ...(declared?.systemId ? [declared.systemId.toLowerCase()] : []),
    ]);
    const found = index.objects.filter(
      (o) =>
        o.kind === 'icn' &&
        (names.has(o.fileName.toLowerCase()) ||
          o.fileName.toLowerCase().replace(/\.[^.]+$/, '') === icn.toLowerCase()),
    );
    const imf = index.objects.filter(
      (o) =>
        o.kind === 'imf' &&
        o.fileName.toUpperCase().includes(icn.toUpperCase().replace(/^ICN-/, '')),
    );
    return {
      kind: 'icn',
      target: icn,
      declared,
      found: found.map((o) => ({ path: o.path, fileName: o.fileName })),
      metadataFiles: imf.map((o) => o.path),
      searched: csdbSearchDirs(ctx),
    };
  }
  throw new Error('One of "dmc", "pmc" or "icn" is required');
}

function propertiesUsed(expr: ApplicExpr | undefined, out: Set<string>): void {
  if (!expr) return;
  if (expr.kind === 'assert') out.add(expr.propertyIdent);
  else for (const c of expr.children) propertiesUsed(c, out);
}

async function describeApplicability(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  const { xml } = loadObject(
    { path: str(args.path), xml: str(args.xml), dmc: str(args.dmc) },
    ctx,
    LIMITS.maxInlineXmlBytes,
  );
  const doc = defaultXmlEngine.parse(xml).document;
  const index = csdbIndex(ctx);
  const tables = findApplicTables(xml, index);
  const evaluator = new ApplicEvaluator(doc, { repository: applicRepository(index) });
  const used = new Set<string>();
  const statements = evaluator.statements.map((s) => {
    propertiesUsed(s.expr, used);
    return {
      id: s.id,
      isDmLevel: s.isDmLevel,
      displayText: s.displayText,
      hasExpression: s.expr !== undefined,
    };
  });
  const products =
    tables.pct?.pct.products.map((p) => ({ id: p.id, product: productFromPct(p) })) ?? [];
  const assigned = new Set<string>();
  for (const p of products)
    for (const k of [...Object.keys(p.product.attributes), ...Object.keys(p.product.conditions)])
      assigned.add(k);
  const notes = [...configNotes(ctx), ...tables.missing];
  const unassigned = [...used].filter((u) => !assigned.has(u));
  if (products.length > 0 && unassigned.length > 0) {
    notes.push(
      `The PCT products assign no value to: ${unassigned.join(', ')}. Statements using them stay "undetermined" unless you add these to "product".`,
    );
  }
  return {
    act: tables.act
      ? { path: tables.act.path, productAttributes: tables.act.act.productAttributes }
      : undefined,
    cct: tables.cct
      ? { path: tables.cct.path, condTypes: tables.cct.cct.condTypes, conds: tables.cct.cct.conds }
      : undefined,
    pct: tables.pct ? { path: tables.pct.path, products } : undefined,
    statements,
    propertiesUsedByStatements: [...used],
    propertiesNotAssignedInPct: unassigned,
    externalApplicRefs: [...evaluator['refIdToIdentValue'].entries()].map(([id, ident]) => ({
      id,
      applicIdentValue: ident,
      inRepository: applicRepository(index).has(ident),
    })),
    _notes: notes,
  };
}

async function readIcnMetadata(args: Args) {
  const ctx: ContextOptions = { extraDirs: strArray(args.csdbDirs) };
  let xml: string;
  let path: string | undefined;
  if (str(args.path) || str(args.xml)) {
    path = str(args.path);
    xml = loadXml({ path, xml: str(args.xml) }, LIMITS.maxInlineXmlBytes);
  } else if (str(args.icn)) {
    const index = csdbIndex(ctx);
    if (!index) throw new Error(`No CSDB folders. Pass "csdbDirs" or set ${ENV.csdbDirs}.`);
    const key = str(args.icn)!.toUpperCase().replace(/^ICN-/, '');
    const found = index.objects.find(
      (o) => o.kind === 'imf' && o.fileName.toUpperCase().includes(key),
    );
    if (!found) throw new Error(`No IMF for ICN ${args.icn} in: ${csdbSearchDirs(ctx).join(', ')}`);
    path = found.path;
    xml = index.read(found);
  } else throw new Error('One of "path", "xml" or "icn" is required');
  const doc = defaultXmlEngine.parse(xml).document;
  if (doc.documentElement?.nodeName !== 'icnMetadataFile')
    throw new Error(
      `Not an ICN metadata file (root element is <${doc.documentElement?.nodeName}>)`,
    );
  const sel = (e: string) => defaultXmlEngine.selectString(e, doc);
  const items: Array<{ path: string; value: string }> = [];
  for (const n of defaultXmlEngine.selectNodes('//imfIdentAndStatusSection//*[not(*)]', doc)) {
    const el = n as Element;
    const v = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const parts: string[] = [];
    let p: Element | null = el;
    while (p && p.nodeType === 1 && p.nodeName !== 'imfIdentAndStatusSection') {
      parts.unshift(p.nodeName);
      p = p.parentNode as Element | null;
    }
    const attrs = Array.from(el.attributes ?? [])
      .map((a) => `@${a.name}=${a.value}`)
      .join(' ');
    if (v || attrs)
      items.push({ path: parts.join('/'), value: [v, attrs].filter(Boolean).join(' ') });
  }
  const icn = sel('//imfIdent/imfCode/@imfIdentIcn');
  const index = csdbIndex(ctx);
  const files =
    icn && index
      ? index.objects
          .filter((o) => o.kind === 'icn' && o.fileName.toUpperCase().includes(icn.toUpperCase()))
          .map((o) => o.path)
      : [];
  return {
    path,
    icn,
    issueInfo: {
      issueNumber: sel('//imfIdent/issueInfo/@issueNumber'),
      inWork: sel('//imfIdent/issueInfo/@inWork'),
    },
    title: sel('//imfAddressItems/icnTitle'),
    keywords: defaultXmlEngine
      .selectNodes('//icnKeyword', doc)
      .map((n) => (n.textContent ?? '').trim()),
    issueDate:
      [
        sel('//imfAddressItems/issueDate/@year'),
        sel('//imfAddressItems/issueDate/@month'),
        sel('//imfAddressItems/issueDate/@day'),
      ]
        .filter(Boolean)
        .join('-') || undefined,
    securityClassification: sel('//imfStatus/security/@securityClassification'),
    items,
    icnFiles: files,
    verification: (await verification(xml, 'schema', ctx, path)).schema,
    _notes: configNotes(ctx),
  };
}

export const toolHandlers: Record<string, ToolHandler> = {
  list_data_modules: listDataModules,
  read_data_module: readDataModule,
  read_publication_module: readPublicationModule,
  resolve_reference: resolveReference,
  describe_applicability: describeApplicability,
  read_icn_metadata: readIcnMetadata,
};
