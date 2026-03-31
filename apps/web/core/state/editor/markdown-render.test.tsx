import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { hasMarkdownSyntax, renderMarkdownDocument, renderMarkdownInline } from './markdown-render';

describe('markdown-render', () => {
  describe('hasMarkdownSyntax', () => {
    it('detects inline math with normal parentheses', () => {
      expect(hasMarkdownSyntax('Use \\(f(x)\\) here')).toBe(true);
    });

    it('does not flag plain currency text', () => {
      expect(hasMarkdownSyntax('Price is $5 and $10 today')).toBe(false);
    });
  });

  describe('renderMarkdownInline', () => {
    it('renders bracket math with inner parentheses', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownInline('Use \\(f(x)\\) here')}</>);
      expect(html).toContain('katex');
    });
  });

  describe('renderMarkdownDocument', () => {
    it('renders safe links as anchors', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownDocument('[safe](https://example.com)')}</>);
      expect(html).toContain('href="https://example.com"');
    });

    it('marks unsafe links as invalid instead of keeping href', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownDocument('[unsafe](ftp://example.com)')}</>);
      expect(html).toContain('data-invalid-link="true"');
      expect(html).not.toContain('href="ftp://example.com"');
    });
  });
});
