'use client';

/**
 * Owns the attached file: parse it in a Worker, hold the session, hand the
 * assistant a line of text naming it.
 *
 * Split out of the widget so the widget's diff stays a few lines — it is one of
 * the six files the geo-query branch also touches, and this feature's rule is
 * to add to those, never to restructure them.
 */
import * as React from 'react';

import type { AttachmentState } from '~/partials/chat/chat-attachment';

import { type ImportSession, ImportSessions } from './session';
import { MAX_FILE_SIZE_MB, type ParseResult } from './types';

/**
 * Parse off the main thread.
 *
 * The File object is transferred rather than its text: reading a 10mb
 * spreadsheet to a string on the UI thread janks the whole tab, and a
 * spreadsheet has no text form to read anyway.
 */
function parseInWorker(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ParseResult>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = error => {
      reject(new Error(error.message ?? 'Worker error'));
      worker.terminate();
    };
    worker.postMessage({ file });
  });
}

export function useFileAttachment(currentSpaceId: string | null) {
  const [attachment, setAttachment] = React.useState<AttachmentState | null>(null);
  // Bumped per attach so a slow parse can't overwrite a newer file's result.
  const generationRef = React.useRef(0);

  /** The user removed the file. Drop the parsed rows too — nothing will read them. */
  const remove = React.useCallback(() => {
    setAttachment(current => {
      if (current?.status === 'ready') ImportSessions.clear(current.session.id);
      return null;
    });
    generationRef.current++;
  }, []);

  /**
   * The file has been announced to the assistant. Take the chip away but keep
   * the session: `applyImport` reads it back by id, possibly several turns
   * later, after the user has looked at the mapping and said yes.
   *
   * Dropping the chip is also what stops the next message re-announcing the
   * same file and inviting a second import of it.
   */
  const dismiss = React.useCallback(() => {
    setAttachment(null);
  }, []);

  const attach = React.useCallback(
    async (file: File) => {
      if (!currentSpaceId) {
        setAttachment({
          status: 'error',
          fileName: file.name,
          message: 'Open a space first — an import needs somewhere to land.',
        });
        return;
      }

      const generation = ++generationRef.current;
      setAttachment({ status: 'parsing', fileName: file.name });

      let result: ParseResult;
      try {
        result = await parseInWorker(file);
      } catch (err) {
        console.error('[chat/import] parse failed', err);
        result = { ok: false, code: 'parse_failed', message: `Could not read that file (max ${MAX_FILE_SIZE_MB}mb).` };
      }

      // A newer file was picked while this one was parsing.
      if (generation !== generationRef.current) return;

      if (!result.ok) {
        setAttachment({ status: 'error', fileName: file.name, message: result.message });
        return;
      }

      const session: ImportSession = {
        id: crypto.randomUUID(),
        fileName: file.name,
        fileSizeBytes: file.size,
        table: result.table,
        // Where the file came from, not where it must go. The import maps
        // against and stages into whichever space the user is in when they run
        // it, so this is only the fallback for a chat opened outside a space —
        // pinning to it stranded files attached somewhere unwritable.
        spaceId: currentSpaceId,
        delimiter: result.delimiter,
        sheetName: result.sheetName,
        sheets: result.sheets,
        raggedRows: result.raggedRows,
      };

      ImportSessions.set(session);
      setAttachment({ status: 'ready', session });
    },
    [currentSpaceId]
  );

  /**
   * Stamped on the outgoing message. The route turns this into the note the
   * model reads — see `app/api/chat/attachment-note.ts`. Headers only; the rows
   * never leave this tab.
   */
  const metadata = React.useCallback(() => {
    if (attachment?.status !== 'ready') return {};
    const { session } = attachment;
    return {
      attachment: {
        importId: session.id,
        fileName: session.fileName,
        rowCount: session.table.rowCount,
        headers: session.table.headers,
        ...(session.sheetName ? { sheetName: session.sheetName } : {}),
      },
    };
  }, [attachment]);

  return { attachment, attach, remove, dismiss, metadata };
}
