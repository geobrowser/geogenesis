import { MathExtension } from '@aarkue/tiptap-math-extension';
import Bold from '@tiptap/extension-bold';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { describe, expect, it } from 'vitest';

import { editorNodeToMarkdown, markdownToEditorJson, markdownToRenderedHtml } from './markdown-adapter';

// Minimal extensions for test — no React node views, no browser-only code
const testExtensions = [
  Document,
  Text,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Code,
  CodeBlock,
  Link,
  HardBreak,
  BulletList,
  ListItem,
  MathExtension.configure({ evaluation: false, delimiters: 'bracket', katexOptions: { throwOnError: false } }),
];

describe('markdown-adapter', () => {
  // ---------------------------------------------------------------------------
  // Round-trip tests: markdown → editorJson → markdown
  // ---------------------------------------------------------------------------
  describe('round-trip', () => {
    function roundTrip(markdown: string): string {
      const json = markdownToEditorJson(markdown, testExtensions);
      // editorNodeToMarkdown expects a single content node, not the doc wrapper.
      // For round-trip we iterate over doc.content
      const parts = (json.content ?? []).map(node => editorNodeToMarkdown(node));
      return parts.join('\n').trimEnd();
    }

    it('plain text', () => {
      expect(roundTrip('Hello world')).toBe('Hello world');
    });

    it('headings', () => {
      expect(roundTrip('# Heading 1')).toBe('# Heading 1');
      expect(roundTrip('## Heading 2')).toBe('## Heading 2');
      expect(roundTrip('### Heading 3')).toBe('### Heading 3');
    });

    it('bold and italic', () => {
      expect(roundTrip('**bold text**')).toBe('**bold text**');
      expect(roundTrip('*italic text*')).toBe('*italic text*');
    });

    it('inline code', () => {
      expect(roundTrip('Use `console.log` here')).toBe('Use `console.log` here');
    });

    it('links', () => {
      expect(roundTrip('[Example](https://example.com)')).toBe('[Example](https://example.com)');
    });

    it('bullet lists', () => {
      const md = '- Item 1\n- Item 2\n- Item 3';
      expect(roundTrip(md)).toBe(md);
    });

    it('inline math with bracket delimiters round-trips', () => {
      expect(roundTrip('The formula \\(x^2\\) is quadratic')).toBe(
        'The formula \\(x^2\\) is quadratic'
      );
    });

    it('code block round-trips', () => {
      const md = '```\nconst x = 1;\nconst y = 2;\n```';
      expect(roundTrip(md)).toBe(md);
    });

    it('code block with triple backticks in content', () => {
      const md = '````\nSome ```code``` here\n````';
      expect(roundTrip(md)).toBe(md);
    });

    it('mixed paragraph with bold + italic + code + formula', () => {
      const md = 'Text **bold** *italic* `code` \\(E=mc^2\\)';
      expect(roundTrip(md)).toBe(md);
    });
  });

  // ---------------------------------------------------------------------------
  // Safety tests
  // ---------------------------------------------------------------------------
  describe('safety', () => {
    it('dollar amounts are not parsed as math', () => {
      const json = markdownToEditorJson('Price is $5 and $10 today', testExtensions);
      // Should produce a single paragraph with plain text (no inlineMath nodes)
      const content = json.content ?? [];
      expect(content.length).toBe(1);
      expect(content[0].type).toBe('paragraph');

      const hasInlineMath = JSON.stringify(content).includes('"type":"inlineMath"');
      expect(hasInlineMath).toBe(false);
    });

    it('legacy $...$ in stored content loads correctly', () => {
      const json = markdownToEditorJson('Formula $x^2$ here', testExtensions);
      const flat = JSON.stringify(json);
      expect(flat).toContain('"type":"inlineMath"');
    });

    it('legacy $...$ saves as bracket delimiters', () => {
      const json = markdownToEditorJson('Formula $x^2$ here', testExtensions);
      const parts = (json.content ?? []).map(node => editorNodeToMarkdown(node));
      const result = parts.join('\n').trimEnd();
      expect(result).toContain('\\(x^2\\)');
      expect(result).not.toContain('$x^2$');
    });
  });

  // ---------------------------------------------------------------------------
  // markdownToRenderedHtml tests
  // ---------------------------------------------------------------------------
  describe('markdownToRenderedHtml', () => {
    it('paragraphs have correct CSS classes', () => {
      const html = markdownToRenderedHtml('Hello world');
      expect(html).toContain('react-renderer node-paragraph');
      expect(html).toContain('<p>');
    });

    it('headings have correct CSS classes', () => {
      const html = markdownToRenderedHtml('## Heading');
      expect(html).toContain('react-renderer node-heading');
      expect(html).toContain('<h2>');
    });

    it('code blocks include line numbers and code-block class', () => {
      const html = markdownToRenderedHtml('```\nline1\nline2\n```');
      expect(html).toContain('code-block');
      expect(html).toContain('code-block-line-numbers');
      expect(html).toContain('<div>1</div>');
      expect(html).toContain('<div>2</div>');
    });

    it('inline code has inline-code class', () => {
      const html = markdownToRenderedHtml('Use `code` here');
      expect(html).toContain('inline-code');
    });

    it('math renders as KaTeX HTML', () => {
      const html = markdownToRenderedHtml('Formula \\(x^2\\)');
      expect(html).toContain('katex');
    });

    it('preserves safe https links', () => {
      const html = markdownToRenderedHtml('[safe](https://example.com)');
      expect(html).toContain('href="https://example.com"');
    });

    it('preserves safe graph links', () => {
      const html = markdownToRenderedHtml('[entity](graph://foo)');
      expect(html).toContain('href="graph://foo"');
    });

    it('strips unsafe javascript links', () => {
      const html = markdownToRenderedHtml('[unsafe](javascript:alert(1))');
      expect(html).not.toContain('href="javascript:alert(1)"');
      expect(html).not.toContain('<a ');
    });

    it('strips parsed but disallowed link schemes', () => {
      const html = markdownToRenderedHtml('[ftp](ftp://example.com)');
      expect(html).not.toContain('href="ftp://example.com"');
      expect(html).toContain('data-invalid-link="true"');
    });
  });

  // ---------------------------------------------------------------------------
  // editorNodeToMarkdown specific tests
  // ---------------------------------------------------------------------------
  describe('editorNodeToMarkdown', () => {
    it('serializes a paragraph node', () => {
      const node = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello' }],
      };
      expect(editorNodeToMarkdown(node)).toBe('Hello');
    });

    it('serializes a heading node', () => {
      const node = {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Title' }],
      };
      expect(editorNodeToMarkdown(node)).toBe('## Title');
    });

    it('serializes bold text', () => {
      const node = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
      };
      expect(editorNodeToMarkdown(node)).toBe('**bold**');
    });

    it('serializes inline math as bracket delimiters', () => {
      const node = {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'f(x) = ' },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
        ],
      };
      expect(editorNodeToMarkdown(node)).toBe('f(x) = \\(x^2\\)');
    });

    it('serializes code block with dynamic fence length', () => {
      const node = {
        type: 'codeBlock',
        content: [{ type: 'text', text: 'some ```code``` here' }],
      };
      const result = editorNodeToMarkdown(node);
      expect(result).toBe('````\nsome ```code``` here\n````');
    });

    it('serializes inline code with dynamic backtick length', () => {
      const node = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'const value = `x`', marks: [{ type: 'code' }] }],
      };
      expect(editorNodeToMarkdown(node)).toBe('``const value = `x```');
    });
  });
});
