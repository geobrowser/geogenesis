'use client';

import * as React from 'react';

import type { ImportSession } from '~/core/chat/import/session';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

export type AttachmentState =
  | { status: 'parsing'; fileName: string }
  | { status: 'ready'; session: ImportSession }
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

  const { session } = attachment;
  const columns = session.table.headers.length;
  const details = [
    `${session.table.rowCount.toLocaleString('en-US')} ${session.table.rowCount === 1 ? 'row' : 'rows'}`,
    `${columns} ${columns === 1 ? 'column' : 'columns'}`,
    session.sheetName ? `sheet “${session.sheetName}”` : null,
    formatSize(session.fileSizeBytes),
  ].filter(Boolean);

  return (
    <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-lg bg-grey-01 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-metadata font-medium text-text">{session.fileName}</p>
        <p className="truncate text-metadata text-grey-04">{details.join(' · ')}</p>
        {session.raggedRows > 0 ? (
          <p className="truncate text-metadata text-grey-04">
            {session.raggedRows} {session.raggedRows === 1 ? 'row was' : 'rows were'} padded to fit the header
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
