/**
 * 読み取りに使うもの（CSDB の索引、XSD の検証器、BREX の解決器、適用性リポジトリ）をまとめて作る。
 * ACT・CCT・PCT の探索は core 0.3.0 の findApplicTables（以前はここにあった）。
 * 探索・検証・判定の処理はすべて s1000d-core。ここは環境変数とツール引数の解釈、索引の使い回しだけ。
 * CSDB の中身は索引の `read()`（core 0.5.0 の `CsdbSource`）から読み、`readFileSync` はツール引数の `path` にだけ使う。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  CsdbIndex,
  buildApplicRepository,
  createDirectoryBrexResolver,
  defaultXmlEngine,
  findSchemaDirs,
  parseDmc,
  parsePmc,
  readApplicStatements,
  type ApplicStatement,
  type BrexResolver,
  type CsdbObject,
  type DmCode,
  type SchemaDir,
} from '@shuji-bonji/s1000d-core';
import { Libxml2SchemaValidator } from '@shuji-bonji/s1000d-core/xsd-libxml2';
import {
  ENV,
  csdbDirs,
  specDir,
  specDirHint,
  stackConfig,
  stackConfigWarnings,
} from '../config.js';

export interface ContextOptions {
  /** ツール引数で追加されたフォルダー */
  extraDirs?: string[];
}

function existingDirs(dirs: string[]): string[] {
  return [...new Set(dirs.filter((d) => existsSync(d) && statSync(d).isDirectory()))];
}

/** CSDB として探すフォルダー（優先順: ツール引数 → S1000D_CSDB_DIR） */
export function csdbSearchDirs(options: ContextOptions = {}): string[] {
  return existingDirs([...(options.extraDirs ?? []), ...csdbDirs()]);
}

/** BREX を探すフォルダー（CSDB ＋ 配布物） */
export function brexSearchDirs(options: ContextOptions = {}): string[] {
  const spec = specDir();
  return existingDirs([...csdbSearchDirs(options), ...(spec ? [spec] : [])]);
}

let validator: Libxml2SchemaValidator | undefined;
export function schemaValidator(): Libxml2SchemaValidator {
  validator ??= new Libxml2SchemaValidator();
  return validator;
}
export function disposeValidator(): void {
  validator?.dispose();
  validator = undefined;
}

const schemaDirCache = new Map<string, SchemaDir[]>();
/** `S1000D_SPEC_DIR` の下の xml_schema_flat/（データ辞書の写しは除く）。未設定なら空 */
export function schemaDirs(): SchemaDir[] {
  const spec = specDir();
  if (!spec || !existsSync(spec)) return [];
  let dirs = schemaDirCache.get(spec);
  if (!dirs) {
    dirs = findSchemaDirs([spec]).filter(
      (d) => !/(^|[\\/])data_dictionary[^\\/]*[\\/]/i.test(d.dir),
    );
    schemaDirCache.set(spec, dirs);
  }
  return dirs;
}

const indexCache = new Map<string, CsdbIndex>();
export function csdbIndex(options: ContextOptions = {}): CsdbIndex | undefined {
  const dirs = csdbSearchDirs(options);
  if (dirs.length === 0) return undefined;
  const key = dirs.join('\0');
  let index = indexCache.get(key);
  if (!index) {
    index = CsdbIndex.fromDirs(dirs);
    indexCache.set(key, index);
  }
  return index;
}
export function clearCaches(): void {
  indexCache.clear();
  schemaDirCache.clear();
}

export function brexResolver(options: ContextOptions = {}): BrexResolver {
  return createDirectoryBrexResolver(brexSearchDirs(options));
}

export function configNotes(options: ContextOptions = {}): string[] {
  const notes: string[] = [...stackConfigWarnings()];
  if (!specDir()) {
    notes.push(
      `${ENV.specDir} is not set: verification.schema is reported as schema-not-found. ${specDirHint()}`,
    );
  } else if (schemaDirs().length === 0) {
    notes.push(
      `No xml_schema_flat/ folder (containing brex.xsd) was found under ${ENV.specDir}=${specDir()}.`,
    );
  }
  if (csdbSearchDirs(options).length === 0) {
    notes.push(
      `No CSDB folders: set ${ENV.csdbDirs}, add "csdbDirs" to ${stackConfig().configPath}, or pass "csdbDirs". References cannot be resolved and ACT/CCT/PCT cannot be found.`,
    );
  }
  return notes;
}

export function loadXml(input: { path?: string; xml?: string }, maxBytes: number): string {
  if (input.xml !== undefined && input.xml.trim() !== '') {
    if (Buffer.byteLength(input.xml, 'utf8') > maxBytes)
      throw new Error(`Inline XML exceeds ${maxBytes} bytes`);
    return input.xml;
  }
  if (input.path !== undefined && input.path.trim() !== '') {
    if (!existsSync(input.path)) throw new Error(`File not found: ${input.path}`);
    return readFileSync(input.path, 'utf8');
  }
  throw new Error('Either "path" or "xml" is required');
}

/** `path` か DMC（`dmc`）か PMC（`pmc`）の指定から XML を読む。DMC / PMC は CSDB から探す */
export function loadObject(
  args: { path?: string; xml?: string; dmc?: string; pmc?: string },
  options: ContextOptions,
  maxBytes: number,
): { xml: string; path?: string } {
  if (args.path || args.xml) return { xml: loadXml(args, maxBytes), path: args.path };
  const index = csdbIndex(options);
  if (args.dmc) {
    const dmc = parseDmc(args.dmc);
    if (!dmc.ok) throw new Error(`"dmc" is not a DMC: ${dmc.error}`);
    if (!index)
      throw new Error(
        `No CSDB folders to search for ${args.dmc}. Pass "csdbDirs" or set ${ENV.csdbDirs}.`,
      );
    const found = index.findDataModules(dmc.value)[0];
    if (!found)
      throw new Error(
        `Data module ${args.dmc} was not found in: ${csdbSearchDirs(options).join(', ')}`,
      );
    return { xml: index.read(found), path: found.path };
  }
  if (args.pmc) {
    const pmc = parsePmc(args.pmc);
    if (!pmc.ok) throw new Error(`"pmc" is not a PMC: ${pmc.error}`);
    if (!index)
      throw new Error(
        `No CSDB folders to search for ${args.pmc}. Pass "csdbDirs" or set ${ENV.csdbDirs}.`,
      );
    const found = index.findPublicationModules(pmc.value)[0];
    if (!found)
      throw new Error(
        `Publication module ${args.pmc} was not found in: ${csdbSearchDirs(options).join(', ')}`,
      );
    return { xml: index.read(found), path: found.path };
  }
  throw new Error('One of "path", "xml", "dmc" or "pmc" is required');
}

/** CSDB の DM を DMC で読む（無ければ undefined） */
export function readDmByCode(
  index: CsdbIndex | undefined,
  dmCode: DmCode,
): { path: string; xml: string } | undefined {
  const found = index?.findDataModules(dmCode)[0];
  if (!found || !index) return undefined;
  return { path: found.path, xml: index.read(found) };
}

/**
 * 索引のオブジェクトを、応答に載せた `path` から読み直す（参照の解決結果など、CsdbObject を手放した後に使う）。
 * 索引に無い path は、これまでどおりファイルとして読む
 */
export function readObjectText(index: CsdbIndex | undefined, path: string): string {
  const obj = index?.objects.find((o) => o.path === path);
  return obj && index ? index.read(obj) : readFileSync(path, 'utf8');
}

/** CSDB の中の「適用性リポジトリ」（applic/@applicIdentValue を持つ DM）を集めて、applicIdentValue → applic の表にする */
const repositoryCache = new Map<CsdbIndex, Map<string, ApplicStatement>>();
export function applicRepository(index: CsdbIndex | undefined): Map<string, ApplicStatement> {
  if (!index) return new Map();
  let repo = repositoryCache.get(index);
  if (repo) return repo;
  const statements: ApplicStatement[] = [];
  for (const o of index.objects.filter((x: CsdbObject) => x.kind === 'dm')) {
    let xml: string;
    try {
      xml = index.read(o);
    } catch {
      continue;
    }
    if (!xml.includes('applicIdentValue')) continue;
    try {
      statements.push(
        ...readApplicStatements(defaultXmlEngine.parse(xml).document).filter(
          (s) => s.applicIdentValue,
        ),
      );
    } catch {
      // 読めない DM は無視する
    }
  }
  repo = buildApplicRepository(statements);
  repositoryCache.set(index, repo);
  return repo;
}
