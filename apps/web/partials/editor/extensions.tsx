import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Text from '@tiptap/extension-text';
import { Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';

import { CodeBlockNode } from './code-block-node';
import { ConfiguredCommandExtension } from './command-extension';
import { DataNode } from './data-node';
import { HeadingNode } from './heading-node';
import { ImageNode } from './image-node';
import { InlineCode } from './inline-code';
import { MathNode } from './math-node';
import { ParagraphNode } from './paragraph-node';
import { TrailingNode } from './trailing-node';
import { VideoNode } from './video-node';

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
  ParagraphNode,
  HeadingNode,
  ConfiguredCommandExtension,
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
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') return 'Heading...';
      if (node.type.name === 'bulletList') return '';
      return '/ to select content block or write some content...';
    },
  }),
  UndoRedo,
];
