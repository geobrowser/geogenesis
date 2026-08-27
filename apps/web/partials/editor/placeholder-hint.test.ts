import { Editor } from '@tiptap/core';
import type { DecorationSet } from '@tiptap/pm/view';

import { afterEach, describe, expect, it } from 'vitest';

import { PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT } from '~/core/state/editor/profile-overview-tail-placeholder';

import { tiptapExtensions } from './extensions';

const SLASH_HINT = 'Write some content or use / to select block type...';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/**
 * Reads the placeholder text TipTap decorates each empty block with, in document
 * order. `null` marks a block that got no placeholder decoration at all.
 */
function placeholdersFor(content: Record<string, unknown>[], caretAt: number) {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: tiptapExtensions,
    content: { type: 'doc', content },
  });

  editor.commands.setTextSelection(caretAt);

  const { state } = editor;
  const byPos = new Map<number, string>();

  for (const plugin of state.plugins) {
    const set = plugin.props.decorations?.call(plugin, state) as DecorationSet | null | undefined;
    for (const decoration of set?.find() ?? []) {
      const placeholder = (decoration as unknown as { type: { attrs?: Record<string, string> } }).type.attrs?.[
        'data-placeholder'
      ];
      if (placeholder !== undefined) byPos.set(decoration.from, placeholder);
    }
  }

  const result: (string | null)[] = [];
  state.doc.forEach((_node, offset) => result.push(byPos.get(offset) ?? null));
  return result;
}

const emptyParagraph = { type: 'paragraph' };

describe('empty block placeholder', () => {
  it('shows the slash hint only on the block holding the caret', () => {
    // Three empty paragraphs; caret inside the second one.
    const placeholders = placeholdersFor([emptyParagraph, emptyParagraph, emptyParagraph], 3);

    expect(placeholders).toEqual(['', SLASH_HINT, '']);
  });

  it('moves the hint with the caret', () => {
    const placeholders = placeholdersFor([emptyParagraph, emptyParagraph, emptyParagraph], 1);

    expect(placeholders).toEqual([SLASH_HINT, '', '']);
  });

  it('keeps the profile bio tail invite visible while the caret is elsewhere', () => {
    const placeholders = placeholdersFor(
      [emptyParagraph, { type: 'paragraph', attrs: { tailPlaceholder: true } }],
      1
    );

    expect(placeholders).toEqual([SLASH_HINT, PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT]);
  });
});
