import * as React from 'react';
import { Editor, Range } from '@tiptap/core';

import { Config } from '~/modules/config';
import { NetworkData } from '~/modules/io';
import { StorageClient } from '~/modules/services/storage';
import { EditorH1 } from '~/modules/design-system/icons/editor-h1';
import { EditorH2 } from '~/modules/design-system/icons/editor-h2';
import { EditorH3 } from '~/modules/design-system/icons/editor-h3';
import { EditorTable } from '~/modules/design-system/icons/editor-table';
import { EditorText } from '~/modules/design-system/icons/editor-text';
import { EditorImage } from '~/modules/design-system/icons/editor-image';

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
          typeId: props.selectedType.entityId,
          typeName: props.selectedType.entityName,
          spaceId: props.spaceId,
        },
      })
      .createParagraphNear()
      .run();
  },
};

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
  // For now we aren't allowing table blocks until we work on migrating tables to the new design
  // tableCommandItem,
];
