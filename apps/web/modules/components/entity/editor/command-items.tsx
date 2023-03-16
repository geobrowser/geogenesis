import { Editor, Range } from '@tiptap/core';
import { EditorH1 } from '~/modules/design-system/icons/editor-h1';
import { EditorH2 } from '~/modules/design-system/icons/editor-h2';
import { EditorH3 } from '~/modules/design-system/icons/editor-h3';
import { EditorTable } from '~/modules/design-system/icons/editor-table';
import { EditorText } from '~/modules/design-system/icons/editor-text';

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement;
  command: (props: { editor: Editor; range: Range; props?: any }) => void;
}

export const commandItems: CommandSuggestionItem[] = [
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
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'tableNode',
          attrs: {
            typeId: props.selectedType.entityId,
            typeName: props.selectedType.entityName,
            spaceId: props.spaceId,
          },
        })
        .createParagraphNear()
        .run();
    },
  },
];
