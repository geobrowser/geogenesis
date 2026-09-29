/**
 * Which space an import lands in, and when its mapping has gone stale.
 *
 * The bug this encodes: a file attached on `/root` was pinned to Root forever.
 * The user switched to a space they curate, asked to import, and was told three
 * times over that they lacked permission — because every attempt kept sending
 * Root's id. Moving between spaces has to move the import with it.
 */
import { describe, expect, it, vi } from 'vitest';

// The helper under test is pure, but importing the dispatcher drags in the
// apply path, which builds a real sync store at module load.
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: null }) }));
vi.mock('~/core/hooks/use-global-search-space-ids', () => ({ useGlobalSearchSpaceIds: () => [] }));
vi.mock('~/core/sync/use-mutate', () => ({ storage: {}, useMutate: () => ({}) }));
vi.mock('~/core/database/indexeddb', () => ({ db: { importSessions: {} } }));

const { resolveImportTarget, orderSheets, findSheet } = await import('./import-dispatcher');

const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
const AI = '41e851610e13a19441c4d980f2f2ce6b';

type Sheet = import('./import/session').ImportSheet;
type Mapping = import('./import/mapping-types').ImportMapping;

function sheet(name: string, headers: string[], rows: string[][]): Sheet {
  return { name, table: { headers, rows, rowCount: rows.length }, raggedRows: 0, skippedLeadingRows: 0 };
}

function mapping(typeName: string, relations: number[] = []): Mapping {
  return {
    typeId: 'a'.repeat(32),
    typeName,
    nameColumn: 0,
    summary: 's',
    columns: relations.map(index => ({
      index,
      kind: 'relation' as const,
      propertyId: 'b'.repeat(32),
      propertyName: 'Link',
      relationTypeIds: [],
    })),
  };
}

describe('orderSheets', () => {
  const publishers = sheet(
    'Publishers',
    ['Publisher', 'Country'],
    [
      ['Reuters', 'United Kingdom'],
      ['AP', 'United States'],
    ]
  );
  const countries = sheet(
    'Countries',
    ['Country', 'Region'],
    [
      ['United Kingdom', 'Europe'],
      ['United States', 'Americas'],
    ]
  );
  const topics = sheet('Topics', ['Topic'], [['Politics']]);

  it('puts a tab before the tabs whose cells name its rows', () => {
    // Publishers' Country column names rows of Countries, so Countries has to
    // be staged first or the links would be minted as fresh entities.
    const ordered = orderSheets([publishers, countries], {
      Publishers: mapping('Publisher', [1]),
      Countries: mapping('Country'),
    });

    expect(ordered.map(s => s.name)).toEqual(['Countries', 'Publishers']);
  });

  it('keeps workbook order when nothing links', () => {
    const ordered = orderSheets([publishers, countries, topics], {
      Publishers: mapping('Publisher'),
      Countries: mapping('Country'),
      Topics: mapping('Topic'),
    });

    expect(ordered.map(s => s.name)).toEqual(['Publishers', 'Countries', 'Topics']);
  });

  it('matches names regardless of case', () => {
    const shouting = sheet('Countries', ['Country'], [['UNITED KINGDOM']]);

    const ordered = orderSheets([publishers, shouting], {
      Publishers: mapping('Publisher', [1]),
      Countries: mapping('Country'),
    });

    expect(ordered.map(s => s.name)).toEqual(['Countries', 'Publishers']);
  });

  it('falls back to workbook order on a cycle', () => {
    const a = sheet('A', ['Name', 'Link'], [['a1', 'b1']]);
    const b = sheet('B', ['Name', 'Link'], [['b1', 'a1']]);

    const ordered = orderSheets([a, b], { A: mapping('A', [1]), B: mapping('B', [1]) });

    expect(ordered.map(s => s.name)).toEqual(['A', 'B']);
  });

  it('splits list cells before looking for matches', () => {
    const multi = sheet('Publishers', ['Publisher', 'Countries'], [['Reuters', 'France, United Kingdom']]);

    const ordered = orderSheets([multi, countries], {
      Publishers: mapping('Publisher', [1]),
      Countries: mapping('Country'),
    });

    expect(ordered.map(s => s.name)).toEqual(['Countries', 'Publishers']);
  });
});

describe('findSheet', () => {
  const session = {
    id: 'abc',
    fileName: 'f.xlsx',
    fileSizeBytes: 1,
    sheets: [sheet('World Affairs', ['Name'], [['x']])],
    skippedSheets: [],
    spaceId: ROOT,
  };

  it('matches the exact name, then loosely by case and spacing', () => {
    expect(findSheet(session, 'World Affairs')?.name).toBe('World Affairs');
    expect(findSheet(session, 'world affairs ')?.name).toBe('World Affairs');
    expect(findSheet(session, 'Politics')).toBeNull();
  });
});

describe('resolveImportTarget', () => {
  it('targets the space the user is in, not the one the file came from', () => {
    expect(resolveImportTarget({ currentSpaceId: AI, attachedSpaceId: ROOT, mappedForSpaceId: AI })).toMatchObject({
      targetSpaceId: AI,
      stale: false,
    });
  });

  it('calls the mapping stale when the user has moved since it was made', () => {
    // The transcript that started this: attached and mapped on Root, then
    // switched to AI. The mapping is Root's answer and must not be applied here.
    expect(resolveImportTarget({ currentSpaceId: AI, attachedSpaceId: ROOT, mappedForSpaceId: ROOT })).toEqual({
      targetSpaceId: AI,
      mappedForSpaceId: ROOT,
      stale: true,
    });
  });

  it('is not stale when nothing moved', () => {
    expect(resolveImportTarget({ currentSpaceId: ROOT, attachedSpaceId: ROOT, mappedForSpaceId: ROOT }).stale).toBe(
      false
    );
  });

  it('falls back to the attach space when the current space is unknown', () => {
    // The chat can be open outside a space route. Better to keep the old
    // behaviour than to target nothing.
    expect(resolveImportTarget({ currentSpaceId: null, attachedSpaceId: ROOT, mappedForSpaceId: ROOT })).toMatchObject({
      targetSpaceId: ROOT,
      stale: false,
    });
  });

  it('treats an untracked mapping as belonging to the space it was attached in', () => {
    // Mappings stored before `mappedForSpaceId` existed. That is where they
    // would have been built, so assuming it keeps them usable rather than
    // forcing a pointless re-propose.
    expect(resolveImportTarget({ currentSpaceId: ROOT, attachedSpaceId: ROOT, mappedForSpaceId: null })).toMatchObject({
      mappedForSpaceId: ROOT,
      stale: false,
    });

    expect(resolveImportTarget({ currentSpaceId: AI, attachedSpaceId: ROOT, mappedForSpaceId: null }).stale).toBe(true);
  });

  it('does not mistake a formatting difference for a space change', () => {
    // One id comes from a route param, the other from IndexedDB. A dashed or
    // upper-cased id on either side would make every single apply look like the
    // user had moved.
    const dashed = 'a19c345a-b986-6679-b001-d7d2138d88a1';

    expect(resolveImportTarget({ currentSpaceId: dashed, attachedSpaceId: ROOT, mappedForSpaceId: ROOT }).stale).toBe(
      false
    );

    expect(
      resolveImportTarget({ currentSpaceId: ROOT, attachedSpaceId: ROOT, mappedForSpaceId: ROOT.toUpperCase() }).stale
    ).toBe(false);
  });
});
