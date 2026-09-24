// Integration regressions: real workbook resolution, plans, and GeoStore writes.
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { Effect } from 'effect';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  disk: new Map<string, any>(),
  properties: new Map<string, any>(),
  store: null as any,
}));

vi.mock('~/core/database/indexeddb', () => ({
  db: {
    importSessions: {
      put: async (row: any) => {
        h.disk.set(row.id, structuredClone(row));
      },
      get: async (id: string) => h.disk.get(id),
      delete: async (id: string) => h.disk.delete(id),
      clear: async () => h.disk.clear(),
      where: (field: string) => ({
        equals: (value: unknown) => ({ toArray: async () => [...h.disk.values()].filter(s => s[field] === value) }),
        below: () => ({ delete: async () => 0 }),
      }),
    },
  },
}));
vi.mock('~/core/hooks/use-global-search-space-ids', () => ({ useGlobalSearchSpaceIds: () => [] }));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: h.store }) }));
vi.mock('~/core/sync/use-mutate', () => ({
  storage: {
    values: { set: (v: any) => h.store.setValue(v), setMany: (v: any) => h.store.setValues(v) },
    relations: { set: (r: any) => h.store.setRelation(r), setMany: (r: any) => h.store.setRelations(r) },
  },
}));
vi.mock('~/core/io/queries', () => ({
  getProperties: (ids: string[]) => Effect.succeed(ids.map(id => h.properties.get(id)).filter(Boolean)),
  getEntity: () => Effect.succeed(null),
  getNameValuesBatch: () => Effect.succeed([]),
  getEntityTiebreakerBatch: () => Effect.succeed([]),
}));

const { GeoStore, reactiveValues, reactiveRelations } = await import('~/core/sync/store');
const { GeoEventStream } = await import('~/core/sync/stream');
const { ImportSessions } = await import('~/core/chat/import/session');
const { useImportDispatcher, localImportOntology, mergeColumnCorrection } =
  await import('~/core/chat/import-dispatcher');
const { waitForFlush } = await import('~/core/chat/apply-queue');

const SPACE = '1'.repeat(32);
const PERSON = '2'.repeat(32);
const COMPANY = '3'.repeat(32);
const PROJECT = '4'.repeat(32);
const FOUNDER = '5'.repeat(32);
const EMPLOYER = '6'.repeat(32);

function sheet(name: string, rows: string[][]) {
  return {
    name,
    table: { headers: rows[0].map((_, i) => (i === 0 ? 'Name' : 'Link')), rows, rowCount: rows.length },
    raggedRows: 0,
    skippedLeadingRows: 0,
  };
}
function mapping(typeId: string, propertyId?: string, targetType?: string) {
  return {
    typeId,
    typeName: typeId === PERSON ? 'Person' : typeId === COMPANY ? 'Company' : 'Project',
    nameColumn: 0,
    summary: 'mapped',
    columns: propertyId
      ? [{ index: 1, kind: 'relation', propertyId, propertyName: 'Link', relationTypeIds: [targetType] }]
      : [],
  };
}
async function prepare(
  id = 'session',
  sheets = [sheet('Projects', [['Novel project']])],
  mappings: any = { Projects: mapping(PROJECT) }
) {
  ImportSessions.set({ id, fileName: 'test.xlsx', fileSizeBytes: 100, sheets, skippedSheets: [], spaceId: SPACE });
  await ImportSessions.setMapping(id, { mappings, mappedForSpaceId: SPACE, excludedSheets: [] });
}
function message(importId: string, toolCallId: string) {
  return [
    {
      id: toolCallId,
      role: 'assistant',
      parts: [{ type: 'tool-applyImport', state: 'input-available', toolCallId, input: { importId } }],
    },
  ] as any;
}
async function run(id = 'session', toolCallId = crypto.randomUUID()) {
  const callback = vi.fn();
  const ref = { current: callback };
  const hook = renderHook(({ messages }) => useImportDispatcher(messages, ref, SPACE), {
    initialProps: { messages: message(id, toolCallId) },
  });
  await act(async () => {
    await waitForFlush();
  });
  expect(callback).toHaveBeenCalledTimes(1);
  hook.unmount();
  return callback.mock.calls[0][0].output;
}
function nameValues() {
  return reactiveValues.get().filter(v => v.property.id === SystemIds.NAME_PROPERTY);
}

beforeEach(() => {
  h.disk.clear();
  h.properties.clear();
  ImportSessions.clearMemory();
  reactiveValues.set([]);
  reactiveRelations.set([]);
  h.store = new GeoStore(new GeoEventStream());
  vi.spyOn(h.store, 'getProperty').mockImplementation((id: any) => h.properties.get(id) ?? null);
  h.properties.set(FOUNDER, {
    id: FOUNDER,
    name: 'Founder',
    dataType: 'RELATION',
    relationValueTypes: [{ id: PERSON, name: 'Person' }],
  });
  h.properties.set(EMPLOYER, {
    id: EMPLOYER,
    name: 'Employer',
    dataType: 'RELATION',
    relationValueTypes: [{ id: COMPANY, name: 'Company' }],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('control: stages a novel row and its type through the actual import pipeline', async () => {
  await prepare();
  expect(await run()).toMatchObject({ staged: true, entityCount: 1, editCount: 2 });
  expect(nameValues()).toHaveLength(1);
});

it('blocks a retry of the same session while its previous edits are pending', async () => {
  await prepare();
  await run();
  const second = await run();
  expect({ output: second, pendingNames: nameValues().map(v => v.value) }).toMatchObject({
    output: { error: 'already_staged' },
    pendingNames: ['Novel project'],
  });
});

it('does not mistake a published probe value for a pending import', async () => {
  await prepare('first');
  await run('first');
  h.store.setAsPublished(
    reactiveValues.get().map(v => v.id),
    reactiveRelations.get().map(r => r.id)
  );
  expect(nameValues()[0].hasBeenPublished).toBe(true);
  await prepare('second');
  expect(await run('second')).toMatchObject({ staged: true });
});

it('respects relation target types when two workbook tabs contain the same name', async () => {
  await prepare(
    'session',
    [sheet('Companies', [['Alex']]), sheet('People', [['Alex']]), sheet('Projects', [['Test', 'Alex']])],
    {
      Companies: mapping(COMPANY),
      People: mapping(PERSON),
      Projects: mapping(PROJECT, FOUNDER, PERSON),
    }
  );
  await run();
  const person = reactiveRelations.get().find(r => r.type.id === SystemIds.TYPES_PROPERTY && r.toEntity.id === PERSON)!
    .fromEntity.id;
  const link = reactiveRelations.get().find(r => r.type.id === FOUNDER)!;
  expect(link.toEntity.id).toBe(person);
});

it('links a workbook cycle without creating a second entity for the later row', async () => {
  await prepare('session', [sheet('Companies', [['Acme', 'Alice']]), sheet('People', [['Alice', 'Acme']])], {
    Companies: mapping(COMPANY, FOUNDER, PERSON),
    People: mapping(PERSON, EMPLOYER, COMPANY),
  });
  await run();
  expect(
    nameValues()
      .map(v => v.value)
      .sort()
  ).toEqual(['Acme', 'Alice']);
});

it('counts two cross-sheet relation edges when two people share one employer', async () => {
  await prepare(
    'session',
    [
      sheet('People', [
        ['Alice', 'Acme'],
        ['Bob', 'Acme'],
      ]),
      sheet('Companies', [['Acme']]),
    ],
    {
      People: mapping(PERSON, EMPLOYER, COMPANY),
      Companies: mapping(COMPANY),
    }
  );
  const result = await run();
  expect(result).toMatchObject({
    staged: true,
    entityCount: 3,
    linkedEntityCount: 0,
    sheets: expect.arrayContaining([expect.objectContaining({ sheet: 'People', crossSheetLinks: 2 })]),
  });
  const edges = reactiveRelations.get().filter(relation => relation.type.id === EMPLOYER);
  expect(edges).toHaveLength(2);
  expect(new Set(edges.map(edge => edge.toEntity.id)).size).toBe(1);
});

it('cancels an active import when its tool is removed on Stop or New chat', async () => {
  await prepare();
  let release!: (r: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>(resolve => {
        release = resolve;
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  const ref = { current: vi.fn() };
  const hook = renderHook(({ messages }) => useImportDispatcher(messages, ref, SPACE), {
    initialProps: { messages: message('session', 'pending') },
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  hook.rerender({ messages: [] });
  await act(async () => {
    release(new Response(JSON.stringify({ ok: true })));
    await waitForFlush();
  });
  expect(nameValues()).toHaveLength(0);
});

it('stages nothing when a later sheet contains an invalid conversion', async () => {
  const quantity = '7'.repeat(32);
  h.properties.set(quantity, { id: quantity, name: 'Quantity', dataType: 'INTEGER' });
  await prepare('session', [sheet('People', [['Alice']]), sheet('Projects', [['Thing', '1.7']])], {
    People: mapping(PERSON),
    Projects: {
      ...mapping(PROJECT),
      columns: [{ index: 1, kind: 'value', propertyId: quantity, propertyName: 'Quantity', coercion: 'integer' }],
    },
  });
  expect(await run()).toMatchObject({ error: 'invalid_values', sheet: 'Projects' });
  expect(reactiveValues.get()).toHaveLength(0);
  expect(reactiveRelations.get()).toHaveLength(0);
});

it('rejects stale mappings after an ontology data type changes', async () => {
  await prepare('session', [sheet('Projects', [['Thing', 'Alice']])], { Projects: mapping(PROJECT, FOUNDER, PERSON) });
  h.properties.set(FOUNDER, { id: FOUNDER, name: 'Founder', dataType: 'TEXT' });
  expect(await run()).toMatchObject({ error: 'invalid_mapping' });
  expect(reactiveValues.get()).toHaveLength(0);
});

it('rejects persisted media mappings before silently dropping an image column', async () => {
  await prepare('session', [sheet('Projects', [['Thing', 'https://example.com/image.png']])], {
    Projects: mapping(PROJECT, FOUNDER, PERSON),
  });
  h.properties.set(FOUNDER, { id: FOUNDER, name: 'Cover', dataType: 'RELATION', renderableTypeStrict: 'IMAGE' });
  expect(await run()).toMatchObject({ error: 'invalid_mapping', message: expect.stringContaining('does not support') });
  expect(reactiveValues.get()).toHaveLength(0);
  expect(reactiveRelations.get()).toHaveLength(0);
});

it('keeps retry protection when the first imported value has been published but other edits remain', async () => {
  await prepare('first');
  await run('first');
  h.store.setAsPublished(
    reactiveValues.get().map(v => v.id),
    []
  );
  await prepare('second');
  expect(await run('second')).toMatchObject({ error: 'already_staged' });
});

it('does not silently overwrite conflicting rows with the same name and type', async () => {
  const note = '8'.repeat(32);
  h.properties.set(note, { id: note, name: 'Note', dataType: 'TEXT' });
  await prepare(
    'session',
    [
      sheet('Projects', [
        ['Thing', 'first'],
        ['Thing', 'second'],
      ]),
    ],
    {
      Projects: {
        ...mapping(PROJECT),
        columns: [{ index: 1, kind: 'value', propertyId: note, propertyName: 'Note', coercion: 'text' }],
      },
    }
  );
  expect(await run()).toMatchObject({ error: 'invalid_values' });
  expect(reactiveValues.get()).toHaveLength(0);
});

it('preserves every untouched column and the type during a targeted correction', () => {
  const previous: any = {
    ...mapping(PERSON),
    columns: [
      { index: 1, kind: 'relation', propertyId: FOUNDER, relationTypeIds: [PERSON], split: 'none' },
      { index: 2, kind: 'relation', propertyId: EMPLOYER, relationTypeIds: [COMPANY] },
    ],
  };
  const next: any = {
    ...mapping(COMPANY),
    columns: [
      { index: 1, kind: 'skip', reason: 'Changed without asking' },
      { index: 2, kind: 'skip', reason: 'Curator requested skip' },
    ],
  };
  const corrected = mergeColumnCorrection(previous, next, new Set([2]));
  expect(corrected.typeId).toBe(PERSON);
  expect(corrected.columns).toEqual([previous.columns[0], next.columns[1]]);
});

it('makes pending properties available to the mapper immediately', () => {
  h.store.setValue({
    id: 'local-name',
    entity: { id: FOUNDER, name: 'Founder' },
    property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
    value: 'Founder',
    spaceId: SPACE,
  });
  expect(localImportOntology(h.store, SPACE).properties).toContainEqual({
    id: FOUNDER,
    name: 'Founder',
    dataType: 'RELATION',
    relationValueTypes: [{ id: PERSON, name: 'Person' }],
  });
});

it('reports an authorization outage without telling a signed-in curator to sign in again', async () => {
  await prepare();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Unavailable', { status: 503 }))
  );
  expect(await run()).toMatchObject({ error: 'apply_failed', message: expect.stringContaining('verify write access') });
  expect(reactiveValues.get()).toHaveLength(0);
});

it('reuses a pending entity across different files instead of minting another row identity', async () => {
  await prepare('first');
  await run('first');
  await prepare('second', [sheet('Projects', [['Novel project'], ['Another project']])]);
  expect(await run('second')).toMatchObject({ staged: true, entityCount: 2 });
  expect(
    nameValues()
      .map(v => v.value)
      .sort()
  ).toEqual(['Another project', 'Novel project']);
});

it('shares a new relation target across two properties', async () => {
  const editor = '9'.repeat(32);
  h.properties.set(editor, {
    id: editor,
    name: 'Editor',
    dataType: 'RELATION',
    relationValueTypes: [{ id: PERSON, name: 'Person' }],
  });
  await prepare('session', [sheet('Projects', [['Thing', 'Alice', 'Alice']])], {
    Projects: {
      ...mapping(PROJECT, FOUNDER, PERSON),
      columns: [
        ...mapping(PROJECT, FOUNDER, PERSON).columns,
        { index: 2, kind: 'relation', propertyId: editor, propertyName: 'Editor', relationTypeIds: [PERSON] },
      ],
    },
  });
  await run();
  const targets = reactiveRelations
    .get()
    .filter(r => r.type.id === FOUNDER || r.type.id === editor)
    .map(r => r.toEntity.id);
  expect(new Set(targets).size).toBe(1);
  expect(nameValues().filter(v => v.value === 'Alice')).toHaveLength(1);
});

it('reports incompatible cross-sheet types before staging instead of creating a second namesake', async () => {
  await prepare('session', [sheet('People', [['Alice', 'Example']]), sheet('Organizations', [['Example']])], {
    People: mapping(PERSON, EMPLOYER, COMPANY),
    Organizations: mapping(PROJECT),
  });
  expect(await run()).toMatchObject({
    error: 'invalid_mapping',
    message: expect.stringContaining('Import is blocked'),
  });
  expect(reactiveValues.get()).toHaveLength(0);
});

it('changes sheet exclusions without remapping a confirmed column choice', async () => {
  const mappings = { People: mapping(PERSON), Organizations: mapping(COMPANY) };
  await prepare('session', [sheet('People', [['Alice']]), sheet('Organizations', [['Acme']])], mappings);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const callback = vi.fn();
  const hook = renderHook(() =>
    useImportDispatcher(
      [
        {
          id: 'preview',
          role: 'assistant',
          parts: [
            {
              type: 'tool-proposeImportMapping',
              state: 'input-available',
              toolCallId: 'exclude',
              input: {
                importId: 'session',
                excludeSheets: ['Organizations'],
                hint: 'Keep all current mappings unchanged.',
              },
            },
          ],
        },
      ] as any,
      { current: callback },
      SPACE
    )
  );
  await act(async () => {
    await waitForFlush();
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await ImportSessions.getMapping('session'))?.mappings.People).toEqual(mappings.People);
  expect(callback.mock.calls[0][0].output).toMatchObject({ status: 'preview', excludedSheets: ['Organizations'] });
  hook.unmount();
});
