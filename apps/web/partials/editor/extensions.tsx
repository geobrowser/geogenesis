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

export const EMPTY_BLOCK_SLASH_HINT = 'Write some content or use / to select block type...';
export const EMPTY_BLOCK_RESTING_TEXT = 'Add content...';

type BlockPlaceholderInput = {
  nodeName: string;
  isTailPlaceholder: boolean;
  /** The caret sits in this block. Survives blur, so it is not enough on its own. */
  hasAnchor: boolean;
  /** The editor holds DOM focus. */
  isFocused: boolean;
  /** The whole document is empty, not just this block. */
  isEmpty: boolean;
};

/**
 * Picks the placeholder for one empty block.
 *
 * Only the block actually being edited advertises the slash menu. Showing it on
 * every empty block repeats a long line down the document, and because the
 * placeholder `::before` is `height: 0`, a hint that wraps at narrow widths
 * overlaps the block below it.
 */
export function resolveBlockPlaceholder({
  nodeName,
  isTailPlaceholder,
  hasAnchor,
  isFocused,
  isEmpty,
}: BlockPlaceholderInput): string {
  if (nodeName === 'heading') return 'Heading...';
  if (nodeName === 'bulletList') return '';
  if (nodeName === 'codeBlock') return '';

  // The profile bio tail is a standing invite — it has to render while the caret
  // is elsewhere, which is also why `showOnlyCurrent` stays false below.
  if (nodeName === 'paragraph' && isTailPlaceholder) return PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT;

  if (isFocused && hasAnchor) return EMPTY_BLOCK_SLASH_HINT;

  // Nothing is being edited, so an otherwise empty document would render with no
  // affordance at all. Keep the short resting copy for that one case; it is too
  // short to wrap, so it cannot overlap the way the hint would.
  if (isEmpty) return EMPTY_BLOCK_RESTING_TEXT;

  return '';
}

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
  // showOnlyCurrent stays false so the profile bio tail keeps rendering while the
  // caret is elsewhere; TipTap applies that option to every node, so the slash
  // hint is scoped inside resolveBlockPlaceholder instead.
  Placeholder.configure({
    showOnlyCurrent: false,
    placeholder: ({ editor, node, hasAnchor }) =>
      resolveBlockPlaceholder({
        nodeName: node.type.name,
        isTailPlaceholder: Boolean(node.attrs?.tailPlaceholder),
        hasAnchor,
        isFocused: editor.isFocused,
        isEmpty: editor.isEmpty,
      }),
  }),
  UndoRedo,
  FloatingToolbarExtension,
];
