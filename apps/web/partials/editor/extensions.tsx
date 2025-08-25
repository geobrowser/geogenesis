import Bold from '@tiptap/extension-bold';
import BulletList from '@tiptap/extension-bullet-list';
import Document from '@tiptap/extension-document';
import Gapcursor from '@tiptap/extension-gapcursor';
import History from '@tiptap/extension-history';
import Image from '@tiptap/extension-image';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import Placeholder from '@tiptap/extension-placeholder';
import Text from '@tiptap/extension-text';

import { CodeBlockTriggerExtension } from './code-block-extension';
import { CodeBlockWithLineNumbers } from './code-block-with-line-numbers';
import { ConfiguredCommandExtension } from './command-extension';
import { InlineCode } from './inline-code';
import { InlineCodeTriggerExtension } from './inline-code-extension';
import { DataNode } from './data-node';
import { HeadingNode } from './heading-node';
import { ParagraphNode } from './paragraph-node';
import { TrailingNode } from './trailing-node';

export const tiptapExtensions = [
  Document,
  Text,
  Link.configure({
    defaultProtocol: 'graph',
    protocols: ['graph', 'https'],
    HTMLAttributes: {
      rel: null,
      target: null,
    },
    openOnClick: false,
  }),
  Bold,
  Italic,
  InlineCode.configure({
    HTMLAttributes: {
      class: 'inline-code',
      spellcheck: 'false',
    },
  }),
  // StarterKit.configure({
  //   // We're probably only using the Document and Text from the starterkit. Might
  //   // save us bytes to use it directly instead of through the kit.
  //   paragraph: false,
  //   heading: false,
  //   code: false,
  //   hardBreak: false,
  //   gapcursor: false,
  //   bulletList: false,
  //   listItem: false,
  // }),
  ParagraphNode,
  HeadingNode,
  CodeBlockWithLineNumbers.configure({
    HTMLAttributes: {
      class: 'code-block font-mono',
    },
  }),
  CodeBlockTriggerExtension,
  InlineCodeTriggerExtension,
  ConfiguredCommandExtension,
  // HardBreak.extend({
  //   addKeyboardShortcuts() {
  //     // Make hard breaks behave like normal paragraphs
  //     const handleEnter = () =>
  //       this.editor.commands.first(({ commands }) => [
  //         () => commands.newlineInCode(),
  //         () => commands.createParagraphNear(),
  //         () => commands.liftEmptyBlock(),
  //         () => commands.splitBlock(),
  //       ]);

  //     return {
  //       // This was intercepting the 'Enter' behavior in `command-list.tsx`
  //       // Disabling doesn't seem to make a difference so maybe it was unnecessary?
  //       // Enter: handleEnter,

  //       'Mod-Enter': handleEnter,
  //       'Shift-Enter': handleEnter,
  //     };
  //   },
  // }),
  Gapcursor,
  TrailingNode,
  BulletList,
  ListItem,
  DataNode,
  Image,
  Placeholder.configure({
    placeholder: ({ node }) => {
      const isHeading = node.type.name === 'heading';
      return isHeading ? 'Heading...' : '/ to select content block or write some content...';
    },
  }),
  History,
];
