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

const { resolveImportTarget } = await import('./import-dispatcher');

const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
const AI = '41e851610e13a19441c4d980f2f2ce6b';

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
