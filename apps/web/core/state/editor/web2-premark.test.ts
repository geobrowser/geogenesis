import type { JSONContent } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { describe, expect, it } from 'vitest';

import { GraphLinkExtension } from '~/partials/editor/graph-link-extension';
import { Web2URLExtension } from '~/partials/editor/web2-url-extension';

import { markdownToEditorJson } from './markdown-adapter';

const extensions = [Document, Text, Paragraph, Web2URLExtension, GraphLinkExtension, Bold, Italic, Underline];

function textNodes(node: JSONContent, out: Array<{ text: string; marks: string[] }> = []) {
  if (node.type === 'text') out.push({ text: node.text ?? '', marks: (node.marks ?? []).map(m => m.type) });
  (node.content ?? []).forEach(child => textNodes(child, out));
  return out;
}

describe('markdownToEditorJson — web2URL pre-marking', () => {
  it('pre-marks a raw https URL so the editor renders it without an async pass', () => {
    const nodes = textNodes(markdownToEditorJson('check https://google.com here', extensions));
    const url = nodes.find(n => n.text === 'https://google.com');
    expect(url?.marks).toContain('web2URL');
    // surrounding text is not marked
    expect(nodes.find(n => n.text === 'check ')?.marks ?? []).not.toContain('web2URL');
  });

  it('pre-marks a raw www URL', () => {
    const nodes = textNodes(markdownToEditorJson('www.google.com', extensions));
    expect(nodes.find(n => n.text === 'www.google.com')?.marks).toContain('web2URL');
  });

  it('keeps markdown web2 links as a single web2URL mark (no double-marking)', () => {
    const nodes = textNodes(markdownToEditorJson('[my site](https://example.com)', extensions));
    const label = nodes.find(n => n.text === 'my site');
    expect(label?.marks).toEqual(['web2URL']);
  });

  it('does not mark bare domains or filenames', () => {
    const nodes = textNodes(markdownToEditorJson('edit package.json and visit example.com', extensions));
    expect(nodes.every(n => !n.marks.includes('web2URL'))).toBe(true);
  });
});
