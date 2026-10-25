/**
 * サーバを InMemoryTransport で叩き、ツール定義とハンドラの対応、各ツールの応答の形を確かめる。
 * テストデータは自作（券売機: 説明 DM、手順 DM、ACT、BREX 2 層、PM）。配布物は使わない。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { buildServer } from './server.js';
import { clearCaches, disposeValidator } from './services/context.js';
import { tools } from './tools/definitions.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
const PROCED = 'KENBAIKI-A-10-20-00-00A-520A-A';
const DESCRIPT = 'KENBAIKI-A-10-20-00-00A-040A-D';

let client: Client;

async function call(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const text =
    (res.content as { type: string; text: string }[]).find((c) => c.type === 'text')?.text ?? '{}';
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { isError: res.isError === true, data: data as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Node = {
  kind: string;
  number?: string;
  text?: string;
  applicRefId?: string;
  applicability?: { state: string; displayText?: string; reason?: string };
  children: Node[];
};
const walk = (nodes: Node[], f: (n: Node) => void) => {
  for (const n of nodes) {
    f(n);
    walk(n.children, f);
  }
};

beforeAll(async () => {
  delete process.env.S1000D_SPEC_DIR;
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

describe('server', () => {
  it('instructions で「しないこと」を宣言している', () => {
    const text = client.getInstructions() ?? '';
    expect(text).toContain('does NOT');
    expect(text).toContain('undetermined');
    expect(text).toContain('S1000D_SPEC_DIR');
  });
  it('定義したツールがすべて登録されている', async () => {
    const listed = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(listed).toEqual(tools.map((t) => t.name).sort());
  });
  it('未知の引数は拒否される', async () => {
    const r = await call('list_data_modules', { csdbDirs: [fixtures], bogus: 1 });
    expect(r.isError).toBe(true);
  });
});

describe('list_data_modules', () => {
  it('CSDB の DM を題名付きで一覧にし、filter で絞れる', async () => {
    const all = await call('list_data_modules', { csdbDirs: [fixtures] });
    expect(all.data.page.total).toBe(5); // 説明、手順、ACT、BREX 2 層
    expect(all.data.countsBySchema).toMatchObject({
      descript: 1,
      proced: 1,
      appliccrossreftable: 1,
      brex: 2,
    });
    const proced = await call('list_data_modules', {
      csdbDirs: [fixtures],
      filter: { infoCode: '520' },
    });
    expect(proced.data.objects).toHaveLength(1);
    expect(proced.data.objects[0]).toMatchObject({
      dmc: PROCED,
      techName: '前面扉',
      infoName: '開け方',
      schemaName: 'proced',
      issue: '7',
      applicDisplayText: 'MV-50 と MV-60',
    });
    const text = await call('list_data_modules', {
      csdbDirs: [fixtures],
      filter: { text: '適用性' },
    });
    expect(text.data.objects.map((o: { infoName: string }) => o.infoName)).toEqual([
      '適用性相互参照表',
    ]);
    const pm = await call('list_data_modules', { csdbDirs: [fixtures], include: ['pm'] });
    expect(pm.data.objects[0]).toMatchObject({
      kind: 'pm',
      pmc: 'KENBAIKI-K0001-OPM01-00',
      techName: '券売機 操作マニュアル',
    });
  });
  it('CSDB が無ければエラー', async () => {
    const r = await call('list_data_modules', {});
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain('S1000D_CSDB_DIR');
  });
});

describe('read_data_module', () => {
  it('product 無し: 本文の構造と verification を返し、適用性は undetermined で displayText だけ', async () => {
    const r = await call('read_data_module', { dmc: PROCED, csdbDirs: [fixtures] });
    expect(r.isError).toBe(false);
    expect(r.data.verification.schema.state).toBe('schema-not-found');
    expect(r.data.verification.brex.state).toBe('not-run');
    expect(r.data.identAndStatus.techName).toBe('前面扉');
    expect(r.data.identAndStatus.applicability).toMatchObject({
      state: 'undetermined',
      displayText: 'MV-50 と MV-60',
      reason: 'product not given',
    });
    expect(r.data.content.kind).toBe('proced');
    const steps: Node[] = [];
    walk(r.data.content.blocks, (n) => n.kind === 'step' && steps.push(n));
    expect(steps.map((s) => s.number)).toEqual(['1', '1.1', '1.2', '2', '3']);
    expect(steps[0].text).toContain('[→ seq-0001]');
    expect(steps[0].text).toContain('[→ KENBAIKI-A-10-20-00-00A-040A-D]');
    const applic = steps.filter((s) => s.applicability);
    expect(applic.map((s) => s.applicability!.state)).toEqual(['undetermined', 'undetermined']);
    expect(applic[0].applicability!.displayText).toBe('MV-60 だけ');
    expect(JSON.stringify(r.data)).not.toContain('applicPropertyValues'); // 式は返さない
    expect(
      r.data.references.resolved.some(
        (x: { kind: string; infoName?: string }) => x.kind === 'dmRef' && x.infoName === '説明',
      ),
    ).toBe(true);
    expect(r.data.references.unresolved.map((u: { reason: string }) => u.reason)).toEqual([
      'file-not-found',
    ]); // ICN の PNG は無い
    expect(r.data._notes.join(' ')).toContain('No product was given');
  });

  it('product あり: 判定が切り替わり、omitNotApplicable で省ける', async () => {
    const mv60 = { attributes: { model: 'MV-60', version: '3', site: 'indoor' } };
    const r = await call('read_data_module', {
      dmc: PROCED,
      csdbDirs: [fixtures],
      product: mv60,
      section: 'content',
    });
    expect(r.data.identAndStatus).toBeUndefined();
    const states: Record<string, string> = {};
    walk(
      r.data.content.blocks,
      (n) => n.applicability && (states[n.applicRefId!] = n.applicability.state),
    );
    expect(states).toEqual({ 'app-mv60': 'applicable', 'app-outdoor': 'notApplicable' });

    const omitted = await call('read_data_module', {
      dmc: PROCED,
      csdbDirs: [fixtures],
      product: mv60,
      omitNotApplicable: true,
      verify: 'none',
    });
    const refIds: string[] = [];
    walk(omitted.data.content.blocks, (n) => n.applicRefId && refIds.push(n.applicRefId));
    expect(refIds).toEqual(['app-mv60']);
    expect(omitted.data._notes.join(' ')).toContain('1 block(s)');
    expect(omitted.data.verification.schema.state).toBe('not-run');

    const partial = await call('read_data_module', {
      dmc: PROCED,
      csdbDirs: [fixtures],
      product: { attributes: { model: 'MV-50' } },
    });
    expect(partial.data.identAndStatus.applicability.state).toBe('applicable');
    const outdoor = partial.data.content.blocks.find((b: Node) => b.applicRefId === 'app-outdoor');
    expect(outdoor.applicability).toMatchObject({
      state: 'undetermined',
      reason: 'product has no value for: site',
    });
  });

  it('verify=full で BREX と参照も検証する', async () => {
    const r = await call('read_data_module', {
      path: join(fixtures, 'DMC-KENBAIKI-A-10-20-00-00A-040A-D_002-01_JA-JP.XML'),
      csdbDirs: [fixtures],
      verify: 'full',
      section: 'identAndStatus',
    });
    expect(r.data.verification.brex.layers).toBe(2);
    expect(['passed', 'violations']).toContain(r.data.verification.brex.state);
    expect(r.data.verification.references.state).toBe('unresolved');
    expect(r.data.content).toBeUndefined();
  });

  it('無い DMC はエラー', async () => {
    const r = await call('read_data_module', {
      dmc: 'KENBAIKI-A-99-00-00-00A-040A-D',
      csdbDirs: [fixtures],
    });
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain('was not found');
  });
});

describe('describe_applicability', () => {
  it('ACT の属性と DM の applic 文を返し、何も判定しない', async () => {
    const r = await call('describe_applicability', { dmc: PROCED, csdbDirs: [fixtures] });
    expect(r.data.act.productAttributes.map((a: { id: string }) => a.id)).toEqual([
      'serial',
      'model',
      'version',
      'site',
    ]);
    expect(r.data.act.productAttributes[1].enumerations).toEqual(['MV-50|MV-60']);
    expect(r.data.cct).toBeUndefined();
    expect(r.data.pct).toBeUndefined();
    expect(
      r.data.statements.map(
        (s: { id?: string; isDmLevel: boolean }) => s.id ?? (s.isDmLevel ? 'dm' : '?'),
      ),
    ).toEqual(['dm', 'app-mv60', 'app-outdoor']);
    expect(r.data.propertiesUsedByStatements.sort()).toEqual(['model', 'site']);
    expect(JSON.stringify(r.data)).not.toContain('applicPropertyValues="');
  });
  it('ACT の参照が無い DM では、同じモデル識別コードの ACT を探す', async () => {
    const r = await call('describe_applicability', { dmc: DESCRIPT, csdbDirs: [fixtures] });
    expect(r.data.act).toBeDefined();
  });
});

describe('read_publication_module / resolve_reference', () => {
  it('PM を目次として読み、dmRef を CSDB で解決する', async () => {
    const r = await call('read_publication_module', {
      pmc: 'KENBAIKI-K0001-OPM01-00',
      csdbDirs: [fixtures],
    });
    expect(r.data.identAndStatus).toMatchObject({
      pmTitle: '券売機 操作マニュアル',
      issueDate: '2026-10-25',
    });
    const top = r.data.entries[0];
    expect(top.title).toBe('操作');
    expect(top.children[0]).toMatchObject({ kind: 'entry', target: DESCRIPT });
    expect(top.children[0].resolved).toMatchObject({ techName: '指定席券売機', infoName: '説明' });
    const sub = top.children[1];
    expect(sub.title).toBe('保守');
    expect(sub.children[0].resolved).toMatchObject({ techName: '前面扉' });
    expect(sub.children[1]).toMatchObject({
      target: 'KENBAIKI-A-99-00-00-00A-520A-A',
      unresolved: 'not-found',
    });
  });
  it('DMC は版の降順で、ICN は宣言から探す', async () => {
    const d = await call('resolve_reference', { dmc: 'DMC-' + DESCRIPT, csdbDirs: [fixtures] });
    expect(d.data.found).toHaveLength(1);
    expect(d.data.found[0]).toMatchObject({
      infoName: '説明',
      issueInfo: { issueNumber: '002', inWork: '01' },
    });
    const icn = await call('resolve_reference', {
      icn: 'ICN-KENBAIKI-A-102000-0-K0001-00002-A-01-1',
      fromPath: join(fixtures, 'DMC-KENBAIKI-A-10-20-00-00A-520A-A_001-00_JA-JP.XML'),
      csdbDirs: [fixtures],
    });
    expect(icn.data.declared).toEqual({
      systemId: 'ICN-KENBAIKI-A-102000-0-K0001-00002-A-01-1.PNG',
      notation: 'png',
    });
    expect(icn.data.found).toEqual([]);
  });
  it('IMF が無ければエラー', async () => {
    const r = await call('read_icn_metadata', { icn: 'C0419-NOTHING', csdbDirs: [fixtures] });
    expect(r.isError).toBe(true);
  });
});
