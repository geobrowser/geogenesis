import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { hasMarkdownSyntax, renderMarkdownDocument, renderMarkdownInline } from './markdown-render';

const VALID_ENTITY_ID = '11111111111111111111111111111111';
const VALID_SPACE_ID = '22222222222222222222222222222222';

describe('markdown-render', () => {
  describe('hasMarkdownSyntax', () => {
    it('detects inline math with $$ delimiters', () => {
      expect(hasMarkdownSyntax('Use $$f(x)$$ here')).toBe(true);
    });

    it('detects inline math with legacy bracket delimiters', () => {
      expect(hasMarkdownSyntax('Use \\(f(x)\\) here')).toBe(true);
    });

    it('does not flag plain currency text', () => {
      expect(hasMarkdownSyntax('Price is $5 and $10 today')).toBe(false);
    });
  });

  describe('renderMarkdownInline', () => {
    it('renders $$ math', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownInline('Use $$f(x)$$ here')}</>);
      expect(html).toContain('katex');
    });

    it('renders legacy bracket math with inner parentheses', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownInline('Use \\(f(x)\\) here')}</>);
      expect(html).toContain('katex');
    });
  });

  describe('renderMarkdownDocument', () => {
    it('renders safe links as anchor tags', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownDocument('[safe](https://example.com)')}</>);
      expect(html).toContain('<a');
      expect(html).toContain('class="entity-link-valid"');
      expect(html).toContain('href="https://example.com"');
    });

    it('renders valid graph links as anchor tags', () => {
      const html = renderToStaticMarkup(
        <>{renderMarkdownDocument(`[entity](graph://${VALID_ENTITY_ID}?s=${VALID_SPACE_ID})`)}</>
      );
      expect(html).toContain('<a');
      expect(html).toContain('class="entity-link-valid"');
      expect(html).toContain(`href="graph://${VALID_ENTITY_ID}?s=${VALID_SPACE_ID}"`);
    });

    it('marks malformed graph links as invalid', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownDocument('[entity](graph://foo)')}</>);
      expect(html).toContain('<span');
      expect(html).toContain('class="entity-link-invalid"');
      expect(html).toContain('data-invalid-link="true"');
      expect(html).not.toContain('href="graph://foo"');
      expect(html).not.toContain('<a');
    });

    it('marks unsafe links as invalid instead of keeping href', () => {
      const html = renderToStaticMarkup(<>{renderMarkdownDocument('[unsafe](ftp://example.com)')}</>);
      expect(html).toContain('<span');
      expect(html).toContain('class="entity-link-invalid"');
      expect(html).toContain('data-invalid-link="true"');
      expect(html).not.toContain('href="ftp://example.com"');
      expect(html).not.toContain('<a');
    });
  });

  // linkifyWeb2Urls makes the server render match the editor's web2URL rendering
  // (see ServerContent) so links don't flicker from plain text to anchors on mount.
  describe('renderMarkdownDocument with linkifyWeb2Urls', () => {
    const render = (md: string) => renderToStaticMarkup(<>{renderMarkdownDocument(md, { linkifyWeb2Urls: true })}</>);

    it('linkifies a raw https URL as a web2URL anchor', () => {
      const html = render('see https://google.com here');
      expect(html).toContain('data-web2-url="true"');
      expect(html).toContain('href="https://google.com"');
      expect(html).toContain('data-url="https://google.com"');
      expect(html).toContain('target="_blank"');
    });

    it('linkifies a raw www URL and normalizes its href', () => {
      const html = render('www.google.com');
      expect(html).toContain('data-web2-url="true"');
      expect(html).toContain('href="https://www.google.com"');
      expect(html).toContain('data-url="www.google.com"');
    });

    it('renders a [label](web2 url) markdown link as a web2URL anchor, not entity-link-valid', () => {
      const html = render('[my site](https://example.com)');
      expect(html).toContain('data-web2-url="true"');
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('>my site<');
      expect(html).not.toContain('entity-link-valid');
    });

    it('does not produce nested anchors when the link label is itself a URL', () => {
      const html = render('[https://example.com](https://example.com)');
      // Exactly one anchor open tag.
      expect(html.match(/<a\b/g)?.length).toBe(1);
    });

    it('does not linkify bare domains / filenames', () => {
      const html = render('edit package.json and visit example.com');
      expect(html).not.toContain('data-web2-url');
      expect(html).not.toContain('<a');
    });

    it('still renders graph links as entity links, not web2 anchors', () => {
      const html = render(`[entity](graph://${VALID_ENTITY_ID}?s=${VALID_SPACE_ID})`);
      expect(html).toContain('class="entity-link-valid"');
      expect(html).not.toContain('data-web2-url');
    });
  });
});
