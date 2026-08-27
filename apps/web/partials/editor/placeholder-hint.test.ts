import { Editor } from '@tiptap/core';

import { describe, expect, it } from 'vitest';

import { PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT } from '~/core/state/editor/profile-overview-tail-placeholder';

import {
  EMPTY_BLOCK_RESTING_TEXT,
  EMPTY_BLOCK_SLASH_HINT,
  resolveBlockPlaceholder,
  tiptapExtensions,
} from './extensions';

const paragraph = {
  nodeName: 'paragraph',
  isTailPlaceholder: false,
  hasAnchor: false,
  isFocused: false,
  isEmpty: false,
};

describe('resolveBlockPlaceholder', () => {
  it('advertises the slash menu on the block being edited', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: true, isFocused: true })).toBe(EMPTY_BLOCK_SLASH_HINT);
  });

  it('says nothing on empty blocks the caret is not in', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: false, isFocused: true })).toBe('');
  });

  // The ProseMirror selection survives blur, so gating on the caret alone would
  // strand the hint on whichever block the user left — and keep it overlapping
  // the block below at widths where the long copy wraps.
  it('drops the hint once the editor loses focus, even on the block that kept the caret', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: true, isFocused: false })).toBe('');
  });

  // Otherwise an untouched, empty entity page renders with nothing to click.
  it('falls back to the short resting copy on a blurred empty document', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: true, isFocused: false, isEmpty: true })).toBe(
      EMPTY_BLOCK_RESTING_TEXT
    );
  });

  // `editor.isEmpty` is true of a document made only of blank paragraphs, so the
  // resting copy has to be scoped to the selection too or every blank line gets it.
  it('keeps the resting copy off the other blank lines of an all-empty document', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: false, isFocused: false, isEmpty: true })).toBe('');
  });

  it('prefers the hint over the resting copy once that empty document is focused', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, hasAnchor: true, isFocused: true, isEmpty: true })).toBe(
      EMPTY_BLOCK_SLASH_HINT
    );
  });

  it('keeps the profile bio tail invite regardless of focus or caret', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, isTailPlaceholder: true })).toBe(
      PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT
    );
  });

  it('leaves the heading placeholder alone', () => {
    expect(resolveBlockPlaceholder({ ...paragraph, nodeName: 'heading' })).toBe('Heading...');
  });
});

/**
 * jsdom cannot give a contenteditable real DOM focus, so `editor.isFocused` is
 * always false here. That happens to be exactly the state this test needs: it
 * pins the blurred behaviour end-to-end, through TipTap's own decoration pass.
 */
describe('placeholder decorations on a blurred editor', () => {
  function renderPlaceholders(content: Record<string, unknown>[], caretAt: number) {
    const element = document.createElement('div');
    const editor = new Editor({ element, extensions: tiptapExtensions, content: { type: 'doc', content } });

    try {
      editor.commands.setTextSelection(caretAt);
      expect(editor.isFocused).toBe(false);

      return Array.from(element.querySelectorAll('[data-placeholder]')).map(node =>
        node.getAttribute('data-placeholder')
      );
    } finally {
      editor.destroy();
    }
  }

  const emptyParagraph = { type: 'paragraph' };
  const writtenParagraph = { type: 'paragraph', content: [{ type: 'text', text: 'written' }] };

  it('strands no hint on the block that kept the caret', () => {
    // Caret in the first empty block, editor blurred.
    expect(renderPlaceholders([writtenParagraph, emptyParagraph, emptyParagraph], 10)).toEqual(['', '']);
  });

  it('still invites input on an empty document', () => {
    expect(renderPlaceholders([emptyParagraph], 1)).toEqual([EMPTY_BLOCK_RESTING_TEXT]);
  });

  it('invites input once, not on every blank line of an all-empty document', () => {
    // The whole document is blank, so `editor.isEmpty` is true for all three.
    expect(renderPlaceholders([emptyParagraph, emptyParagraph, emptyParagraph], 1)).toEqual([
      EMPTY_BLOCK_RESTING_TEXT,
      '',
      '',
    ]);
  });
});
