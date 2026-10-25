/**
 * 設定。環境変数とパッケージ情報をここに集める（s1000d-brex-mcp と同じ名前・同じ形）。
 */
import { createRequire } from 'node:module';
import { delimiter } from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

/** 環境変数の名前 */
export const ENV = {
  /** 利用者が入手した S1000D の配布物を展開したフォルダー。XSD（xml_schema_flat/）と既定 BREX をここから探す */
  specDir: 'S1000D_SPEC_DIR',
  /** プロジェクトの CSDB（データモジュールが置かれたフォルダー）。区切り文字で複数指定できる */
  csdbDirs: 'S1000D_CSDB_DIR',
} as const;

export function specDir(): string | undefined {
  const v = process.env[ENV.specDir]?.trim();
  return v ? v : undefined;
}

export function csdbDirs(): string[] {
  const v = process.env[ENV.csdbDirs];
  if (!v) return [];
  return v
    .split(delimiter)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 応答の大きさの上限 */
export const LIMITS = {
  /** XML 文字列を直接渡すときの上限（バイト） */
  maxInlineXmlBytes: 5 * 1024 * 1024,
  /** list_data_modules が 1 回で返す件数 */
  defaultListLimit: 100,
  maxListLimit: 1000,
  /** read_data_module が返す本文の節点の上限（超えた分は切り、_notes に書く） */
  maxContentNodes: 5000,
} as const;
