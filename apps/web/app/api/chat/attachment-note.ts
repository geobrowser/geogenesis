import type { UIMessage } from 'ai';

/**
 * Tell the model a file is attached, without putting it in the user's message.
 *
 * Same mechanism as `space-switch-note.ts` and for the same reason:
 * `convertToModelMessages` drops `metadata`, so the widget stamps structured
 * data at send time and the note is rendered here. Appending the note client-
 * side would work too, but the user would then see `importId 9f2c…` inside
 * their own chat bubble.
 *
 * Rendering server-side also means the framing is ours. The headers are the
 * user's own text and reach the prompt either way; what they cannot do is
 * choose the sentence around them.
 */

const MAX_HEADERS = 60;
const MAX_HEADER_CHARS = 120;
const MAX_FILE_NAME_CHARS = 200;

export type AttachmentDescriptor = {
  importId: string;
  fileName: string;
  rowCount: number;
  headers: string[];
  sheetName?: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{16,64}$/i.test(value);
}

/**
 * The attachment stamped on the most recent user message, if any.
 *
 * Latest only: an attachment named three turns ago has already been proposed
 * or applied, and re-announcing it invites the model to import the same file
 * twice.
 */
export function attachmentInLastUserMessage(messages: ReadonlyArray<UIMessage>): AttachmentDescriptor | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;

    const raw = (message.metadata as { attachment?: unknown } | undefined)?.attachment;
    if (!raw || typeof raw !== 'object') return null;

    const attachment = raw as Record<string, unknown>;
    if (!isUuid(attachment.importId)) return null;
    if (typeof attachment.fileName !== 'string') return null;
    if (!Array.isArray(attachment.headers)) return null;

    return {
      importId: attachment.importId,
      fileName: attachment.fileName.slice(0, MAX_FILE_NAME_CHARS),
      rowCount:
        typeof attachment.rowCount === 'number' && attachment.rowCount >= 0 ? Math.floor(attachment.rowCount) : 0,
      headers: attachment.headers
        .filter((h): h is string => typeof h === 'string')
        .slice(0, MAX_HEADERS)
        .map(h => h.slice(0, MAX_HEADER_CHARS)),
      ...(typeof attachment.sheetName === 'string' ? { sheetName: attachment.sheetName.slice(0, 200) } : {}),
    };
  }

  return null;
}

export function renderAttachmentNote(attachment: AttachmentDescriptor): string {
  const sheet = attachment.sheetName ? `, sheet ${JSON.stringify(attachment.sheetName)}` : '';
  const headers = attachment.headers.map(h => JSON.stringify(h)).join(', ');

  return (
    `[Attached file] The user has attached ${JSON.stringify(attachment.fileName)}${sheet} — ` +
    `${attachment.rowCount} rows, columns: ${headers}. Its importId is \`${attachment.importId}\`. ` +
    `Call \`proposeImportMapping\` with that importId to work out how it maps onto this space, then show the ` +
    `user what you found and wait for them to confirm before calling \`applyImport\`. The rows stay in the ` +
    `user's browser — you cannot read them, and you do not need to.`
  );
}
