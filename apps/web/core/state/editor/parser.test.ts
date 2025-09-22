import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml, htmlToPlainText } from './parser';

// Mock window for SSR tests
const mockWindow = (exists: boolean) => {
  if (!exists) {
    // @ts-expect-error - Deleting window from global for SSR testing
    delete global.window;
  } else {
    // @ts-expect-error - Mocking window object for testing
    global.window = { document: global.document };
  }
};

describe('Parser', () => {
  describe('htmlToMarkdown', () => {
    describe('Headings', () => {
      it('converts h1 to markdown', () => {
        expect(htmlToMarkdown('<h1>Heading 1</h1>')).toBe('# Heading 1');
      });

      it('converts h2 to markdown', () => {
        expect(htmlToMarkdown('<h2>Heading 2</h2>')).toBe('## Heading 2');
      });

      it('converts h3 to markdown', () => {
        expect(htmlToMarkdown('<h3>Heading 3</h3>')).toBe('### Heading 3');
      });

      it('converts h4 to markdown', () => {
        expect(htmlToMarkdown('<h4>Heading 4</h4>')).toBe('#### Heading 4');
      });

      it('converts h5 to markdown', () => {
        expect(htmlToMarkdown('<h5>Heading 5</h5>')).toBe('##### Heading 5');
      });

      it('converts h6 to markdown', () => {
        expect(htmlToMarkdown('<h6>Heading 6</h6>')).toBe('###### Heading 6');
      });

      it('preserves inline formatting in headings', () => {
        expect(htmlToMarkdown('<h1>Heading with <strong>bold</strong> text</h1>')).toBe('# Heading with **bold** text');
        expect(htmlToMarkdown('<h2>Heading with <em>italic</em> text</h2>')).toBe('## Heading with *italic* text');
      });
    });

    describe('Paragraphs', () => {
      it('converts paragraphs', () => {
        expect(htmlToMarkdown('<p>Simple paragraph</p>')).toBe('Simple paragraph');
      });

      it('handles multiple paragraphs', () => {
        expect(htmlToMarkdown('<p>First paragraph</p><p>Second paragraph</p>')).toBe('First paragraph\n\nSecond paragraph');
      });

      it('handles empty paragraphs', () => {
        expect(htmlToMarkdown('<p></p>')).toBe('');
      });
    });

    describe('Text Formatting', () => {
      it('converts bold text', () => {
        expect(htmlToMarkdown('<strong>bold text</strong>')).toBe('**bold text**');
        expect(htmlToMarkdown('<b>bold text</b>')).toBe('**bold text**');
      });

      it('converts italic text', () => {
        expect(htmlToMarkdown('<em>italic text</em>')).toBe('*italic text*');
        expect(htmlToMarkdown('<i>italic text</i>')).toBe('*italic text*');
      });

      it('handles nested formatting', () => {
        expect(htmlToMarkdown('<strong><em>bold italic</em></strong>')).toBe('***bold italic***');
        expect(htmlToMarkdown('<em><strong>italic bold</strong></em>')).toBe('***italic bold***');
      });

      it('handles mixed formatting in paragraphs', () => {
        expect(htmlToMarkdown('<p>Text with <strong>bold</strong> and <em>italic</em> words</p>'))
          .toBe('Text with **bold** and *italic* words');
      });
    });

    describe('Links', () => {
      it('converts basic links', () => {
        expect(htmlToMarkdown('<a href="https://example.com">Example</a>'))
          .toBe('[Example](https://example.com)');
      });

      it('handles links without href', () => {
        expect(htmlToMarkdown('<a>No href</a>')).toBe('[No href]()');
      });

      it('handles links with formatted text', () => {
        expect(htmlToMarkdown('<a href="https://example.com"><strong>Bold Link</strong></a>'))
          .toBe('[**Bold Link**](https://example.com)');
      });
    });

    describe('Lists', () => {
      it('converts simple unordered lists', () => {
        const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
        const expected = '- Item 1\n- Item 2\n- Item 3';
        expect(htmlToMarkdown(html)).toBe(expected);
      });

      it('converts nested unordered lists', () => {
        const html = `<ul>
          <li>Item 1</li>
          <li>Item 2
            <ul>
              <li>Nested 1</li>
              <li>Nested 2</li>
            </ul>
          </li>
          <li>Item 3</li>
        </ul>`;
        const expected = '- Item 1\n- Item 2\n  - Nested 1\n  - Nested 2\n- Item 3';
        expect(htmlToMarkdown(html)).toBe(expected);
      });

      it('handles list items with formatted text', () => {
        const html = '<ul><li><strong>Bold</strong> item</li><li>Item with <em>italic</em></li></ul>';
        const expected = '- **Bold** item\n- Item with *italic*';
        expect(htmlToMarkdown(html)).toBe(expected);
      });

      it('handles list items with text before nested list', () => {
        const html = '<ul><li>Parent item<ul><li>Child item</li></ul></li></ul>';
        const expected = '- Parent item\n  - Child item';
        expect(htmlToMarkdown(html)).toBe(expected);
      });
    });

    describe('Special Elements', () => {
      it('converts line breaks', () => {
        expect(htmlToMarkdown('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
      });

      it('handles unknown tags by processing children', () => {
        expect(htmlToMarkdown('<div>Content in div</div>')).toBe('Content in div');
        expect(htmlToMarkdown('<span>Content in span</span>')).toBe('<span>Content in span</span>');
      });

      it('preserves span elements with attributes', () => {
        expect(htmlToMarkdown('<span data-web2-url="true" data-url="https://example.com">Link text</span>'))
          .toBe('<span data-web2-url="true" data-url="https://example.com">Link text</span>');
      });

      it('preserves invalid entity links as spans not markdown links', () => {
        const invalidLinkHtml = '<span class="entity-link-invalid web2-url-mark" data-web2-url="true" data-url="https://example.com">Invalid Link</span>';
        const result = htmlToMarkdown(invalidLinkHtml);
        
        // Should preserve as span, not convert to [Invalid Link](https://example.com)
        expect(result).toBe('<span class="entity-link-invalid web2-url-mark" data-web2-url="true" data-url="https://example.com">Invalid Link</span>');
        expect(result).not.toContain('[Invalid Link](https://example.com)');
      });
    });

    describe('SSR Fallback', () => {
      it('uses simple tag stripping when window is undefined', () => {
        const originalWindow = global.window;
        mockWindow(false);
        
        const html = '<p>Simple <strong>text</strong> with <a href="#">link</a></p>';
        expect(htmlToMarkdown(html)).toBe('Simple text with link');
        
        global.window = originalWindow;
      });
    });
  });

  describe('markdownToHtml', () => {
    describe('Headings', () => {
      it('converts markdown headings to HTML', () => {
        expect(markdownToHtml('# Heading 1')).toBe('<h1>Heading 1</h1>');
        expect(markdownToHtml('## Heading 2')).toBe('<h2>Heading 2</h2>');
        expect(markdownToHtml('### Heading 3')).toBe('<h3>Heading 3</h3>');
        expect(markdownToHtml('#### Heading 4')).toBe('<h4>Heading 4</h4>');
        expect(markdownToHtml('##### Heading 5')).toBe('<h5>Heading 5</h5>');
        expect(markdownToHtml('###### Heading 6')).toBe('<h6>Heading 6</h6>');
      });

      it('requires space after # for headings', () => {
        expect(markdownToHtml('#NoSpace')).toBe('<p>#NoSpace</p>');
      });

      it('handles headings with inline formatting', () => {
        expect(markdownToHtml('# Heading with **bold**')).toBe('<h1>Heading with <strong>bold</strong></h1>');
        expect(markdownToHtml('## Heading with *italic*')).toBe('<h2>Heading with <em>italic</em></h2>');
      });
    });

    describe('Paragraphs', () => {
      it('converts plain text to paragraphs', () => {
        expect(markdownToHtml('Simple paragraph')).toBe('<p>Simple paragraph</p>');
      });

      it('handles multiple paragraphs separated by blank lines', () => {
        expect(markdownToHtml('First paragraph\n\nSecond paragraph'))
          .toBe('<p>First paragraph</p>\n<p>Second paragraph</p>');
      });
    });

    describe('Text Formatting', () => {
      it('converts bold markdown', () => {
        expect(markdownToHtml('**bold text**')).toBe('<p><strong>bold text</strong></p>');
      });

      it('converts italic markdown', () => {
        expect(markdownToHtml('*italic text*')).toBe('<p><em>italic text</em></p>');
      });

      it('converts inline code', () => {
        expect(markdownToHtml('`code`')).toBe('<p><code>code</code></p>');
      });

      it('handles mixed formatting', () => {
        expect(markdownToHtml('Text with **bold** and *italic* and `code`'))
          .toBe('<p>Text with <strong>bold</strong> and <em>italic</em> and <code>code</code></p>');
      });
    });

    describe('Links', () => {
      it('converts markdown links', () => {
        expect(markdownToHtml('[Example](https://example.com)'))
          .toBe('<p><a href="https://example.com">Example</a></p>');
      });

      it('handles links with formatted text', () => {
        expect(markdownToHtml('[**Bold Link**](https://example.com)'))
          .toBe('<p><a href="https://example.com"><strong>Bold Link</strong></a></p>');
      });
    });

    describe('Lists', () => {
      it('converts simple bullet lists', () => {
        const markdown = '- Item 1\n- Item 2\n- Item 3';
        const expected = '<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n  <li>Item 3</li>\n</ul>';
        expect(markdownToHtml(markdown)).toBe(expected);
      });

      it('converts nested lists with proper indentation', () => {
        const markdown = '- Item 1\n- Item 2\n  - Nested 1\n  - Nested 2\n- Item 3';
        const expected = '<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n  <ul>\n    <li>Nested 1</li>\n    <li>Nested 2</li>\n  </ul>\n  <li>Item 3</li>\n</ul>';
        expect(markdownToHtml(markdown)).toBe(expected);
      });

      it('handles lists with inline formatting', () => {
        const markdown = '- **Bold** item\n- Item with *italic*';
        const expected = '<ul>\n  <li><strong>Bold</strong> item</li>\n  <li>Item with <em>italic</em></li>\n</ul>';
        expect(markdownToHtml(markdown)).toBe(expected);
      });
    });

    describe('Code Blocks', () => {
      it('converts code blocks', () => {
        const markdown = '```\nconst x = 1;\nconst y = 2;\n```';
        const expected = '<pre><code>const x = 1;\nconst y = 2;</code></pre>';
        expect(markdownToHtml(markdown)).toBe(expected);
      });

      it('handles empty code blocks', () => {
        expect(markdownToHtml('```\n```')).toBe('<pre><code></code></pre>');
      });

      it('handles unclosed code blocks', () => {
        const markdown = '```\nconst x = 1;';
        const expected = '<pre><code>const x = 1;</code></pre>';
        expect(markdownToHtml(markdown)).toBe(expected);
      });
    });

    describe('Special Elements', () => {
      it('converts blockquotes', () => {
        expect(markdownToHtml('> This is a quote')).toBe('<blockquote>This is a quote</blockquote>');
      });

      it('converts horizontal rules', () => {
        expect(markdownToHtml('---')).toBe('<hr>');
        expect(markdownToHtml('___')).toBe('<hr>');
        expect(markdownToHtml('***')).toBe('<hr>');
      });

      it('requires at least 3 characters for horizontal rules', () => {
        expect(markdownToHtml('--')).toBe('<p>--</p>');
      });
    });
  });

  describe('htmlToPlainText', () => {
    it('extracts plain text from HTML', () => {
      expect(htmlToPlainText('<p>Simple <strong>text</strong> with <em>formatting</em></p>'))
        .toBe('Simple text with formatting');
    });

    it('handles nested HTML structures', () => {
      expect(htmlToPlainText('<div><p>Paragraph in <span>div</span></p></div>'))
        .toBe('Paragraph in div');
    });

    it('returns empty string for empty HTML', () => {
      expect(htmlToPlainText('')).toBe('');
      expect(htmlToPlainText('<p></p>')).toBe('');
    });
  });

  describe('Round-trip Conversions', () => {
    it('preserves content through HTML → Markdown → HTML conversion', () => {
      const originalHtml = '<h1>Title</h1>\n<p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>\n<ul>\n  <li>Item 1</li>\n  <li>Item 2</li>\n</ul>';
      const markdown = htmlToMarkdown(originalHtml);
      const resultHtml = markdownToHtml(markdown);
      
      // The exact HTML might differ slightly, but the content should be preserved
      expect(resultHtml).toContain('<h1>Title</h1>');
      expect(resultHtml).toContain('<strong>bold</strong>');
      expect(resultHtml).toContain('<em>italic</em>');
      expect(resultHtml).toContain('<li>Item 1</li>');
    });

    it('preserves span elements through HTML → Markdown → HTML conversion', () => {
      const originalHtml = '<p>Text with <span data-web2-url="true" data-url="https://example.com">web2 link</span> preserved.</p>';
      const markdown = htmlToMarkdown(originalHtml);
      const resultHtml = markdownToHtml(markdown);
      
      expect(markdown).toContain('<span data-web2-url="true" data-url="https://example.com">web2 link</span>');
      expect(resultHtml).toContain('<span data-web2-url="true" data-url="https://example.com">web2 link</span>');
    });
  });
});