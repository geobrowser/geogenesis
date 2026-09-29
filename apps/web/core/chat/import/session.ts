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
 * The proposed mappings are stored alongside the tables for the same reason: an
 * apply needs both, so restoring one without the other would still dead-end.
 */
import { db } from '~/core/database/indexeddb';

import type { ImportMapping } from './mapping-types';
import type { ParsedSheet, ParsedTable, SkippedSheet } from './types';

export type ImportSheet = ParsedSheet;

export type ImportSession = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  /** One per tab that holds a table; a delimited file has exactly one. */
  sheets: ImportSheet[];
  skippedSheets: SkippedSheet[];
  /**
   * The space the file was uploaded from — provenance, and the fallback target
   * when the chat is open outside a space. Not where the import must land: it
   * follows the user, and `mappedForSpaceId` is what guards against applying a
   * mapping built for somewhere else.
   */
  spaceId: string;
  delimiter?: string;
};

/** Where a staged import's edits can be found again, to see whether they are still pending. */
export type StagedMarker = {
  at: number;
  spaceId: string;
  entityCount: number;
  /** Legacy sessions carry one probe; new sessions track all value and relation ids. */
  probe: { valueId: string; entityId: string } | null;
  values?: { valueId: string; entityId: string }[];
  relations?: { relationId: string; entityId: string }[];
};

/** The proposed mapping for each tab, keyed by tab name. */
export type SheetMappings = Record<string, ImportMapping>;

export type StoredMapping = {
  mappings: SheetMappings;
  /**
   * The space the mappings were computed against.
   *
   * Not the same as `spaceId`, and the difference is the point. A mapping is
   * built from one space's ontology — `typeSourceSpaces` lists that space
   * first, and its own properties outrank the canonical ones — so a mapping
   * made for Root is a different answer from the one the same file would get in
   * a space the user actually curates. Applying one into the other would
   * succeed and quietly link columns to the wrong properties, which is worse
   * than refusing.
   */
  mappedForSpaceId: string | null;
  /** Tabs the user asked to leave out of the import. */
  excludedSheets: string[];
};

/** What actually goes on disk: the session, plus the mappings and an age for sweeping. */
export type StoredImportSession = ImportSession & {
  createdAt: number;
  mappings?: SheetMappings;
  mappedForSpaceId?: string;
  excludedSheets?: string[];
  /**
   * Identifies the *file*, not the upload.
   *
   * Attaching the same spreadsheet twice makes two sessions with two ids, and
   * nothing connected them — so a second import of a file already staged and
   * unpublished quietly wrote everything again. Derived from the tab names
   * and content, so edited data gets a different fingerprint.
   */
  fingerprint?: string;
  staged?: StagedMarker;
};

/** Rows written before a session held several tabs. Read once, then rewritten in the current shape. */
type LegacyStoredImportSession = Omit<StoredImportSession, 'sheets' | 'skippedSheets'> & {
  sheets?: ImportSheet[];
  skippedSheets?: SkippedSheet[];
  table?: ParsedTable;
  sheetName?: string;
  raggedRows?: number;
  mapping?: ImportMapping;
};

function fromStored(raw: LegacyStoredImportSession): StoredImportSession {
  if (raw.sheets) return { ...raw, sheets: raw.sheets, skippedSheets: raw.skippedSheets ?? [] };

  const { table, sheetName, raggedRows, mapping, ...rest } = raw;
  const name = sheetName ?? raw.fileName;
  return {
    ...rest,
    sheets: table ? [{ name, table, raggedRows: raggedRows ?? 0, skippedLeadingRows: 0 }] : [],
    skippedSheets: [],
    ...(mapping ? { mappings: { [name]: mapping } } : {}),
  };
}

/**
 * A cheap content hash of one table.
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

/** The whole file: every tab's name and content, in order. */
export function fingerprintSheets(sheets: ReadonlyArray<{ name: string; table: ParsedTable }>): string {
  return sheets.map(sheet => `${sheet.name}=${fingerprintTable(sheet.table)}`).join('|');
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
      fingerprint: fingerprintSheets(session.sheets),
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
    if (cached && Date.now() - cached.createdAt <= SESSION_TTL_MS) return cached;
    if (cached) sessions.delete(id);

    try {
      const raw = (await db.importSessions.get(id)) as LegacyStoredImportSession | undefined;
      if (!raw) return null;
      if (Date.now() - raw.createdAt > SESSION_TTL_MS) {
        await db.importSessions.delete(id);
        return null;
      }
      const stored = fromStored(raw);
      sessions.set(id, stored);
      return stored;
    } catch (err) {
      ignore(err);
      return null;
    }
  },

  /** The mappings proposed for this import, and the space whose ontology produced them. */
  async getMapping(id: string): Promise<StoredMapping | null> {
    const session = (await ImportSessions.get(id)) as StoredImportSession | null;
    if (!session?.mappings || Object.keys(session.mappings).length === 0) return null;
    return {
      mappings: session.mappings,
      mappedForSpaceId: session.mappedForSpaceId ?? null,
      excludedSheets: session.excludedSheets ?? [],
    };
  },

  /**
   * Store the mappings against their session, so an apply after a reload still
   * has both halves — and the space they were built for, so an apply from a
   * different space can be caught instead of silently honoured.
   */
  async setMapping(id: string, mapping: StoredMapping): Promise<void> {
    const patch = {
      mappings: mapping.mappings,
      mappedForSpaceId: mapping.mappedForSpaceId ?? undefined,
      excludedSheets: mapping.excludedSheets,
    };
    const cached = sessions.get(id);
    if (cached) sessions.set(id, { ...cached, ...patch });

    try {
      const stored = cached ?? (await db.importSessions.get(id));
      if (!stored) return;
      await db.importSessions.put({ ...stored, ...patch });
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
  async stagedMatches(fingerprint: string, spaceId: string): Promise<StoredImportSession[]> {
    if (!fingerprint) return [];
    const matches = new Map<string, StoredImportSession>();
    try {
      for (const stored of await db.importSessions.where('fingerprint').equals(fingerprint).toArray()) {
        matches.set(stored.id, stored);
      }
    } catch (err) {
      ignore(err);
    }
    // Memory contains the latest commit marker even if IndexedDB is unavailable.
    for (const stored of sessions.values()) if (stored.fingerprint === fingerprint) matches.set(stored.id, stored);
    return [...matches.values()].filter(
      s => s.staged?.spaceId === spaceId && Date.now() - s.createdAt <= SESSION_TTL_MS
    );
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
