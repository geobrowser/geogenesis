import { Editor } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';

import { describe, expect, it } from 'vitest';

import { markdownToEditorJson } from '~/core/state/editor/markdown-adapter';

import { GraphLinkExtension, MarkdownLinkExtension } from './graph-link-extension';
import { Web2URLExtension } from './web2-url-extension';

// Extensions close to the production set (extensions.tsx), enough to reproduce
// the imported-post load path through markdownToEditorJson.
const extensions = [
  Document,
  Text,
  Paragraph,
  HardBreak,
  BulletList,
  ListItem,
  Web2URLExtension,
  GraphLinkExtension,
  MarkdownLinkExtension,
  Bold,
  Italic,
  Underline,
];

function makeEditorFromMarkdown(markdown: string, editable: boolean) {
  return new Editor({ extensions, content: markdownToEditorJson(markdown, extensions), editable });
}

function docText(editor: Editor): string {
  let text = '';
  editor.state.doc.descendants(node => {
    if (node.isText && node.text) text += node.text;
  });
  return text;
}

// Counts transactions the plugin dispatches with NO user input, split into a
// convergence window (rewrites allowed while settling) and a steady-state window
// (any transaction here means the detection loop never converged — the freeze).
async function measure(editor: Editor, convergenceMs = 2500, steadyMs = 1200) {
  let converging = 0;
  let steady = 0;
  let phase: 'converging' | 'steady' = 'converging';
  const handler = () => {
    if (phase === 'converging') converging++;
    else steady++;
  };
  editor.on('transaction', handler);
  await new Promise(resolve => setTimeout(resolve, convergenceMs));
  phase = 'steady';
  await new Promise(resolve => setTimeout(resolve, steadyMs));
  editor.off('transaction', handler);
  return { converging, steady };
}

// The exact shape that froze the tab: a markdown link whose URL contains a
// balanced pair of parentheses (Wikipedia's "_(book)" convention).
const PAREN_LINK_PARAGRAPH =
  'Zoonotic [spillovers](https://en.wikipedia.org/wiki/Spillover_(book)) have occurred throughout human history.';

// A citation-dense post like the Substack import in the bug report: several
// prose links per paragraph across many paragraphs.
function citationParagraph(i: number): string {
  return (
    `Paragraph ${i} argues that [a recent paper ${i}](https://www.pnas.org/doi/10.1073/pnas.${i}) ` +
    `contradicts [an earlier study ${i}](https://journals.example.org/study/${i}) while ` +
    `[this response ${i}](https://example${i}.substack.com/p/reply) disagrees.`
  );
}

const CITATION_DENSE_MARKDOWN = [
  ...Array.from({ length: 10 }, (_, i) => citationParagraph(i)),
  PAREN_LINK_PARAGRAPH,
].join('\n\n');

describe('web2URL detection — imported-post freeze regression', () => {
  it('converges on a markdown link whose URL contains parentheses (EDIT mode)', async () => {
    const editor = makeEditorFromMarkdown(PAREN_LINK_PARAGRAPH, true);
    try {
      const sizeBefore = editor.state.doc.content.size;
      const { steady } = await measure(editor, 2000, 1000);

      // No steady-state churn — the detection loop reached a fixed point.
      expect(steady).toBe(0);

      const text = docText(editor);
      // No corruption: the [[…](…) doubling that used to grow the document.
      expect(text.includes('[[')).toBe(false);
      // The document did not balloon (the freeze grew it ~2x every pass).
      expect(editor.state.doc.content.size).toBeLessThan(sizeBefore * 3);
      // The link survives exactly once, with its full parenthesised URL intact.
      const occurrences = text.split('https://en.wikipedia.org/wiki/Spillover_(book)').length - 1;
      expect(occurrences).toBe(1);
    } finally {
      editor.destroy();
    }
  }, 12000);

  it('converges and stays quiescent on a citation-dense post (EDIT mode)', async () => {
    const editor = makeEditorFromMarkdown(CITATION_DENSE_MARKDOWN, true);
    try {
      const { converging, steady } = await measure(editor);
      expect(steady).toBe(0);
      // Convergence should take a handful of passes, not an ever-growing stream.
      expect(converging).toBeLessThanOrEqual(10);
      expect(docText(editor).includes('[[')).toBe(false);
    } finally {
      editor.destroy();
    }
  }, 15000);

  it('converges and stays quiescent on a citation-dense post (BROWSE mode)', async () => {
    const editor = makeEditorFromMarkdown(CITATION_DENSE_MARKDOWN, false);
    try {
      const { steady } = await measure(editor);
      expect(steady).toBe(0);
    } finally {
      editor.destroy();
    }
  }, 15000);

  it('typing after import does not trigger runaway reprocessing', async () => {
    const editor = makeEditorFromMarkdown(CITATION_DENSE_MARKDOWN, true);
    try {
      // Let the initial edit-mode expansion settle.
      await new Promise(resolve => setTimeout(resolve, 2500));
      editor.commands.insertContentAt(editor.state.doc.content.size, ' x');
      const { steady } = await measure(editor, 1200, 1000);
      expect(steady).toBe(0);
    } finally {
      editor.destroy();
    }
  }, 15000);
});
