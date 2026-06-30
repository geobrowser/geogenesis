import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { describe, expect, it } from 'vitest';

import { GraphLinkExtension, MarkdownLinkExtension } from './graph-link-extension';
import { Web2URLExtension } from './web2-url-extension';

function makeEditor(content: JSONContent, editable: boolean) {
  return new Editor({
    extensions: [
      Document,
      Text,
      Paragraph,
      Web2URLExtension,
      GraphLinkExtension,
      MarkdownLinkExtension,
      Bold,
      Italic,
      Underline,
    ],
    content,
    editable,
  });
}

// Counts how many transactions the editor produces in a window with NO user
// input. After things settle there should be zero. A non-stop stream means the
// detection plugin is dispatching in an infinite loop — the flicker.
async function countTransactionsAfterSettle(editor: Editor, windowMs = 1200): Promise<number> {
  // Let initial detection passes run and settle.
  await new Promise(resolve => setTimeout(resolve, 600));

  let count = 0;
  const handler = () => {
    count++;
  };
  editor.on('transaction', handler);

  await new Promise(resolve => setTimeout(resolve, windowMs));
  editor.off('transaction', handler);
  return count;
}

const RAW_URL_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'check https://example.com here' }] }],
};

describe('web2URL detection — steady-state stability (no user input)', () => {
  it('does not loop in EDIT mode for a raw URL', async () => {
    const editor = makeEditor(RAW_URL_DOC, true);
    try {
      expect(await countTransactionsAfterSettle(editor)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it('does not loop in BROWSE mode for a raw URL', async () => {
    const editor = makeEditor(RAW_URL_DOC, false);
    try {
      expect(await countTransactionsAfterSettle(editor)).toBe(0);
    } finally {
      editor.destroy();
    }
  });
});
