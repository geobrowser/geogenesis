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

import { type ImageAttachment, ImageAttachments, isAcceptedImage, looksLikeImage } from '~/core/chat/image-attachment';

import type { AttachmentState } from '~/partials/chat/chat-attachment';

import { type ImportSession, ImportSessions } from './session';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, type ParseResult } from './types';

/**
 * Parse off the main thread.
 *
 * The File object is transferred rather than its text: reading a 10mb
 * spreadsheet to a string on the UI thread janks the whole tab, and a
 * spreadsheet has no text form to read anyway.
 */
function parseInWorker(file: File, signal: AbortSignal): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Reading this file took too long. Try splitting it into smaller files.'));
    }, 60_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<ParseResult>) => {
      cleanup();
      resolve(event.data);
    };
    worker.onerror = error => {
      cleanup();
      reject(new Error(error.message || 'Could not read this file.'));
    };
    try {
      worker.postMessage({ file });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function useFileAttachment(currentSpaceId: string | null) {
  const [attachment, setAttachment] = React.useState<AttachmentState | null>(null);
  // Bumped per attach so a slow parse can't overwrite a newer file's result.
  const generationRef = React.useRef(0);
  const parseController = React.useRef<AbortController | null>(null);
  React.useEffect(
    () => () => {
      generationRef.current++;
      parseController.current?.abort();
    },
    []
  );

  /** The user removed the file. Drop the parsed rows too — nothing will read them. */
  const remove = React.useCallback(() => {
    parseController.current?.abort();
    setAttachment(current => {
      if (current?.status === 'ready') ImportSessions.clear(current.session.id);
      if (current?.status === 'image') {
        ImageAttachments.clear(current.image.id);
        URL.revokeObjectURL(current.previewUrl);
      }
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
    generationRef.current++;
    parseController.current?.abort();
    setAttachment(current => {
      // The chip goes; the file stays, because `setEntityImage` may not run
      // until the assistant has asked which entity it belongs to. Only the
      // preview is finished with.
      if (current?.status === 'image') URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }, []);

  const attach = React.useCallback(
    async (file: File) => {
      remove();
      if (!currentSpaceId) {
        setAttachment({
          status: 'error',
          fileName: file.name,
          message: 'Open a space first — an attachment needs somewhere to land.',
        });
        return;
      }

      // Images take the other lane entirely: nothing to parse, nothing to map.
      // The file is held for `setEntityImage` to pick up by id.
      if (looksLikeImage(file)) {
        const generation = ++generationRef.current;
        if (!isAcceptedImage(file)) {
          setAttachment({
            status: 'error',
            fileName: file.name,
            message: 'That image format is not supported — use JPG, PNG, WebP, GIF or AVIF.',
          });
          return;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setAttachment({
            status: 'error',
            fileName: file.name,
            message: `That image is too large (max ${MAX_FILE_SIZE_MB}mb).`,
          });
          return;
        }
        if (generation !== generationRef.current) return;

        const image: ImageAttachment = {
          id: crypto.randomUUID(),
          file,
          fileName: file.name,
          mimeType: file.type.split(';')[0].trim().toLowerCase(),
          sizeBytes: file.size,
        };
        ImageAttachments.set(image);
        setAttachment({ status: 'image', image, previewUrl: URL.createObjectURL(file) });
        return;
      }

      const generation = ++generationRef.current;
      setAttachment({ status: 'parsing', fileName: file.name });

      let result: ParseResult;
      try {
        const controller = new AbortController();
        parseController.current = controller;
        result = await parseInWorker(file, controller.signal);
      } catch (err) {
        if (generation !== generationRef.current) return;
        console.error('[chat/import] parse failed', err);
        result = {
          ok: false,
          code: 'parse_failed',
          message: err instanceof Error ? err.message : 'Could not read that file.',
        };
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
        sheets: result.sheets,
        skippedSheets: result.skippedSheets,
        // Where the file came from, not where it must go. The import maps
        // against and stages into whichever space the user is in when they run
        // it, so this is only the fallback for a chat opened outside a space —
        // pinning to it stranded files attached somewhere unwritable.
        spaceId: currentSpaceId,
        delimiter: result.delimiter,
      };

      ImportSessions.set(session);
      setAttachment({ status: 'ready', session });
    },
    [currentSpaceId, remove]
  );

  /**
   * Stamped on the outgoing message. The route turns this into the note the
   * model reads — see `app/api/chat/attachment-note.ts`. Headers only; the rows
   * never leave this tab.
   */
  const metadata = React.useCallback(() => {
    if (attachment?.status === 'image') {
      const { image } = attachment;
      // No dimensions and no pixels — the model decides where an image goes from
      // the user's words, not from the picture.
      return {
        attachment: {
          imageId: image.id,
          fileName: image.fileName,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
        },
      };
    }
    if (attachment?.status !== 'ready') return {};
    const { session } = attachment;
    return {
      attachment: {
        importId: session.id,
        fileName: session.fileName,
        sheets: session.sheets.map(sheet => ({
          name: sheet.name,
          rowCount: sheet.table.rowCount,
          headers: sheet.table.headers,
        })),
        ...(session.skippedSheets.length > 0
          ? { skippedSheets: session.skippedSheets.map(sheet => ({ name: sheet.name, reason: sheet.reason })) }
          : {}),
      },
    };
  }, [attachment]);

  return { attachment, attach, remove, dismiss, metadata };
}
