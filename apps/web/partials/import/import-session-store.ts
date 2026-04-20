/**
 * Session-keyed store for parsed CSV import data.
 *
 * Lives outside React/Jotai so raw row data never enters React's
 * rendering pipeline. Keyed by importSessionId (not spaceId) so
 * concurrent imports in the same space don't collide.
 *
 * Source of truth for parsed import data. Jotai atoms hold only
 * lightweight UI snapshots (headers, rowCount) for reactivity.
 *
 * Designed with simple methods so backing storage could be swapped
 * to IndexedDB or a Web Worker later without changing consumers.
 */

export type SessionData = {
  headers: string[];
  rows: string[][]; // data rows only — no header, no empty rows
  rowCount: number;
};

const sessions = new Map<string, SessionData>();

const EMPTY: SessionData = Object.freeze({
  headers: Object.freeze([]) as unknown as string[],
  rows: Object.freeze([]) as unknown as string[][],
  rowCount: 0,
});

export const ImportSessionStore = {
  set(sessionId: string, data: SessionData): void {
    sessions.set(sessionId, data);
  },

  get(sessionId: string): SessionData {
    return sessions.get(sessionId) ?? EMPTY;
  },

  getRows(sessionId: string): string[][] {
    return (sessions.get(sessionId) ?? EMPTY).rows;
  },

  getHeaders(sessionId: string): string[] {
    return (sessions.get(sessionId) ?? EMPTY).headers;
  },

  getRowCount(sessionId: string): number {
    return (sessions.get(sessionId) ?? EMPTY).rowCount;
  },

  clear(sessionId: string): void {
    sessions.delete(sessionId);
  },

  removeColumns(sessionId: string, columnIndices: number[]): boolean {
    const data = sessions.get(sessionId);
    if (!data || columnIndices.length === 0) return false;
    const remove = new Set(
      columnIndices.filter(i => Number.isInteger(i) && i >= 0 && i < data.headers.length)
    );
    if (remove.size === 0) return false;

    const headerLen = data.headers.length;
    const headers = data.headers.filter((_, i) => !remove.has(i));
    const rows = data.rows.map(row => {
      const padded: string[] = [];
      for (let i = 0; i < headerLen; i++) {
        padded.push(row[i] ?? '');
      }
      return padded.filter((_, i) => !remove.has(i));
    });
    sessions.set(sessionId, {
      headers,
      rows,
      rowCount: rows.length,
    });
    return true;
  },
};
