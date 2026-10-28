'use client';

import * as React from 'react';

import type { ImageAttachment } from '~/core/chat/image-attachment';
import type { ImportSession } from '~/core/chat/import/session';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

export type AttachmentState =
  | { status: 'parsing'; fileName: string }
  | { status: 'ready'; session: ImportSession }
  | { status: 'image'; image: ImageAttachment; previewUrl: string }
  | { status: 'error'; fileName: string; message: string };

type Props = {
  attachment: AttachmentState;
  onRemove: () => void;
};

/**
 * The attached file, above the composer.
 *
 * Shows shape rather than contents — rows, columns, sheet — because that is
 * what tells the user the file was read the way they expected. A wrong
 * delimiter or the wrong sheet shows up here as an implausible column count,
 * before anything has been mapped or written.
 */
export function ChatAttachment({ attachment, onRemove }: Props) {
  if (attachment.status === 'parsing') {
    return (
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg bg-grey-01 px-3 py-2">
        <span className="truncate text-metadata text-grey-04">Reading {attachment.fileName}…</span>
        <button type="button" onClick={onRemove} aria-label="Cancel reading file" className="shrink-0 text-grey-03">
          Cancel
        </button>
      </div>
    );
  }

  if (attachment.status === 'error') {
    return (
      <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg bg-grey-01 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-metadata font-medium text-text">{attachment.fileName}</p>
          <p className="truncate text-metadata text-red-01">{attachment.message}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove attached file"
          className="shrink-0 text-grey-03 transition-colors hover:text-text"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  // An image shows itself. The thumbnail is the check that the right file was
  // picked, the way row and column counts are for a spreadsheet.
  if (attachment.status === 'image') {
    const { image, previewUrl } = attachment;
    return (
      <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg bg-grey-01 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <img src={previewUrl} alt="" className="size-8 shrink-0 rounded-sm object-cover" />
          <div className="min-w-0">
            <p className="truncate text-metadata font-medium text-text">{image.fileName}</p>
            <p className="truncate text-metadata text-grey-04">{formatSize(image.sizeBytes)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove attached image"
          className="shrink-0 text-grey-03 transition-colors hover:text-text"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  const { session } = attachment;
  const { sheets, skippedSheets } = session;
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.table.rowCount, 0);
  const raggedRows = sheets.reduce((sum, sheet) => sum + sheet.raggedRows, 0);
  const columns = sheets[0]?.table.headers.length ?? 0;
  const rowsLabel = `${totalRows.toLocaleString('en-US')} ${totalRows === 1 ? 'row' : 'rows'}`;
  const details =
    sheets.length > 1
      ? [`${sheets.length} tabs`, rowsLabel, formatSize(session.fileSizeBytes)]
      : [rowsLabel, `${columns} ${columns === 1 ? 'column' : 'columns'}`, formatSize(session.fileSizeBytes)];
  const tabLine =
    sheets.length > 1
      ? [
          ...sheets.slice(0, 4).map(sheet => `${sheet.name} ${sheet.table.rowCount.toLocaleString('en-US')}`),
          ...(sheets.length > 4 ? [`+${sheets.length - 4} more`] : []),
        ].join(' · ')
      : null;
  const skippedLine =
    skippedSheets.length > 0
      ? `Left out: ${skippedSheets.map(sheet => `“${sheet.name}” (${sheet.reason === 'notes' ? 'notes' : 'no data'})`).join(', ')}`
      : null;

  return (
    <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg bg-grey-01 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-metadata font-medium text-text">{session.fileName}</p>
        <p className="truncate text-metadata text-grey-04">{details.join(' · ')}</p>
        {tabLine ? <p className="truncate text-metadata text-grey-04">{tabLine}</p> : null}
        {skippedLine ? <p className="truncate text-metadata text-grey-04">{skippedLine}</p> : null}
        {raggedRows > 0 ? (
          <p className="truncate text-metadata text-grey-04">
            {raggedRows} {raggedRows === 1 ? 'row was' : 'rows were'} padded to fit the header
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attached file"
        className="shrink-0 text-grey-03 transition-colors hover:text-text"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
