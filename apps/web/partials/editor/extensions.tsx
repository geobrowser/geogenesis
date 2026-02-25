import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Text from '@tiptap/extension-text';
import { Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';

import { ConfiguredCommandExtension } from './command-extension';
import { DataNode } from './data-node';
import { HeadingNode } from './heading-node';
import { ImageNode } from './image-node';
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
  DataNode,
  ImageNode,
  VideoNode,
  Placeholder.configure({
    placeholder: ({ node }) => {
      const isHeading = node.type.name === 'heading';
      return isHeading ? 'Heading...' : '/ to select content block or write some content...';
    },
  }),
  UndoRedo,
];
