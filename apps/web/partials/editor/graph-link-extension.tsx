import { Extension, InputRule, PasteRule, Range as TipTapRange, ChainedCommands } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import Link from '@tiptap/extension-link';

export const GraphLinkExtension = Link.configure({
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
            const linkMark = state.schema.marks.link.create({ href: url });

            // Verify that the selected text matches the full match to avoid off-by-one errors
            const selectedText = state.doc.textBetween(range.from, range.to);
            const isRangeCorrect = selectedText === fullMatch;

            chain()
              .deleteRange({ ...range, from: isRangeCorrect ? range.from : range.from - 1 })
              .insertContent(state.schema.text(linkText, [linkMark]))
              .run();
          }
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      new PasteRule({
        find: /\[([^\]]+)\]\(([^)]+)\)/g,
        handler: ({ state, range, match, chain }: { state: EditorState; range: TipTapRange; match: RegExpMatchArray; chain: () => ChainedCommands }) => {
          const [, linkText, url] = match;

          if (url.startsWith('graph://')) {
            const linkMark = state.schema.marks.link.create({ href: url });

            if (linkMark) {
              chain()
                .deleteRange(range)
                .insertContent(state.schema.text(linkText, [linkMark]))
                .run();
            }
          }
        },
      }),
    ];
  },
});
