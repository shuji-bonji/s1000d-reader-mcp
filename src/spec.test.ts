/**
 * 利用者が入手した S1000D の配布物に対するテスト（`S1000D_SPEC_TESTS=1` のときだけ）。
 * 配布物は再配布できない（DECISIONS D-03）。場所は `S1000D_SPEC_DIR`（既定: ../../specs/s1000d/issue-7）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildServer } from './server.js';
import { clearCaches, disposeValidator } from './services/context.js';

const enabled = process.env.S1000D_SPEC_TESTS === '1';
const specDir = resolve(process.env.S1000D_SPEC_DIR ?? '../../specs/s1000d/issue-7');

function findBikeDir(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (/bike/i.test(e.name) && readdirSync(p).some((n) => /^DMC-.*\.XML$/i.test(n))) return p;
      const inner = findBikeDir(p);
      if (inner) return inner;
    }
  }
  return undefined;
}

let client: Client;
const bikeDir = findBikeDir(specDir);

async function call(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const text =
    (res.content as { type: string; text: string }[]).find((c) => c.type === 'text')?.text ?? '{}';
  return { isError: res.isError === true, data: JSON.parse(text) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe.skipIf(!enabled || !bikeDir)('S1000D 配布物（利用者が入手したもの）', () => {
  beforeAll(async () => {
    process.env.S1000D_SPEC_DIR = specDir;
    delete process.env.S1000D_CSDB_DIR;
    clearCaches();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await buildServer().connect(serverTransport);
    client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);
  });
  afterAll(async () => {
    await client.close();
    disposeValidator();
  });

  it('list_data_modules: Bike Samples の DM を種類別に数える', async () => {
    const r = await call('list_data_modules', { csdbDirs: [bikeDir!], limit: 1000 });
    expect(r.data.page.total).toBe(106);
    expect(r.data.countsBySchema).toMatchObject({
      proced: 39,
      descript: 14,
      comrep: 15,
    });
  });

  it('read_data_module: 手順 DM を PCT の製品で読む（XSD 適合、ステップ番号、適用性の判定）', async () => {
    const d = await call('describe_applicability', {
      dmc: 'S1000DBIKE-AAA-DA0-30-00-00AA-520A-A',
      csdbDirs: [bikeDir!],
    });
    expect(d.data.act.productAttributes.map((a: { id: string }) => a.id)).toContain('model');
    expect(d.data.pct.products).toHaveLength(3);
    expect(d.data.propertiesNotAssignedInPct).toEqual(['type']); // background.md「適用性の評価で分かった配布物の性質」
    const product = {
      ...d.data.pct.products[2].product,
      attributes: { ...d.data.pct.products[2].product.attributes, type: 'Mountain bicycle' },
    };
    const r = await call('read_data_module', {
      dmc: 'S1000DBIKE-AAA-DA0-30-00-00AA-520A-A',
      csdbDirs: [bikeDir!],
      product,
    });
    expect(r.data.verification.schema).toMatchObject({ state: 'valid', issue: '7' });
    expect(r.data.content.kind).toBe('proced');
    expect(r.data.identAndStatus.applicability.state).toBe('applicable');
    const steps = r.data.content.blocks.filter((b: { kind: string }) => b.kind === 'step');
    expect(steps[0].number).toBe('1');
    expect(r.data.references.resolved.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.data)).not.toContain('applicPropertyValues');
  });

  it('read_publication_module: 目次の dmRef がすべて解決する', async () => {
    const r = await call('read_publication_module', {
      pmc: 'S1000DBIKE-B6865-EPWG1-00',
      csdbDirs: [bikeDir!],
    });
    expect(r.data.verification.schema.state).toBe('valid');
    const entries = r.data.entries[0].children;
    expect(entries.length).toBeGreaterThan(50);
    expect(entries.filter((e: { unresolved?: string }) => e.unresolved)).toEqual([]);
  });

  it('read_icn_metadata: IMF を読む', async () => {
    const r = await call('read_icn_metadata', {
      icn: 'C0419-S1000D0360-001-01',
      csdbDirs: [bikeDir!],
    });
    expect(r.data).toMatchObject({ icn: 'C0419-S1000D0360-001-01', title: 'Bicycle' });
    expect(r.data.keywords).toContain('mountain bike');
    expect(r.data.verification.state).toBe('valid');
  });

  it('resolve_reference: 宣言は .PNG でも実ファイルは .SVG（配布物の不整合がそのまま見える）', async () => {
    const dm = readdirSync(bikeDir!).find((n) =>
      /^DMC-S1000DLIGHTING-.*-040A-A_.*\.XML$/i.test(n),
    )!;
    const r = await call('resolve_reference', {
      icn: 'ICN-C0419-S1000D0406-001-01',
      fromPath: join(bikeDir!, dm),
      csdbDirs: [bikeDir!],
    });
    expect(r.data.declared.systemId).toMatch(/\.PNG$/);
    expect(r.data.found.map((f: { fileName: string }) => f.fileName)).toEqual([
      'ICN-C0419-S1000D0406-001-01.SVG',
    ]);
  });
});
