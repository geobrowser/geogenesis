import * as React from 'react';
import { Editor, Range } from '@tiptap/core';

import { Config } from '~/core/environment';
import { NetworkData } from '~/core/io';
import { StorageClient } from '~/core/io/storage';
import { EditorH1 } from '~/design-system/icons/editor-h1';
import { EditorH2 } from '~/design-system/icons/editor-h2';
import { EditorH3 } from '~/design-system/icons/editor-h3';
import { EditorTable } from '~/design-system/icons/editor-table';
import { EditorText } from '~/design-system/icons/editor-text';
import { EditorList } from '~/design-system/icons/editor-list';
import { EditorImage } from '~/design-system/icons/editor-image';

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement;
  command: (props: { editor: Editor; range: Range; props?: any }) => void;
}

export const tableCommandItem: CommandSuggestionItem = {
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
          spaceId: props.spaceId,
          typeId: props.selectedType.entityId,
          typeName: props.selectedType.entityName,
        },
      })
      .createParagraphNear()
      .blur()
      .focus()
      .run();
  },
};

export const textCommandItem: CommandSuggestionItem = {
  icon: <EditorText />,
  title: 'Text',
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'paragraph',
        attrs: {
          spaceId: props.spaceId,
        },
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

        // It doesn't really matter which configuration we use here since all IPFS
        // nodes are essentially production.
        const chainId = Config.options.production.chainId;
        const config = Config.getConfig(chainId);
        const storageClient = new StorageClient(config.ipfs);
        const network = new NetworkData.Network(storageClient, config.subgraph);
        const src = await network.uploadFile(file);
        editor.chain().focus().deleteRange(range).setImage({ src }).run();
      };
      input.click();
    },
  },
  tableCommandItem,
];
