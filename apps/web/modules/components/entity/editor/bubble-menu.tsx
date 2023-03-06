import { autoUpdate, flip, offset, useFloating } from '@floating-ui/react-dom';
import { Editor, isNodeSelection, posToDOMRect } from '@tiptap/react';
import { ReactNode, useLayoutEffect } from 'react';

type Props = {
  editor: Editor;
  open: boolean;
  children: ReactNode;
};

// Adapted from https://github.com/ueberdosis/tiptap/issues/2305#issuecomment-1020665146
export const ControlledBubbleMenu = ({ editor, open, children }: Props) => {
  const { x, y, strategy, reference, floating } = useFloating({
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    placement: 'top',
    middleware: [
      offset({ mainAxis: 8 }),
      flip({
        padding: 8,
        boundary: editor.options.element,
        fallbackPlacements: ['bottom', 'top-start', 'bottom-start', 'top-end', 'bottom-end'],
      }),
    ],
  });

  useLayoutEffect(() => {
    const { ranges } = editor.state.selection;
    const from = Math.min(...ranges.map(range => range.$from.pos));
    const to = Math.max(...ranges.map(range => range.$to.pos));

    reference({
      getBoundingClientRect() {
        if (isNodeSelection(editor.state.selection)) {
          const node = editor.view.nodeDOM(from) as HTMLElement;

          if (node) {
            return node.getBoundingClientRect();
          }
        }

        console.log('posToDOMRect', posToDOMRect);
        return posToDOMRect(editor.view, from, to);
      },
    });
  }, [reference, editor]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={floating}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x ?? 0,
      }}
    >
      {children}
    </div>
  );
};
