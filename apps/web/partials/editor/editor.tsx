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

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor-store';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { SquareButton } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { Spacer } from '~/design-system/spacer';

import { NoContent } from '../space-tabs/no-content';
import { ConfiguredCommandExtension } from './command-extension';
import { removeIdAttributes } from './editor-utils';
import { HeadingNode } from './heading-node';
import { createIdExtension } from './id-extension';
import { ParagraphNode } from './paragraph-node';
import { TableNode } from './table-node';

interface Props {
  placeholder?: React.ReactNode;
  shouldHandleOwnSpacing?: boolean;
  spacePage?: boolean;
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

export const Editor = React.memo(function Editor({
  shouldHandleOwnSpacing,
  placeholder = null,
  spacePage = false,
}: Props) {
  const { spaceId } = useEntityPageStore();
  const { editorJson, blockIds, updateEditorBlocks } = useEditorStore();
  const editable = useUserIsEditing(spaceId);
  const [hasUpdatedEditorJson, setHasUpdatedEditorJson] = React.useState(false);

  const extensions = React.useMemo(() => [...tiptapExtensions, createIdExtension(spaceId)], [spaceId]);

  const editor = useEditor({
    extensions,
    editable: true,
    content: editorJson,
    editorProps: {
      transformPastedHTML: html => removeIdAttributes(html),
    },
  });

  // Running onBlur directly through the hook executes it twice for some reason.
  // Doing it imperatively here correctly only executes once.
  React.useEffect(() => {
    function onBlur(params: { editor: TiptapEditor }) {
      // Responsible for converting all editor blocks to triples
      // Fires after the IdExtension's onBlur event which sets the "id" attribute on all nodes
      updateEditorBlocks(params.editor);
      setHasUpdatedEditorJson(true);
    }

    // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
    editor?.on('blur', onBlur as unknown as any);

    return () => {
      // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
      editor?.off('blur', onBlur as unknown as any);
    };
  }, [editor, updateEditorBlocks]);

  React.useEffect(() => {
    // We only update the editor with editorJson up until the first time we have made local edits.
    // We don't want to re-render the editor every time content has changed.
    //
    // This is so we ensure we have the most up-to-date content from the local store when first
    // mounting the editor, but after that we don't re-render the editor at all since state
    // is already correctly represented internally by tiptap.
    //
    // Normally this isn't a problem in Tiptap, but since we have custom react block nodes we
    // need to more granularly control when we re-render the editor to avoid janky re-rendering UX.
    if (!hasUpdatedEditorJson) {
      // The timeout is needed to workaround a react error in tiptap
      // https://github.com/ueberdosis/tiptap/issues/3764#issuecomment-1546629928
      setTimeout(() => {
        editor?.commands.setContent(editorJson);
      });
    }

    // Commands is not memoized correctly by tiptap, so we need to disable the rule, else the
    // effect will run infinitely.
    //
    // We shouldn't re-render the editor every time the editorJson changes as that would result
    // in a janky UX. We let the editor handle block ordering state while each block handles it's
    // own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorJson, hasUpdatedEditorJson]);

  // We are in browse mode and there is no content.
  if (!editable && blockIds.length === 0) {
    return (
      <>
        {spacePage && (
          <NoContent
            isEditing={false}
            options={{
              browse: {
                title: 'There’s no space overview here yet',
                description: 'Switch to edit mode to add an overview if you’re an editor of this space!',
                image: '/overview.png',
              },
            }}
          />
        )}
        <span>{placeholder}</span>
      </>
    );
  }

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
