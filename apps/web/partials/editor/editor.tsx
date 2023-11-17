'use client';

import BulletList from '@tiptap/extension-bullet-list';
import Gapcursor from '@tiptap/extension-gapcursor';
import HardBreak from '@tiptap/extension-hard-break';
import Image from '@tiptap/extension-image';
import ListItem from '@tiptap/extension-list-item';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, FloatingMenu, Editor as TiptapEditor, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import * as React from 'react';

import { useHydrated } from '~/core/hooks/use-hydrated';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor-store';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { SquareButton } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { Spacer } from '~/design-system/spacer';

import { ConfiguredCommandExtension } from './command-extension';
import { removeIdAttributes } from './editor-utils';
import { HeadingNode } from './heading-node';
import { createIdExtension } from './id-extension';
import { ParagraphNode } from './paragraph-node';
import { TableNode } from './table-node';

interface Props {
  placeholder?: React.ReactNode;
  shouldHandleOwnSpacing?: boolean;
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

export const Editor = React.memo(function Editor({ shouldHandleOwnSpacing, placeholder = null }: Props) {
  const { spaceId } = useEntityPageStore();
  const { editorJson, blockIds, updateEditorBlocks } = useEditorStore();
  const editable = useUserIsEditing(spaceId);

  const extensions = React.useMemo(() => [...tiptapExtensions, createIdExtension(spaceId)], [spaceId]);

  const editor = useEditor(
    {
      extensions,
      editable: true,
      content: editorJson,
      editorProps: {
        transformPastedHTML: html => removeIdAttributes(html),
      },
    },
    []
  );

  // Running onBlur directly through the hook executes it twice for some reason.
  // Doing it imperatively here correctly only executes once.
  React.useEffect(() => {
    function onBlur(params: { editor: TiptapEditor }) {
      // Responsible for converting all editor blocks to triples
      // Fires after the IdExtension's onBlur event which sets the "id" attribute on all nodes
      updateEditorBlocks(params.editor);
    }

    // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
    editor?.on('blur', onBlur as unknown as any);

    return () => {
      // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
      editor?.off('blur', onBlur as unknown as any);
    };
  }, [editor, updateEditorBlocks]);

  // @HACK: Janky but works for now.
  //
  // We only want to render the editor once the editorJson has been hydrated with local data.
  // We shouldn't re-render the editor every time the editorJson changes as that would result
  // in a janky UX. We let the editor handle block ordering state while each block handles it's
  // own state.
  //
  // We do content hydration here instead of in useEditor as re-running useEditor will result
  // in completely remounting the entire editor. This will cause all tables to re-fetch data
  // and might result in some runtime DOM errors if the update happens out-of-sync with React.
  const hydrated = useHydrated();

  React.useEffect(() => {
    // The timeout is needed to workaround a react error in tiptap
    // https://github.com/ueberdosis/tiptap/issues/3764#issuecomment-1546629928
    setTimeout(() => {
      editor?.commands.setContent(editorJson);
    });

    // Commands is not memoized correctly by tiptap, so we need to disable the rule, else the
    // effect will run infinitely.
    //
    // We shouldn't re-render the editor every time the editorJson changes as that would result
    // in a janky UX. We let the editor handle block ordering state while each block handles it's
    // own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, editorJson]);

  // We are in edit mode and there is no content.
  if (!editable && blockIds.length === 0) return <span>{placeholder}</span>;

  if (!editor) return null;

  const openCommandMenu = () => editor?.chain().focus().insertContent('/').run();

  return (
    <div>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>
        <div className="absolute -left-12 -top-3">
          <SquareButton onClick={openCommandMenu} icon={<Plus />} />
        </div>
      </FloatingMenu>
      {shouldHandleOwnSpacing && <Spacer height={60} />}
    </div>
  );
});
