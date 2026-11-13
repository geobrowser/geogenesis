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
 *
 * The note is rendered on every turn until the file is used, not only on the
 * turn it arrived. The stamp lives on one user message, but the conversation
 * about the file spans many — "skip the Topics tab", "Owner should be a
 * relation", "ok import it" — and a model that only hears about the file once
 * answers the third of those with "I don't have a file attached".
 */

const MAX_SHEETS = 20;
const MAX_HEADERS = 60;
const MAX_HEADER_CHARS = 120;
const MAX_FILE_NAME_CHARS = 200;
const MAX_SHEET_NAME_CHARS = 200;

export type AttachmentSheet = {
  name: string;
  rowCount: number;
  headers: string[];
};

export type AttachmentDescriptor =
  | {
      kind: 'table';
      importId: string;
      fileName: string;
      sheets: AttachmentSheet[];
      skippedSheets: { name: string; reason: string }[];
    }
  | {
      kind: 'image';
      imageId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };

export type ActiveAttachment = {
  attachment: AttachmentDescriptor;
  /** True when the file arrived on an earlier turn, not the message being answered. */
  fromEarlierTurn: boolean;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{16,64}$/i.test(value);
}

function readHeaders(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((h): h is string => typeof h === 'string')
    .slice(0, MAX_HEADERS)
    .map(h => h.slice(0, MAX_HEADER_CHARS));
}

function readRowCount(raw: unknown): number {
  return typeof raw === 'number' && raw >= 0 ? Math.floor(raw) : 0;
}

function readSheets(attachment: Record<string, unknown>): AttachmentSheet[] | null {
  if (Array.isArray(attachment.sheets)) {
    const sheets: AttachmentSheet[] = [];
    for (const entry of attachment.sheets.slice(0, MAX_SHEETS)) {
      if (!entry || typeof entry !== 'object') return null;
      const sheet = entry as Record<string, unknown>;
      const headers = readHeaders(sheet.headers);
      if (typeof sheet.name !== 'string' || !headers) return null;
      sheets.push({ name: sheet.name.slice(0, MAX_SHEET_NAME_CHARS), rowCount: readRowCount(sheet.rowCount), headers });
    }
    return sheets.length > 0 ? sheets : null;
  }

  // Stamped before a file was a set of tabs: one table at the top level.
  const headers = readHeaders(attachment.headers);
  if (!headers) return null;
  const name =
    typeof attachment.sheetName === 'string'
      ? attachment.sheetName.slice(0, MAX_SHEET_NAME_CHARS)
      : String(attachment.fileName).slice(0, MAX_SHEET_NAME_CHARS);
  return [{ name, rowCount: readRowCount(attachment.rowCount), headers }];
}

function readAttachment(raw: unknown): AttachmentDescriptor | null {
  if (!raw || typeof raw !== 'object') return null;
  const attachment = raw as Record<string, unknown>;
  if (typeof attachment.fileName !== 'string') return null;
  const fileName = attachment.fileName.slice(0, MAX_FILE_NAME_CHARS);

  // An image carries no rows or headers — it is identified by `imageId` and
  // reaches the graph through `setEntityImage`, never through the importer.
  if (isUuid(attachment.imageId)) {
    if (typeof attachment.mimeType !== 'string') return null;
    return {
      kind: 'image',
      imageId: attachment.imageId,
      fileName,
      mimeType: attachment.mimeType.slice(0, 100),
      sizeBytes: readRowCount(attachment.sizeBytes),
    };
  }

  if (!isUuid(attachment.importId)) return null;
  const sheets = readSheets(attachment);
  if (!sheets) return null;

  const skippedSheets: { name: string; reason: string }[] = [];
  if (Array.isArray(attachment.skippedSheets)) {
    for (const entry of attachment.skippedSheets.slice(0, MAX_SHEETS)) {
      if (!entry || typeof entry !== 'object') continue;
      const sheet = entry as Record<string, unknown>;
      if (typeof sheet.name !== 'string') continue;
      skippedSheets.push({
        name: sheet.name.slice(0, MAX_SHEET_NAME_CHARS),
        reason: typeof sheet.reason === 'string' ? sheet.reason.slice(0, 40) : 'no data',
      });
    }
  }

  return { kind: 'table', importId: attachment.importId, fileName, sheets, skippedSheets };
}

type ToolPartLike = {
  type?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
};

/**
 * Whether a tool call in a finished turn already did what the attachment was
 * for. Only turns before `until` count: within the turn that consumes the
 * file, the executor's later steps still need the note to describe what it
 * just did.
 */
function consumedBy(
  messages: ReadonlyArray<UIMessage>,
  from: number,
  until: number,
  attachment: AttachmentDescriptor
): boolean {
  for (let i = from + 1; i < until; i++) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    for (const part of message.parts as ToolPartLike[]) {
      if (part.state !== 'output-available') continue;
      const input = (part.input ?? {}) as Record<string, unknown>;
      const output = (part.output ?? {}) as Record<string, unknown>;
      if (attachment.kind === 'table') {
        if (part.type === 'tool-applyImport' && input.importId === attachment.importId && output.staged === true) {
          return true;
        }
      } else if (
        part.type === 'tool-setEntityImage' &&
        input.attachmentId === attachment.imageId &&
        output.ok === true
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The attachment the conversation is still about, if any.
 *
 * The most recently attached file, unless a later tool call has already
 * consumed it — an image that has been set, a spreadsheet that has been
 * staged. A consumed file is not re-announced, because announcing it again is
 * how the same rows get imported twice.
 */
export function activeAttachment(messages: ReadonlyArray<UIMessage>): ActiveAttachment | null {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return null;

  for (let i = lastUserIndex; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;

    const raw = (message.metadata as { attachment?: unknown } | undefined)?.attachment;
    if (raw === undefined) continue;

    const attachment = readAttachment(raw);
    if (!attachment) return null;
    if (consumedBy(messages, i, lastUserIndex, attachment)) return null;
    return { attachment, fromEarlierTurn: i !== lastUserIndex };
  }

  return null;
}

function describeSheet(sheet: AttachmentSheet): string {
  const headers = sheet.headers.map(h => JSON.stringify(h)).join(', ');
  return `${JSON.stringify(sheet.name)} — ${sheet.rowCount} rows, columns: ${headers}`;
}

export function renderAttachmentNote(attachment: AttachmentDescriptor, fromEarlierTurn: boolean = false): string {
  if (attachment.kind === 'image') {
    const opening = fromEarlierTurn
      ? `[Attached image] Earlier in this conversation the user attached ${JSON.stringify(attachment.fileName)} (${attachment.mimeType}), and it is still attached — do not ask them to attach it again. `
      : `[Attached image] The user has attached ${JSON.stringify(attachment.fileName)} (${attachment.mimeType}). `;
    return (
      opening +
      `Its attachmentId is \`${attachment.imageId}\`. To put it on an entity, call ` +
      `\`setEntityImage({ entityId, propertyId, spaceId, attachmentId })\` with that id — pass \`attachmentId\` ` +
      `instead of \`sourceUrl\`, and do NOT call \`searchImages\`, the user has already given you the picture. ` +
      `You cannot see it: decide which entity and which image property it belongs to from what the user says, ` +
      `and ask them if that is not clear rather than guessing — the upload is permanent. This is not a ` +
      `spreadsheet; never call \`proposeImportMapping\` or \`applyImport\` for it.`
    );
  }

  const tabs = attachment.sheets.length;
  const opening = fromEarlierTurn
    ? `[Attached file] Earlier in this conversation the user attached ${JSON.stringify(attachment.fileName)}` +
      `${tabs > 1 ? ` (${tabs} tabs)` : ''}, and it is still attached — do not ask them to attach it again, and ` +
      `never say you do not have the file. `
    : `[Attached file] The user has attached ${JSON.stringify(attachment.fileName)}${tabs > 1 ? ` (${tabs} tabs)` : ''}. `;

  const shape =
    tabs > 1
      ? `Tabs: ${attachment.sheets.map(describeSheet).join('; ')}. `
      : `${attachment.sheets[0].rowCount} rows, columns: ${attachment.sheets[0].headers.map(h => JSON.stringify(h)).join(', ')}. `;

  const skipped =
    attachment.skippedSheets.length > 0
      ? `Left out at parse time because they hold no table: ${attachment.skippedSheets
          .map(s => `${JSON.stringify(s.name)} (${s.reason})`)
          .join(', ')}. `
      : '';

  return (
    opening +
    shape +
    skipped +
    `Its importId is \`${attachment.importId}\`. ` +
    `Call \`proposeImportMapping\` with that importId to work out how ${tabs > 1 ? 'every tab maps' : 'it maps'} onto ` +
    `the space (one call covers ${tabs > 1 ? 'all tabs' : 'the file'}), then show the user what you found` +
    `${tabs > 1 ? ', tab by tab,' : ''} and wait for them to confirm before calling \`applyImport\`. ` +
    `Changes they ask for — leaving a tab out, a different type or property — go back through ` +
    `\`proposeImportMapping\` (\`excludeSheets\`, or \`hint\` with \`sheet\`), against this same importId. ` +
    `The rows stay in the user's browser — you cannot read them, and you do not need to.`
  );
}
