import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { type AttachmentDescriptor, attachmentInLastUserMessage, renderAttachmentNote } from './attachment-note';

/** Narrows to the spreadsheet variant, and fails loudly if the reader picked the wrong one. */
function asTable(result: AttachmentDescriptor | null): Extract<AttachmentDescriptor, { kind: 'table' }> {
  if (result?.kind !== 'table') throw new Error(`expected a table attachment, got ${result?.kind ?? 'null'}`);
  return result;
}

const IMPORT_ID = '8f2c1d4e-9a3b-4c5d-8e7f-1a2b3c4d5e6f';

function userMessage(metadata?: unknown): UIMessage {
  return { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'import this' }], metadata } as UIMessage;
}

function assistantMessage(): UIMessage {
  return { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'sure' }] } as UIMessage;
}

const attachment = {
  kind: 'table' as const,
  importId: IMPORT_ID,
  fileName: 'projects.csv',
  rowCount: 340,
  headers: ['Name', 'URL', 'Founded'],
};

const IMAGE_ID = '3d9e7c2a-1b4f-4a6d-9c8e-5f0a1b2c3d4e';

const imageAttachment = {
  imageId: IMAGE_ID,
  fileName: 'cover.png',
  mimeType: 'image/png',
  sizeBytes: 240_000,
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

    expect(asTable(result).headers).toHaveLength(60);
  });

  it('truncates an absurdly long header', () => {
    const result = attachmentInLastUserMessage([
      userMessage({ attachment: { ...attachment, headers: ['x'.repeat(1000)] } }),
    ]);

    expect(asTable(result).headers[0].length).toBe(120);
  });

  it('drops non-string headers instead of rendering them as objects', () => {
    const result = attachmentInLastUserMessage([
      userMessage({ attachment: { ...attachment, headers: ['Name', { a: 1 }, 7] } }),
    ]);

    expect(asTable(result).headers).toEqual(['Name']);
  });

  it('defaults a missing row count to zero rather than NaN', () => {
    const result = attachmentInLastUserMessage([userMessage({ attachment: { ...attachment, rowCount: 'lots' } })]);

    expect(asTable(result).rowCount).toBe(0);
  });

  // An image and a spreadsheet arrive through the same control and the same
  // metadata slot, so the reader is what keeps them apart.
  it('reads an image attachment as its own kind', () => {
    expect(attachmentInLastUserMessage([userMessage({ attachment: imageAttachment })])).toEqual({
      kind: 'image',
      imageId: IMAGE_ID,
      fileName: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: 240_000,
    });
  });

  it('rejects a malformed imageId rather than passing it to setEntityImage', () => {
    expect(
      attachmentInLastUserMessage([userMessage({ attachment: { ...imageAttachment, imageId: 'nope!' } })])
    ).toBeNull();
  });

  it('does not mistake an image for a spreadsheet when headers are absent', () => {
    // The table branch requires an importId and a headers array; an image has
    // neither, so without its own branch it would read as null and the model
    // would never be told a picture was attached.
    const result = attachmentInLastUserMessage([userMessage({ attachment: imageAttachment })]);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('image');
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

  describe('for an attached image', () => {
    const note = () => renderAttachmentNote({ kind: 'image', ...imageAttachment });

    it('names the attachmentId and the tool that consumes it', () => {
      expect(note()).toContain(IMAGE_ID);
      expect(note()).toContain('cover.png');
      expect(note()).toContain('setEntityImage');
      expect(note()).toContain('attachmentId');
    });

    it('sends the model away from the importer', () => {
      // Both files arrive through the same control; without this the model has
      // been seen reaching for the mapping flow because that is what an
      // attachment has always meant.
      expect(note()).toContain('never call `proposeImportMapping`');
    });

    it('stops it searching the web for a picture it already has', () => {
      expect(note()).toContain('do NOT call `searchImages`');
    });

    it('says it cannot see the image, and to ask rather than guess', () => {
      // The upload is a permanent pin, so a wrong entity is not a free mistake.
      expect(note()).toContain('You cannot see it');
      expect(note()).toContain('ask them');
      expect(note()).toContain('permanent');
    });
  });
});
