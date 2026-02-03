import { Graph } from '@geoprotocol/geo-sdk';
import { Editor, Range, ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';

import * as React from 'react';

import { getImagePath } from '~/core/utils/utils';

import { EditorH1 } from '~/design-system/icons/editor-h1';
import { EditorH2 } from '~/design-system/icons/editor-h2';
import { EditorH3 } from '~/design-system/icons/editor-h3';
import { EditorImage } from '~/design-system/icons/editor-image';
import { EditorList } from '~/design-system/icons/editor-list';
import { EditorTable } from '~/design-system/icons/editor-table';
import { EditorText } from '~/design-system/icons/editor-text';
import { EditorVideo } from '~/design-system/icons/editor-video';
import { Link } from '~/design-system/icons/link';

import { MentionList } from './mention-list';
import { insertGraphLink } from './insert-graph-link';

// Function to show MentionList for link selection
const showLinkMentionList = (
  editor: Editor,
  onSelectEntity: (entityId: string, entityName: string) => void,
  spaceId = 'default'
) => {
  // Get current cursor position
  const { from } = editor.state.selection;

  const reactRenderer = new ReactRenderer(MentionList, {
    props: {
      spaceId,
      editor,
      command: (entityId: string, entityName: string) => {
        onSelectEntity(entityId, entityName);
        popup.destroy();
        reactRenderer.destroy();
      },
      onEscape: () => {
        popup.destroy();
        reactRenderer.destroy();
      },
    },
    editor,
  });

  // Create popup at cursor position with fixed positioning
  const popup = tippy(document.body, {
    getReferenceClientRect: () => {
      const start = editor.view.coordsAtPos(from);
      return {
        top: start.top,
        left: start.left,
        bottom: start.bottom,
        right: start.left,
        width: 0,
        height: start.bottom - start.top,
        x: start.left,
        y: start.top,
        toJSON: () => ({}),
      } as DOMRect;
    },
    appendTo: () => document.body,
    content: reactRenderer.element,
    showOnCreate: true,
    interactive: true,
    trigger: 'manual',
    placement: 'bottom-start',
    theme: 'light',
    arrow: false,
    offset: [0, 8],
    maxWidth: 420,
    zIndex: 9999,
  });
};

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement<any>;
  command: (props: { editor: Editor; range: Range }) => void;
}



// Backward compatibility functions for EntitySearchModal
let globalEntitySelectCallback: ((entityId: string, entityName: string) => void) | null = null;
const globalSpaceId: string = 'default';

// Export function to be called from React components (backward compatibility)
export const handleEntitySelect = (entityId: string, entityName: string) => {
  if (globalEntitySelectCallback) {
    globalEntitySelectCallback(entityId, entityName);
    globalEntitySelectCallback = null;
  }
};

export const getGlobalSpaceId = () => globalSpaceId;

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

export const getCommandItems = (spaceId: string): CommandSuggestionItem[] => [
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

        // Extract the image URL from the ops - look for createEntity with ipfs:// value
        let ipfsUrl: string | undefined;
        for (const op of ops) {
          if (op.type === 'createEntity') {
            // Type assertion for new SDK format
            const values = (op as unknown as { values: Array<{ value: { type: string; value?: string } }> }).values;
            const ipfsValue = values?.find(pv => {
              const val = pv.value?.value;
              return typeof val === 'string' && val.startsWith('ipfs://');
            });
            if (ipfsValue) {
              ipfsUrl = ipfsValue.value?.value;
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
  {
    icon: <Link />,
    title: 'Link',
    command: ({ editor, range }) => {
      // Delete the "/" trigger first
      editor.chain().focus().deleteRange(range).run();

      // Use passed spaceId
      const currentSpaceId = spaceId;

      // Show MentionList for link selection
      showLinkMentionList(editor, (entityId: string, entityName: string) => {
        // Insert entity link using shared function with data attributes
        insertGraphLink({
          editor,
          entityId,
          linkText: entityName,
          spaceId: currentSpaceId,
        });
      }, currentSpaceId);
    },
  },
  tableCommandItem,
];

// For backward compatibility if needed
export const commandItems = getCommandItems('default');
