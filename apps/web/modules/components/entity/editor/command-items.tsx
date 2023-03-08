import { Editor } from '@tiptap/react';
import { SuggestionOptions } from '@tiptap/suggestion';
import { EditorH1 } from '~/modules/design-system/icons/editor-h1';
import { EditorH2 } from '~/modules/design-system/icons/editor-h2';
import { EditorH3 } from '~/modules/design-system/icons/editor-h3';
import { EditorTable } from '~/modules/design-system/icons/editor-table';
import { EditorText } from '~/modules/design-system/icons/editor-text';

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement;
  command?: SuggestionOptions<CommandSuggestionItem>['command'];
}

export const slashCommandItems: CommandSuggestionItem[] = [
  {
    icon: <EditorText />,
    title: 'Text',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },

  {
    icon: <EditorH1 />,
    title: 'Heading 1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    icon: <EditorH2 />,
    title: 'Heading 2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    icon: <EditorH3 />,
    title: 'Heading 3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  {
    icon: <EditorTable />,
    title: 'Table',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent('<table-node></table-node><p></p>').run();
    },
  },
];

export const plusCommandItems = (editor: Editor): CommandSuggestionItem[] => [
  {
    icon: <EditorText />,
    title: 'Text',
    command: () => {
      editor.chain().focus().setParagraph().run();
    },
  },

  {
    icon: <EditorH1 />,
    title: 'Heading 1',
    command: () => {
      editor.chain().focus().setNode('heading', { level: 1 }).run();
    },
  },
  {
    icon: <EditorH2 />,
    title: 'Heading 2',
    command: () => {
      editor.chain().focus().setNode('heading', { level: 2 }).run();
    },
  },
  {
    icon: <EditorH3 />,
    title: 'Heading 3',
    command: () => {
      editor.chain().focus().setNode('heading', { level: 3 }).run();
    },
  },
  {
    icon: <EditorTable />,
    title: 'Table',
    command: () => {
      editor.chain().focus().insertContent('<table-node></table-node><p></p>').run();
    },
  },
];
