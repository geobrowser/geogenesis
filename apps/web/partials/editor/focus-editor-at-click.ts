import { Selection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

/**
 * Focuses the editor where the click was, without scrolling: the end of the doc for a click below
 * the last block, otherwise the nearest text at the click's height.
 */
export function focusEditorAtClick(editor: Editor, click: { clientX: number; clientY: number }) {
  const { view } = editor;

  view.dispatch(view.state.tr);

  (view.dom as HTMLElement).focus({ preventScroll: true });

  const box = view.dom.getBoundingClientRect();

  if (click.clientY < box.bottom) {
    const left = Math.min(Math.max(click.clientX, box.left + 1), box.right - 1);
    const found = view.posAtCoords({ left, top: click.clientY });

    if (found) {
      const $pos = view.state.doc.resolve(found.pos);
      const selection = Selection.findFrom($pos, 1, true) ?? Selection.findFrom($pos, -1, true);
      if (selection) return editor.commands.focus(selection.from, { scrollIntoView: false });
    }
  }

  return editor.commands.focus('end', { scrollIntoView: false });
}
