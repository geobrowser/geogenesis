'use client';

import * as React from 'react';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import Gapcursor from '@tiptap/extension-gapcursor';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';

import { SquareButton } from '~/design-system/button';
import { Spacer } from '~/design-system/spacer';
import { ConfiguredCommandExtension } from './command-extension';
import { removeIdAttributes } from './editor-utils';
import { createIdExtension } from './id-extension';
import { TableNode } from './table-node';
import { ParagraphNode } from './paragraph-node';
import { HeadingNode } from './heading-node';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';

interface Props {
  editable?: boolean;
}

export const tiptapExtensions = [
  StarterKit.configure({
    paragraph: false,
    heading: false,
    code: false,
  }),
  ParagraphNode,
  HeadingNode,
  ConfiguredCommandExtension,
  Gapcursor,
  HardBreak.extend({
    addKeyboardShortcuts() {
      // Make hard breaks behave like normal paragraphs
      const handleEnter = () =>
        this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]);

      return {
        Enter: handleEnter,
        'Mod-Enter': handleEnter,
        'Shift-Enter': handleEnter,
      };
    },
  }),
  BulletList,
  ListItem,
  TableNode,
  Image,
  Placeholder.configure({
    placeholder: ({ node }) => {
      const isHeading = node.type.name === 'heading';
      return isHeading ? 'Heading...' : '/ to select content block or write some content...';
    },
  }),
];

export const Editor = React.memo(function Editor({ editable = true }: Props) {
  const { editorJson, spaceId, updateEditorBlocks, blockIds } = useEntityPageStore();

  // @HACK: Janky but works for now.
  //
  // We only want to render the editor once the editorJson has been hydrated with local data.
  // We shouldn't re-render the editor every time the editorJson changes as that would result
  // in a janky UX. We let the editor handle block state internally while each block handles
  // it's own state.
  const hasHydrated = useHydrated();

  const editor = useEditor(
    {
      extensions: [...tiptapExtensions, createIdExtension(spaceId)],
      editable: true,
      content: editorJson,
      onBlur({ editor }) {
        // Responsible for converting all editor blocks to triples
        // Fires after the IdExtension's onBlur event which sets the "id" attribute on all nodes
        updateEditorBlocks(editor);
      },
      editorProps: {
        transformPastedHTML: html => removeIdAttributes(html),
      },
    },
    [hasHydrated]
  );

  // We are in edit mode and there is no content.
  if (!editable && blockIds.length === 0) return null;

  if (!editor) return null;

  const openCommandMenu = () => editor?.chain().focus().insertContent('/').run();

  return (
    <div>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>
        <div className="absolute -left-12 -top-3">
          <SquareButton onClick={openCommandMenu} icon="plus" />
        </div>
      </FloatingMenu>
      {/*
        Right now this component adds its own space below it. It's only used on the
        entity page so this styling is universal. Eventually we want the callsite
        to provide layout styling and not the component itself.
       */}
      <Spacer height={60} />
    </div>
  );
});
