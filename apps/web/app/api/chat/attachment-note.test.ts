import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { type AttachmentDescriptor, activeAttachment, renderAttachmentNote } from './attachment-note';

/** Narrows to the spreadsheet variant, and fails loudly if the reader picked the wrong one. */
function asTable(result: AttachmentDescriptor | null | undefined): Extract<AttachmentDescriptor, { kind: 'table' }> {
  if (result?.kind !== 'table') throw new Error(`expected a table attachment, got ${result?.kind ?? 'null'}`);
  return result;
}

const IMPORT_ID = '8f2c1d4e-9a3b-4c5d-8e7f-1a2b3c4d5e6f';
const IMAGE_ID = '3d9e7c2a-1b4f-4a6d-9c8e-5f0a1b2c3d4e';

let nextId = 0;

function userMessage(metadata?: unknown, text = 'import this'): UIMessage {
  return { id: `u${nextId++}`, role: 'user', parts: [{ type: 'text', text }], metadata } as UIMessage;
}

function assistantMessage(parts: unknown[] = [{ type: 'text', text: 'sure' }]): UIMessage {
  return { id: `a${nextId++}`, role: 'assistant', parts } as UIMessage;
}

function toolPart(type: string, input: unknown, output: unknown) {
  return { type, toolCallId: `call-${nextId++}`, state: 'output-available', input, output };
}

const stamped = {
  importId: IMPORT_ID,
  fileName: 'publishers.xlsx',
  sheets: [
    { name: 'Publishers', rowCount: 29, headers: ['Publisher', 'Country', 'Website'] },
    { name: 'Countries', rowCount: 12, headers: ['Country', 'Region'] },
  ],
  skippedSheets: [{ name: 'Instructions', reason: 'notes' }],
};

const singleTable = {
  importId: IMPORT_ID,
  fileName: 'projects.csv',
  sheets: [{ name: 'projects', rowCount: 340, headers: ['Name', 'URL', 'Founded'] }],
};

const imageAttachment = {
  imageId: IMAGE_ID,
  fileName: 'cover.png',
  mimeType: 'image/png',
  sizeBytes: 240_000,
};

describe('activeAttachment', () => {
  it('finds an attachment on the latest user message', () => {
    const result = activeAttachment([userMessage({ attachment: stamped })]);

    expect(result?.fromEarlierTurn).toBe(false);
    expect(asTable(result?.attachment)).toMatchObject({
      importId: IMPORT_ID,
      fileName: 'publishers.xlsx',
      sheets: [
        { name: 'Publishers', rowCount: 29, headers: ['Publisher', 'Country', 'Website'] },
        { name: 'Countries', rowCount: 12, headers: ['Country', 'Region'] },
      ],
      skippedSheets: [{ name: 'Instructions', reason: 'notes' }],
    });
  });

  it('keeps an attachment from an earlier turn until it is used', () => {
    // The conversation about a file spans turns — "skip the Topics tab", then
    // "ok import it". Announcing it once made the third message land on "I
    // don't have a file attached".
    const messages = [
      userMessage({ attachment: stamped }),
      assistantMessage(),
      userMessage({ spaceId: 'x' }, 'skip the Countries tab'),
    ];

    const result = activeAttachment(messages);

    expect(result?.fromEarlierTurn).toBe(true);
    expect(asTable(result?.attachment).importId).toBe(IMPORT_ID);
  });

  it('stops announcing a spreadsheet once applyImport has staged it', () => {
    // Re-announcing a staged file is how the same rows get imported twice.
    const messages = [
      userMessage({ attachment: stamped }),
      assistantMessage([toolPart('tool-applyImport', { importId: IMPORT_ID }, { staged: true, entityCount: 41 })]),
      userMessage({ spaceId: 'x' }, 'thanks'),
    ];

    expect(activeAttachment(messages)).toBeNull();
  });

  it('keeps the note through the turn in which the file is used', () => {
    // Mid-turn the executor's later steps still describe what it just did;
    // dropping the note the moment the tool returned made it write "I don't
    // see an attached image" right after setting the image.
    const messages = [
      userMessage({ attachment: imageAttachment }, 'set this as my cover'),
      assistantMessage([toolPart('tool-setEntityImage', { attachmentId: IMAGE_ID }, { ok: true })]),
    ];

    expect(activeAttachment(messages)?.fromEarlierTurn).toBe(false);
  });

  it('keeps announcing a spreadsheet whose apply failed', () => {
    const messages = [
      userMessage({ attachment: stamped }),
      assistantMessage([toolPart('tool-applyImport', { importId: IMPORT_ID }, { error: 'space_changed' })]),
      userMessage({ spaceId: 'x' }, 'try again in my space'),
    ];

    expect(activeAttachment(messages)?.fromEarlierTurn).toBe(true);
  });

  it('does not let an apply of a different file consume this one', () => {
    const messages = [
      userMessage({ attachment: stamped }),
      assistantMessage([toolPart('tool-applyImport', { importId: 'other-id-1234567890' }, { staged: true })]),
      userMessage({ spaceId: 'x' }),
    ];

    expect(activeAttachment(messages)).not.toBeNull();
  });

  it('stops announcing an image once setEntityImage has used it', () => {
    const messages = [
      userMessage({ attachment: imageAttachment }),
      assistantMessage([toolPart('tool-setEntityImage', { attachmentId: IMAGE_ID }, { ok: true })]),
      userMessage({ spaceId: 'x' }),
    ];

    expect(activeAttachment(messages)).toBeNull();
  });

  it('keeps announcing an image the model only asked about', () => {
    // Armando's transcript: attach, "avatar or cover?", "cover" — and on that
    // third message the id was gone.
    const messages = [
      userMessage({ attachment: imageAttachment }, 'upload this to my space'),
      assistantMessage([
        toolPart('tool-getEntity', { entityId: 'e' }, { id: 'e' }),
        { type: 'text', text: 'Avatar or cover?' },
      ]),
      userMessage({ spaceId: 'x' }, 'cover'),
    ];

    const result = activeAttachment(messages);

    expect(result?.fromEarlierTurn).toBe(true);
    expect(result?.attachment.kind).toBe('image');
  });

  it('takes the newest attachment when there are several', () => {
    const messages = [
      userMessage({ attachment: singleTable }),
      assistantMessage(),
      userMessage({ attachment: { ...stamped, importId: '11111111-2222-4333-8444-555555555555' } }),
    ];

    expect(asTable(activeAttachment(messages)?.attachment).importId).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('returns null when nothing was ever attached', () => {
    expect(activeAttachment([userMessage({ spaceId: 'abc' })])).toBeNull();
    expect(activeAttachment([userMessage()])).toBeNull();
    expect(activeAttachment([])).toBeNull();
  });

  it('reads the shape stamped before a file was a set of tabs', () => {
    const result = activeAttachment([
      userMessage({
        attachment: {
          importId: IMPORT_ID,
          fileName: 'projects.xlsx',
          rowCount: 340,
          headers: ['Name'],
          sheetName: 'Projects',
        },
      }),
    ]);

    expect(asTable(result?.attachment).sheets).toEqual([{ name: 'Projects', rowCount: 340, headers: ['Name'] }]);
  });

  it('rejects a malformed importId rather than passing it to a tool', () => {
    expect(activeAttachment([userMessage({ attachment: { ...singleTable, importId: 'nope!' } })])).toBeNull();
    expect(activeAttachment([userMessage({ attachment: { ...singleTable, importId: 42 } })])).toBeNull();
  });

  it('rejects a tab with no headers array', () => {
    expect(
      activeAttachment([
        userMessage({ attachment: { ...singleTable, sheets: [{ name: 'x', rowCount: 1, headers: 'Name' }] } }),
      ])
    ).toBeNull();
  });

  it('caps headers so a wide file cannot inflate the prompt', () => {
    const headers = Array.from({ length: 200 }, (_, i) => `col${i}`);

    const result = activeAttachment([
      userMessage({ attachment: { ...singleTable, sheets: [{ name: 'x', rowCount: 1, headers }] } }),
    ]);

    expect(asTable(result?.attachment).sheets[0].headers).toHaveLength(60);
  });

  it('caps tabs so a workbook of hundreds cannot inflate the prompt', () => {
    const sheets = Array.from({ length: 80 }, (_, i) => ({ name: `tab${i}`, rowCount: 1, headers: ['Name'] }));

    const result = activeAttachment([userMessage({ attachment: { ...singleTable, sheets } })]);

    expect(asTable(result?.attachment).sheets).toHaveLength(20);
  });

  it('truncates an absurdly long header', () => {
    const result = activeAttachment([
      userMessage({
        attachment: { ...singleTable, sheets: [{ name: 'x', rowCount: 1, headers: ['x'.repeat(1000)] }] },
      }),
    ]);

    expect(asTable(result?.attachment).sheets[0].headers[0].length).toBe(120);
  });

  it('drops non-string headers instead of rendering them as objects', () => {
    const result = activeAttachment([
      userMessage({
        attachment: { ...singleTable, sheets: [{ name: 'x', rowCount: 1, headers: ['Name', { a: 1 }, 7] }] },
      }),
    ]);

    expect(asTable(result?.attachment).sheets[0].headers).toEqual(['Name']);
  });

  it('defaults a missing row count to zero rather than NaN', () => {
    const result = activeAttachment([
      userMessage({ attachment: { ...singleTable, sheets: [{ name: 'x', rowCount: 'lots', headers: ['Name'] }] } }),
    ]);

    expect(asTable(result?.attachment).sheets[0].rowCount).toBe(0);
  });

  // An image and a spreadsheet arrive through the same control and the same
  // metadata slot, so the reader is what keeps them apart.
  it('reads an image attachment as its own kind', () => {
    expect(activeAttachment([userMessage({ attachment: imageAttachment })])?.attachment).toEqual({
      kind: 'image',
      imageId: IMAGE_ID,
      fileName: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: 240_000,
    });
  });

  it('rejects a malformed imageId rather than passing it to setEntityImage', () => {
    expect(activeAttachment([userMessage({ attachment: { ...imageAttachment, imageId: 'nope!' } })])).toBeNull();
  });
});

describe('renderAttachmentNote', () => {
  const table = asTable(activeAttachment([userMessage({ attachment: stamped })])?.attachment);
  const single = asTable(activeAttachment([userMessage({ attachment: singleTable })])?.attachment);

  it('names the importId, the file and every tab with its columns', () => {
    const note = renderAttachmentNote(table);

    expect(note).toContain(IMPORT_ID);
    expect(note).toContain('publishers.xlsx');
    expect(note).toContain('(2 tabs)');
    expect(note).toContain('"Publishers" — 29 rows');
    expect(note).toContain('"Countries" — 12 rows');
    expect(note).toContain('"Region"');
  });

  it('names the tabs that were left out and why', () => {
    expect(renderAttachmentNote(table)).toContain('"Instructions" (notes)');
  });

  it('describes a one-table file without talking about tabs', () => {
    const note = renderAttachmentNote(single);

    expect(note).toContain('340 rows');
    expect(note).toContain('"Founded"');
    expect(note).not.toContain('tabs');
  });

  it('tells the model to wait for confirmation before applying', () => {
    // The staged-not-published decision only holds if the model asks first;
    // this sentence is where that is enforced at the point of use.
    const note = renderAttachmentNote(table);

    expect(note).toContain('proposeImportMapping');
    expect(note).toContain('confirm');
    expect(note).toContain('applyImport');
  });

  it('tells the model how corrections travel', () => {
    const note = renderAttachmentNote(table);

    expect(note).toContain('excludeSheets');
    expect(note).toContain('hint');
  });

  it('says the rows are unreadable, so the model does not try to ask for them', () => {
    expect(renderAttachmentNote(table)).toContain('cannot read them');
  });

  it('says an earlier attachment is still here and must not be asked for again', () => {
    const note = renderAttachmentNote(table, true);

    expect(note).toContain('Earlier in this conversation');
    expect(note).toContain('still attached');
    expect(note).toContain('do not ask them to attach it again');
    expect(note).toContain(IMPORT_ID);
  });

  describe('for an attached image', () => {
    const note = (fromEarlierTurn = false) =>
      renderAttachmentNote({ kind: 'image', ...imageAttachment }, fromEarlierTurn);

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

    it('says an earlier image is still attached', () => {
      expect(note(true)).toContain('still attached');
      expect(note(true)).toContain(IMAGE_ID);
    });
  });
});
