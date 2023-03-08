import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion/dist/packages/suggestion/src/suggestion';
import type { Instance } from 'tippy.js';
import tippy from 'tippy.js';
import { CommandSuggestionItem, slashCommandItems } from './command-items';
import { CommandList, CommandListRef } from './command-list';

export const CommandExtension = Extension.create<{
  suggestion: Omit<SuggestionOptions<CommandSuggestionItem>, 'editor'>;
}>({
  name: 'commands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command?.({ editor, range, props });
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
      return slashCommandItems
        .filter(v => v.command)
        .filter(v => v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    },
    render() {
      let reactRenderer: ReactRenderer<CommandListRef, CommandSuggestionItem>;
      let popup: Instance[];

      return {
        onStart: props => {
          reactRenderer = new ReactRenderer(CommandList, {
            props,
            editor: props.editor,
          });
          if (!props.clientRect) {
            return;
          }
          popup = tippy('body', {
            getReferenceClientRect: props.clientRect as any, // fixme
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          });
        },

        onUpdate(props) {
          reactRenderer.updateProps(props);

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any, // fixme
          });
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            popup[0].hide();

            return true;
          }

          return reactRenderer?.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          popup[0].destroy();
          reactRenderer.destroy();
        },
      };
    },
  },
});
