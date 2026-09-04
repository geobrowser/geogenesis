/**
 * Where a parsed file lives while the assistant works on it.
 *
 * Client-side by design. The row data is the one part of an import that must
 * never travel: it is not uploaded, not sent to the model, and not put into
 * React state. The model is shown headers and a handful of sample values
 * (`sampleColumns`); everything else stays on this device.
 *
 * Two layers, and the split matters:
 *
 * - a module-scoped `Map`, the fast path for the current tab
 * - IndexedDB behind it, so an attached file survives a page reload
 *
 * The reload case is not hypothetical. An import that fails for any reason
 * tends to end with the user refreshing — sometimes because the assistant
 * suggested it — and losing the parsed file at exactly that moment turns a
 * recoverable error into "attach the file again". The staged output of an
 * import already persists here (`values`, `relations`), so persisting its
 * input keeps the two halves consistent rather than introducing something new.
 *
 * The proposed mapping is stored alongside the table for the same reason: an
 * apply needs both, so restoring one without the other would still dead-end.
 */
import { db } from '~/core/database/indexeddb';

import type { ImportMapping } from './mapping-types';
import type { ParsedTable, SheetInfo } from './types';

export type ImportSession = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  table: ParsedTable;
  /**
   * The space the file was uploaded from — provenance, and the fallback target
   * when the chat is open outside a space. Not where the import must land: it
   * follows the user, and `mappedForSpaceId` is what guards against applying a
   * mapping built for somewhere else.
   */
  spaceId: string;
  delimiter?: string;
  sheetName?: string;
  sheets?: SheetInfo[];
  raggedRows: number;
};

/** Where a staged import's edits can be found again, to see whether they are still pending. */
export type StagedMarker = {
  at: number;
  spaceId: string;
  entityCount: number;
  /**
   * One value written by this import.
   *
   * Enough to answer "are these edits still sitting in the review panel?" —
   * publishing clears the local store, so if this value is still there the
   * import has not gone out yet. Cheaper and more honest than tracking every
   * id: one probe cannot go half-stale.
   */
  probe: { valueId: string; entityId: string } | null;
};

/** What actually goes on disk: the session, plus the mapping and an age for sweeping. */
export type StoredImportSession = ImportSession & {
  createdAt: number;
  mapping?: ImportMapping;
  /**
   * The space the stored mapping was computed against.
   *
   * Not the same as `spaceId`, and the difference is the point. A mapping is
   * built from one space's ontology — `typeSourceSpaces` lists that space
   * first, and its own properties outrank the canonical ones — so a mapping
   * made for Root is a different answer from the one the same file would get in
   * a space the user actually curates. Applying one into the other would
   * succeed and quietly link columns to the wrong properties, which is worse
   * than refusing.
   */
  mappedForSpaceId?: string;
  /**
   * Identifies the *file*, not the upload.
   *
   * Attaching the same spreadsheet twice makes two sessions with two ids, and
   * nothing connected them — so a second import of a file already staged and
   * unpublished quietly wrote everything again. Derived from the content, so a
   * renamed file still matches and an edited one correctly does not.
   */
  fingerprint?: string;
  staged?: StagedMarker;
};

/**
 * A cheap content hash of the parsed table.
 *
 * FNV-1a over headers and cells, folded in a fixed order. Not cryptographic and
 * does not need to be: the cost of a collision is one incorrect "you already
 * imported this" that the user can wave past, and the cost of a miss is the
 * duplicate we have today.
 */
export function fingerprintTable(table: ParsedTable): string {
  let hash = 0x811c9dc5;

  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // Separator, so ['ab','c'] and ['a','bc'] do not hash alike.
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193);
  };

  for (const header of table.headers) feed(header);
  for (const row of table.rows) for (const cell of row) feed(cell ?? '');

  return `${(hash >>> 0).toString(16)}-${table.headers.length}-${table.rows.length}`;
}

const sessions = new Map<string, StoredImportSession>();

/**
 * How long a persisted session is worth restoring.
 *
 * Long enough to survive a reload, a lunch break, or a tab restored the next
 * morning; short enough that a spreadsheet does not sit on disk indefinitely
 * because someone abandoned an import months ago.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Never let a failed write to disk break the in-memory path, which is what the tab is actually using. */
function ignore(err: unknown): void {
  console.error('[chat/import-session] persistence failed', err);
}

/**
 * How many distinct values the model sees per column.
 *
 * Five is enough to tell a URL column from a name column and to show the shape
 * of a date, and small enough that a 40-column file still costs well under a
 * thousand tokens. Distinct rather than the first five rows because a column
 * whose first rows repeat — a `Sector` that starts with five `Blockchain`s —
 * would otherwise show the model nothing about its range.
 */
export const SAMPLES_PER_COLUMN = 5;

export type ColumnSample = {
  index: number;
  header: string;
  samples: string[];
  /** Non-blank cells in this column. Lets the model see that a column is mostly empty. */
  filled: number;
};

/**
 * Headers plus a few distinct values per column — the only view of the file
 * that ever leaves the browser.
 */
export function sampleColumns(table: ParsedTable, perColumn: number = SAMPLES_PER_COLUMN): ColumnSample[] {
  return table.headers.map((header, index) => {
    const seen = new Set<string>();
    let filled = 0;

    for (const row of table.rows) {
      const cell = (row[index] ?? '').trim();
      if (cell === '') continue;
      filled++;
      if (seen.size < perColumn) seen.add(cell);
    }

    return { index, header, samples: [...seen], filled };
  });
}

export const ImportSessions = {
  set(session: ImportSession): void {
    const stored: StoredImportSession = {
      ...session,
      createdAt: Date.now(),
      fingerprint: fingerprintTable(session.table),
    };
    sessions.set(session.id, stored);
    // Fire-and-forget: the tab already has what it needs in memory, and
    // blocking an attach on a disk write would make the chip feel slow.
    db.importSessions.put(stored).catch(ignore);
  },

  /**
   * The session, from memory or from disk.
   *
   * Async because after a reload the Map is empty and the answer is on disk.
   * Callers are already async — the alternative, hydrating everything at mount,
   * races the first `applyImport` and fails exactly when a user retries fast.
   */
  async get(id: string): Promise<ImportSession | null> {
    const cached = sessions.get(id);
    if (cached) return cached;

    try {
      const stored = await db.importSessions.get(id);
      if (!stored) return null;
      if (Date.now() - stored.createdAt > SESSION_TTL_MS) {
        await db.importSessions.delete(id);
        return null;
      }
      sessions.set(id, stored);
      return stored;
    } catch (err) {
      ignore(err);
      return null;
    }
  },

  /** The mapping proposed for this import, and the space whose ontology produced it. */
  async getMapping(id: string): Promise<{ mapping: ImportMapping; spaceId: string | null } | null> {
    const session = (await ImportSessions.get(id)) as StoredImportSession | null;
    if (!session?.mapping) return null;
    return { mapping: session.mapping, spaceId: session.mappedForSpaceId ?? null };
  },

  /**
   * Store the mapping against its session, so an apply after a reload still has
   * both halves — and the space it was built for, so an apply from a different
   * space can be caught instead of silently honoured.
   */
  async setMapping(id: string, mapping: ImportMapping, mappedForSpaceId?: string): Promise<void> {
    const cached = sessions.get(id);
    if (cached) sessions.set(id, { ...cached, mapping, mappedForSpaceId });

    try {
      const stored = cached ?? (await db.importSessions.get(id));
      if (!stored) return;
      await db.importSessions.put({ ...stored, mapping, mappedForSpaceId });
    } catch (err) {
      ignore(err);
    }
  },

  /** Record that this import's edits were staged, so a re-import of the same file can be caught. */
  async markStaged(id: string, marker: StagedMarker): Promise<void> {
    const cached = sessions.get(id);
    if (cached) sessions.set(id, { ...cached, staged: marker });

    try {
      const stored = cached ?? (await db.importSessions.get(id));
      if (!stored) return;
      await db.importSessions.put({ ...stored, staged: marker });
    } catch (err) {
      ignore(err);
    }
  },

  /**
   * Earlier imports of this same file into this same space that were staged.
   *
   * Whether their edits are still *pending* is not answerable here — that lives
   * in the sync store — so this returns the markers and lets the caller probe.
   */
  async stagedMatches(fingerprint: string, spaceId: string, exceptId: string): Promise<StoredImportSession[]> {
    if (!fingerprint) return [];

    try {
      const matches = await db.importSessions.where('fingerprint').equals(fingerprint).toArray();
      return matches.filter(s => s.id !== exceptId && s.staged != null && s.staged.spaceId === spaceId);
    } catch (err) {
      ignore(err);
      return [];
    }
  },

  clear(id: string): void {
    sessions.delete(id);
    db.importSessions.delete(id).catch(ignore);
  },

  /** Ids present in this tab, newest last. */
  ids(): string[] {
    return [...sessions.keys()];
  },

  clearAll(): void {
    sessions.clear();
    db.importSessions.clear().catch(ignore);
  },

  /**
   * Forget what this tab is holding, keep what is on disk.
   *
   * What a page reload does. Distinct from `clear`/`clearAll`, which mean the
   * user is finished with the file and it should not come back.
   */
  clearMemory(): void {
    sessions.clear();
  },

  /**
   * Drop anything past its TTL. Cheap — `createdAt` is indexed, so this reads
   * only the rows it deletes.
   */
  async sweepExpired(now: number = Date.now()): Promise<number> {
    try {
      return await db.importSessions
        .where('createdAt')
        .below(now - SESSION_TTL_MS)
        .delete();
    } catch (err) {
      ignore(err);
      return 0;
    }
  },
};
