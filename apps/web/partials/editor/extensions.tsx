import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Text from '@tiptap/extension-text';
import { Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';
import Underline from '@tiptap/extension-underline';

import { DataNode } from './data-node';
import { HeadingNode } from './heading-node';
import { ImageNode } from './image-node';
import { ParagraphNode } from './paragraph-node';
import { TrailingNode } from './trailing-node';
import { VideoNode } from './video-node';
import { Web2URLExtension } from './web2-url-extension';
import { GraphLinkExtension, MarkdownLinkExtension } from './graph-link-extension';
import { FloatingToolbarExtension } from './floating-toolbar-extension';

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
  FloatingToolbarExtension,
];
