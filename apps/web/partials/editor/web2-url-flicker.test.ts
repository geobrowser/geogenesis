import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';

import { describe, expect, it } from 'vitest';

import { normalizeEditorContent } from './normalize-editor-content';
import { Web2URLExtension } from './web2-url-extension';

// Walks an editor JSON doc and reports whether any text node carries a web2URL mark.
function hasWeb2Mark(node: JSONContent): boolean {
  if (node.marks?.some(mark => mark.type === 'web2URL')) return true;
  return (node.content ?? []).some(hasWeb2Mark);
}

async function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return predicate();
}

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [Document, Paragraph, Text, Link.configure({ openOnClick: false }), Web2URLExtension],
    content,
    editable: false, // BROWSE MODE
  });
}

describe('web2URL flicker root cause', () => {
  // In browse mode the detection plugin rewrites the document (adds a web2URL
  // mark) to make raw URLs render as clickable anchors. That mutation makes
  // editor.getJSON() diverge from the store-derived `editorJson`, which is what
  // drives editor.tsx's content-sync effect to call setContent() and revert the
  // mark — producing the red<->black flicker on every sync tick.
  it('mutates a raw URL doc in browse mode, diverging from the stored content', async () => {
    const storedContent: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://example.com' }] }],
    };

    const editor = makeEditor(storedContent);

    try {
      // The stored content (what `editorJson` holds) has no web2URL mark.
      expect(hasWeb2Mark(storedContent)).toBe(false);
      expect(hasWeb2Mark(editor.getJSON())).toBe(false);

      // After the detection plugin runs in browse mode, the live doc gains a
      // web2URL mark — so editor.getJSON() no longer equals the stored content.
      const mutated = await waitFor(() => hasWeb2Mark(editor.getJSON()));
      expect(mutated).toBe(true);
      expect(JSON.stringify(editor.getJSON())).not.toEqual(JSON.stringify(storedContent));
    } finally {
      editor.destroy();
    }
  });

  // The fix: the content-sync effect compares normalizeEditorContent(editor) to
  // normalizeEditorContent(store). Because normalizeEditorContent ignores web2URL
  // marks, the plugin's browse-mode mark no longer counts as a divergence, so
  // setContent() is not called and the styling does not flicker.
  it('does not diverge under normalizeEditorContent once web2URL marks are ignored', async () => {
    const storedContent: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://example.com' }] }],
    };

    const editor = makeEditor(storedContent);

    try {
      // Wait until the plugin has actually mutated the live doc.
      await waitFor(() => hasWeb2Mark(editor.getJSON()));

      // The sync effect's equality check (editor.tsx) must now see them as equal.
      const normalizedLive = JSON.stringify(normalizeEditorContent(editor.getJSON()));
      const normalizedStore = JSON.stringify(normalizeEditorContent(storedContent));
      expect(normalizedLive).toEqual(normalizedStore);
    } finally {
      editor.destroy();
    }
  });
});
