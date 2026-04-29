import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { Focus, Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';

import { CodeBlockNode } from './code-block-node';
import { DataNode } from './data-node';
import { FloatingToolbarExtension } from './floating-toolbar-extension';
import { GraphLinkExtension, MarkdownLinkExtension } from './graph-link-extension';
import { HeadingNode } from './heading-node';
import { ImageNode } from './image-node';
import { InlineCode } from './inline-code';
import { MathNode } from './math-node';
import { ParagraphNode } from './paragraph-node';
import { TrailingNode } from './trailing-node';
import { VideoNode } from './video-node';
import { Web2URLExtension } from './web2-url-extension';

export const tiptapExtensions = [
  Document,
  Text,
  Web2URLExtension, // Process web2 URLs BEFORE Link extension
  GraphLinkExtension,
  MarkdownLinkExtension,
  Bold,
  Italic,
  Underline,
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
  HardBreak,
  Gapcursor,
  TrailingNode,
  BulletList,
  ListItem,
  InlineCode,
  CodeBlockNode,
  MathNode,
  DataNode,
  ImageNode,
  VideoNode,
  // mode: 'deepest' tags only the leaf node, not the wrapper chain. With
  // 'all', the `has-focus` class lands on every NodeView wrapper on the
  // selection path — including `data-node` etc. — and the slash-hint CSS
  // (`.is-empty.has-focus::before`) leaks onto empty NodeView wrappers.
  Focus.configure({ className: 'has-focus', mode: 'deepest' }),
  Placeholder.configure({
    showOnlyCurrent: false,
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') return 'Heading...';
      if (node.type.name === 'bulletList') return '';
      if (node.type.name === 'codeBlock') return '';
      return 'Add content...';
    },
  }),
  UndoRedo,
  FloatingToolbarExtension,
];
