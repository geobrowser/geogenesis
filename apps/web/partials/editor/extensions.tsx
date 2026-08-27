import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import { BulletList, ListItem } from '@tiptap/extension-list';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';

import { PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT } from '~/core/state/editor/profile-overview-tail-placeholder';

import { CodeBlockNode } from './code-block-node';
import { DataNode } from './data-node';
import { FloatingToolbarExtension } from './floating-toolbar-extension';
import { GraphLinkExtension, MarkdownLinkExtension } from './graph-link-extension';
import { HeadingNode } from './heading-node';
import { ImageNode } from './image-node';
import { InlineCode } from './inline-code';
import { MathNode } from './math-node';
import { ParagraphNode } from './paragraph-node';
import { RankingNode } from './ranking-node';
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
  RankingNode,
  ImageNode,
  VideoNode,
  // showOnlyCurrent stays false because the profile bio tail is a standing
  // invite — it has to render while the caret is elsewhere. The slash hint is
  // gated on `hasAnchor` instead, so only the block the caret sits in shows it.
  // Every empty block showing it would repeat a long line down the document and,
  // since the placeholder `::before` is `height: 0`, overlap the block below
  // once it wraps at narrow widths.
  Placeholder.configure({
    showOnlyCurrent: false,
    placeholder: ({ node, hasAnchor }) => {
      if (node.type.name === 'heading') return 'Heading...';
      if (node.type.name === 'bulletList') return '';
      if (node.type.name === 'codeBlock') return '';
      if (node.type.name === 'paragraph' && node.attrs?.tailPlaceholder) {
        return PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT;
      }
      if (!hasAnchor) return '';
      return 'Write some content or use / to select block type...';
    },
  }),
  UndoRedo,
  FloatingToolbarExtension,
];
