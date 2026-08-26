import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Editor } from '@tiptap/react';

import { afterEach, describe, expect, it } from 'vitest';

import { createIdExtension, ensureUniqueNodeIds } from './id-extension';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('ensureUniqueNodeIds', () => {
  it('assigns IDs to missing and duplicate nodes before drag persistence', () => {
    editor = new Editor({
      extensions: [Document, Paragraph, Text, createIdExtension('space-id')],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: 'existing-id' } },
          { type: 'paragraph', attrs: { id: 'existing-id' } },
          { type: 'paragraph', attrs: { id: null } },
        ],
      },
    });

    expect(ensureUniqueNodeIds(editor)).toBe(2);

    const ids = Array.from({ length: editor.state.doc.childCount }, (_, index) =>
      String(editor?.state.doc.child(index).attrs.id)
    );
    expect(ids[0]).toBe('existing-id');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('null');
    expect(ensureUniqueNodeIds(editor)).toBe(0);
  });
});
