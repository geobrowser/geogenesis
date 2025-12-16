import { Graph } from '@graphprotocol/grc-20';
import { Editor, Range } from '@tiptap/core';

import * as React from 'react';

import { ID } from '~/core/id';
import { getImagePath } from '~/core/utils/utils';

import { EditorH1 } from '~/design-system/icons/editor-h1';
import { EditorH2 } from '~/design-system/icons/editor-h2';
import { EditorH3 } from '~/design-system/icons/editor-h3';
import { EditorImage } from '~/design-system/icons/editor-image';
import { EditorList } from '~/design-system/icons/editor-list';
import { EditorTable } from '~/design-system/icons/editor-table';
import { EditorText } from '~/design-system/icons/editor-text';
import { EditorVideo } from '~/design-system/icons/editor-video';

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
        // Use TESTNET network to upload to Pinata via alternative gateway
        const { id, ops } = await Graph.createImage({
          blob: file,
          network: 'TESTNET',
        });

        // Extract the image URL from the ops - look for UPDATE_ENTITY with ipfs:// value
        let ipfsUrl: string | undefined;
        for (const op of ops) {
          if (op.type === 'UPDATE_ENTITY') {
            const ipfsValue = op.entity.values.find(v => v.value.startsWith('ipfs://'));
            if (ipfsValue) {
              ipfsUrl = ipfsValue.value;
              break;
            }
          }
        }

        const src = ipfsUrl ? getImagePath(ipfsUrl) : '';

        if (src) {
          editor.chain().focus().deleteRange(range).setImage({ src }).run();
        }
      };
      input.click();
    },
  },
  {
    icon: <EditorVideo />,
    title: 'Video',
    command: ({ editor, range }) => {
      // Insert video block - id-extension handles assigning the id
      editor
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .insertContent({
          type: 'video',
        })
        .createParagraphNear()
        .blur()
        .focus()
        .run();
    },
  },
  tableCommandItem,
];
