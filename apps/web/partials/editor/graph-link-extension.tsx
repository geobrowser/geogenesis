import { Extension, InputRule, PasteRule, Range as TipTapRange, ChainedCommands } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import Link from '@tiptap/extension-link';

import { insertGraphLink } from './insert-graph-link';

export { insertGraphLink };

// Extend Link to add custom data attributes for entity caching
const GraphLinkExtended = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-entity-name': {
        default: null,
        parseHTML: element => element.getAttribute('data-entity-name'),
        renderHTML: attributes => {
          if (!attributes['data-entity-name']) {
            return {};
          }
          return {
            'data-entity-name': attributes['data-entity-name'],
          };
        },
      },
      'data-space-id': {
        default: null,
        parseHTML: element => element.getAttribute('data-space-id'),
        renderHTML: attributes => {
          if (!attributes['data-space-id']) {
            return {};
          }
          return {
            'data-space-id': attributes['data-space-id'],
          };
        },
      },
    };
  },
});

// Configure the extended link with graph protocol settings
export const GraphLinkExtension = GraphLinkExtended.configure({
  defaultProtocol: 'graph',
  protocols: ['graph'],
  HTMLAttributes: {
    rel: null,
    target: null,
    class: 'entity-link-valid',
  },
  openOnClick: false,
  validate: url => {
    // Only allow graph:// URLs, exclude web2 URLs (http/https/www)
    return url.startsWith('graph://');
  },
});

// Custom extension to add markdown link input and paste rules for graph:// URLs
export const MarkdownLinkExtension = Extension.create({
  name: 'markdownLink',
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^)]+)\)/,
        handler: ({ state, range, match, chain }: { state: EditorState; range: TipTapRange; match: RegExpMatchArray; chain: () => ChainedCommands }) => {
          const [fullMatch, linkText, url] = match;

          if (url.startsWith('graph://')) {
            // Verify that the selected text matches the full match to avoid off-by-one errors
            const selectedText = state.doc.textBetween(range.from, range.to);
            const isRangeCorrect = selectedText === fullMatch;

            // Use insertGraphLink for consistent link insertion
            insertGraphLink({
              chain,
              url,
              linkText,
              from: isRangeCorrect ? range.from : range.from - 1,
              to: range.to,
            });
          }
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      new PasteRule({
        find: /\[([^\]]+)\]\(([^)]+)\)/g,
        handler: ({ range, match, chain }: { state: EditorState; range: TipTapRange; match: RegExpMatchArray; chain: () => ChainedCommands }) => {
          const [, linkText, url] = match;

          if (url.startsWith('graph://')) {
            // Use insertGraphLink for consistent link insertion
            insertGraphLink({
              chain,
              url,
              linkText,
              from: range.from,
              to: range.to,
            });
          }
        },
      }),
    ];
  },
});
