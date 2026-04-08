import { Editor, Range, ReactRenderer } from '@tiptap/react';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

import * as React from 'react';

import { EditorCode } from '~/design-system/icons/editor-code';
import { EditorFormula } from '~/design-system/icons/editor-formula';
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

// ============================================================================
// Constants
// ============================================================================

const POPUP_OFFSET = 8;
const POPUP_MAX_WIDTH = 420;
const POPUP_Z_INDEX = 9999;

// ============================================================================
// Helper Functions
// ============================================================================

// Function to show MentionList for link selection
const showLinkMentionList = (
  editor: Editor,
  onSelectEntity: (entityId: string, entityName: string) => void,
  spaceId = 'default'
) => {
  const { from } = editor.state.selection;

  // Filled after the popup is created; referenced in cleanup.
  let stopAutoUpdate: (() => void) | null = null;

  const reactRenderer = new ReactRenderer(MentionList, {
    props: {
      spaceId,
      editor,
      command: (entityId: string, entityName: string) => {
        onSelectEntity(entityId, entityName);
        cleanup();
      },
      onEscape: () => {
        cleanup();
      },
    },
    editor,
  });

  // Create popup container. top/left are initialised to 0 so the fixed
  // element is placed at the origin before computePosition applies the
  // final coordinates, preventing a flash at an arbitrary position.
  const popupElement = document.createElement('div');
  popupElement.style.position = 'fixed';
  popupElement.style.top = '0';
  popupElement.style.left = '0';
  popupElement.style.zIndex = String(POPUP_Z_INDEX);
  popupElement.style.maxWidth = `${POPUP_MAX_WIDTH}px`;
  document.body.appendChild(popupElement);

  // Append the renderer element to our popup container
  if (reactRenderer?.element) {
    popupElement.appendChild(reactRenderer.element);
  }

  // Stable virtual element whose getBoundingClientRect is always live so
  // that every scroll-triggered recompute reflects the real cursor position
  // rather than the stale snapshot taken at call time.
  // contextElement enables autoUpdate to traverse the editor's ancestor chain.
  const virtualRef = {
    getBoundingClientRect: (): DOMRect => {
      const coords = editor.view.coordsAtPos(from);
      return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
    },
    contextElement: editor.view.dom as Element,
  };

  // strategy:'fixed' is required because the popup uses `position:fixed`.
  // Without it, computePosition returns document-relative coordinates that
  // cause the popup to drift during scroll.
  const updatePosition = () => {
    computePosition(virtualRef, popupElement, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [offset(POPUP_OFFSET), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popupElement.style.left = `${x}px`;
      popupElement.style.top = `${y}px`;
    });
  };

  // autoUpdate calls updatePosition immediately on start and subscribes to
  // scroll, resize, and layout-shift events for continuous position tracking.
  // Its cleanup function is stored for removal when the popup is dismissed.
  stopAutoUpdate = autoUpdate(virtualRef, popupElement, updatePosition);

  // Cleanup: stops autoUpdate listeners, removes popup, destroys renderer.
  const cleanup = () => {
    if (stopAutoUpdate) {
      stopAutoUpdate();
      stopAutoUpdate = null;
    }
    popupElement.remove();
    reactRenderer.destroy();
  };
};

// ============================================================================
// Types
// ============================================================================

export interface CommandSuggestionItem {
  title: string;
  icon: React.ReactElement<any>;
  command: (props: { editor: Editor; range: Range }) => void;
}

// ============================================================================
// Backward Compatibility
// ============================================================================

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

// ============================================================================
// Command Items
// ============================================================================

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
    icon: <EditorCode />,
    title: 'Code Block',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run();
    },
  },
  {
    icon: <EditorFormula />,
    title: 'Formula',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'inlineMath',
          attrs: { latex: 'x^2' },
        })
        .run();
    },
  },
  {
    icon: <EditorImage />,
    title: 'Image',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange({ from: range.from, to: range.to })
        .insertContent({
          type: 'image',
        })
        .createParagraphNear()
        .blur()
        .focus()
        .run();
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
