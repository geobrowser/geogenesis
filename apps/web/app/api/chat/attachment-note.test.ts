import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { attachmentInLastUserMessage, renderAttachmentNote } from './attachment-note';

const IMPORT_ID = '8f2c1d4e-9a3b-4c5d-8e7f-1a2b3c4d5e6f';

function userMessage(metadata?: unknown): UIMessage {
  return { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'import this' }], metadata } as UIMessage;
}

function assistantMessage(): UIMessage {
  return { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'sure' }] } as UIMessage;
}

const attachment = {
  importId: IMPORT_ID,
  fileName: 'projects.csv',
  rowCount: 340,
  headers: ['Name', 'URL', 'Founded'],
};

describe('attachmentInLastUserMessage', () => {
  it('finds an attachment on the latest user message', () => {
    expect(attachmentInLastUserMessage([userMessage({ attachment })])).toMatchObject({
      importId: IMPORT_ID,
      fileName: 'projects.csv',
      rowCount: 340,
    });
  });

  it('ignores an attachment from an earlier turn', () => {
    // Latest only. A file named three turns ago has already been proposed or
    // applied; re-announcing it invites a second import of the same rows.
    const messages = [userMessage({ attachment }), assistantMessage(), userMessage({ spaceId: 'x' })];

    expect(attachmentInLastUserMessage(messages)).toBeNull();
  });

  it('returns null when the latest user message carries no attachment', () => {
    expect(attachmentInLastUserMessage([userMessage({ spaceId: 'abc' })])).toBeNull();
    expect(attachmentInLastUserMessage([userMessage()])).toBeNull();
    expect(attachmentInLastUserMessage([])).toBeNull();
  });

  it('rejects a malformed importId rather than passing it to a tool', () => {
    expect(attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, importId: 'nope!' } })])).toBeNull();
    expect(attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, importId: 42 } })])).toBeNull();
  });

  it('rejects an attachment with no headers array', () => {
    expect(attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, headers: 'Name' } })])).toBeNull();
  });

  it('caps headers so a wide file cannot inflate the prompt', () => {
    const headers = Array.from({ length: 200 }, (_, i) => `col${i}`);

    const result = attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, headers } })]);

    expect(result?.headers).toHaveLength(60);
  });

  it('truncates an absurdly long header', () => {
    const result = attachmentInLastUserMessage([
      userMessage({ attachment: { ...attachment, headers: ['x'.repeat(1000)] } }),
    ]);

    expect(result?.headers[0].length).toBe(120);
  });

  it('drops non-string headers instead of rendering them as objects', () => {
    const result = attachmentInLastUserMessage([
      userMessage({ attachment: { ...attachment, headers: ['Name', { a: 1 }, 7] } }),
    ]);

    expect(result?.headers).toEqual(['Name']);
  });

  it('defaults a missing row count to zero rather than NaN', () => {
    const result = attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, rowCount: 'lots' } })]);

    expect(result?.rowCount).toBe(0);
  });
});

describe('renderAttachmentNote', () => {
  it('names the importId, the file and its columns', () => {
    const note = renderAttachmentNote({ ...attachment });

    expect(note).toContain(IMPORT_ID);
    expect(note).toContain('projects.csv');
    expect(note).toContain('"Founded"');
    expect(note).toContain('340 rows');
  });

  it('tells the model to wait for confirmation before applying', () => {
    // The staged-not-published decision only holds if the model asks first;
    // this sentence is where that is enforced at the point of use.
    const note = renderAttachmentNote({ ...attachment });

    expect(note).toContain('proposeImportMapping');
    expect(note).toContain('confirm');
    expect(note).toContain('applyImport');
  });

  it('says the rows are unreadable, so the model does not try to ask for them', () => {
    expect(renderAttachmentNote({ ...attachment })).toContain('cannot read them');
  });

  it('names the sheet when there is one', () => {
    expect(renderAttachmentNote({ ...attachment, sheetName: 'Projects' })).toContain('"Projects"');
  });
});
