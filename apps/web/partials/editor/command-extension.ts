import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';

import { CommandSuggestionItem, commandItems } from './command-items';
import { CommandList } from './command-list';

const CommandExtension = Extension.create<{
  suggestion: Omit<SuggestionOptions<CommandSuggestionItem>, 'editor'>;
}>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command?.({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// Inspired By https://github.com/wenerme/wode/blob/b66696f9ba60038e9b86b62e2624aa36e4e91524/apps/demo/src/contents/TipTap/TipTapPageContent.tsx
export const ConfiguredCommandExtension = CommandExtension.configure({
  suggestion: {
    items: ({ query }) => {
      // Allows us to filter the suggestion items by typing immediately after opening the command menu
      return commandItems
        .filter(v => v.command)
        .filter(v => v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    },
    render() {
      let reactRenderer: ReactRenderer<any, any>;
      let popup: HTMLDivElement;

      return {
        onStart: props => {
          reactRenderer = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });
          if (!props.clientRect) {
            return;
          }

          popup = document.createElement('div');
          popup.style.position = 'absolute';
          popup.style.zIndex = '9999';
          popup.appendChild(reactRenderer.element);
          document.body.appendChild(popup);

          updatePosition(popup, props.clientRect as () => DOMRect | null);
        },

        onUpdate(props) {
          reactRenderer.updateProps(props);

          if (props.clientRect) {
            updatePosition(popup, props.clientRect as () => DOMRect | null);
          }
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            popup.style.display = 'none';
            return true;
          }

          return reactRenderer?.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup.remove();
          reactRenderer.destroy();
        },
      };
    },
  },
});

function updatePosition(popup: HTMLDivElement, clientRect: () => DOMRect | null) {
  const rect = clientRect();
  if (!rect) return;

  const virtualEl = {
    getBoundingClientRect: () => rect,
  };

  computePosition(virtualEl, popup, {
    placement: 'bottom-start',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    Object.assign(popup.style, {
      left: `${x}px`,
      top: `${y}px`,
      display: 'block',
    });
  });
}
