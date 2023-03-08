import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion/dist/packages/suggestion/src/suggestion';
import type React from 'react';
import type { Instance } from 'tippy.js';
import tippy from 'tippy.js';
import { EditorH1 } from '~/modules/design-system/icons/editor-h1';
import { EditorH2 } from '~/modules/design-system/icons/editor-h2';
import { EditorH3 } from '~/modules/design-system/icons/editor-h3';
import { EditorTable } from '~/modules/design-system/icons/editor-table';
import { EditorText } from '~/modules/design-system/icons/editor-text';
import { CommandList, CommandListRef } from './command-list';

export interface CommandSuggestionItem {
  title: string;
  group?: string;
  icon: React.ReactElement;
  description?: string;
  command?: SuggestionOptions<CommandSuggestionItem>['command'];
}

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
      const items: CommandSuggestionItem[] = [
        {
          icon: <EditorText />,
          title: 'Text',
          description: 'Just start writing with plain text.',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setParagraph().run();
          },
        },

        {
          icon: <EditorH1 />,
          title: 'Heading 1',
          description: 'Big section heading.',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
          },
        },
        {
          icon: <EditorH2 />,
          title: 'Heading 2',
          description: 'Medium section heading.',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
          },
        },
        {
          icon: <EditorH3 />,
          title: 'Heading 3',
          description: 'Small section heading.',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
          },
        },
        {
          icon: <EditorTable />,
          title: 'Table',
          description: 'Table.',
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).insertContent('<table-node></table-node><p></p>').run();
          },
        },
      ];
      return items.filter(v => v.command).filter(v => v.title.includes(query) || v.description?.includes(query));
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
