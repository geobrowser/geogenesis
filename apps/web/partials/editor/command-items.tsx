import { Editor, Range } from '@tiptap/core';

import * as React from 'react';

import { IpfsClient } from '~/core/io/ipfs-client';
import { getImagePath } from '~/core/utils/utils';

import { EditorH1 } from '~/design-system/icons/editor-h1';
import { EditorH2 } from '~/design-system/icons/editor-h2';
import { EditorH3 } from '~/design-system/icons/editor-h3';
import { EditorImage } from '~/design-system/icons/editor-image';
import { EditorList } from '~/design-system/icons/editor-list';
import { EditorTable } from '~/design-system/icons/editor-table';
import { EditorText } from '~/design-system/icons/editor-text';

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement<any>;
  command: (props: { editor: Editor; range: Range }) => void;
}

const tableCommandItem: CommandSuggestionItem = {
  icon: <EditorTable />,
  title: 'Data',
  command: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange({ from: range.from, to: range.to })
      .insertContent({
        type: 'tableNode',
      })
      .createParagraphNear()
      .blur()
      .focus()
      .run();
  },
};

const textCommandItem: CommandSuggestionItem = {
  icon: <EditorText />,
  title: 'Text',
  command: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'paragraph',
      })
      .createParagraphNear()
      .blur()
      .focus()
      .run();
  },
};

export const commandItems: CommandSuggestionItem[] = [
  // {
  //   icon: <EditorText />,
  //   title: 'Text',
  //   command: ({ editor, range }) => {
  //     editor.chain().focus().deleteRange(range).setParagraph().run();
  //   },
  // },
  textCommandItem,
  {
    icon: <EditorList />,
    title: 'List',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
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
    icon: <EditorImage />,
    title: 'Image',
    command: async ({ editor, range }) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png, image/jpeg';
      input.className = 'hidden';
      input.onchange = async (e: any) => {
        if (!e?.target?.files?.[0]) return;
        const file = e.target.files[0];
        const ipfsUri = await IpfsClient.uploadFile(file);
        const src = getImagePath(ipfsUri);

        editor.chain().focus().deleteRange(range).setImage({ src }).run();
      };
      input.click();
    },
  },
  tableCommandItem,
];
