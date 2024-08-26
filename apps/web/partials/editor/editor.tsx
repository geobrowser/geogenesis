'use client';

import { EditorContent, Editor as TiptapEditor, useEditor } from '@tiptap/react';
import cx from 'classnames';
import { LayoutGroup } from 'framer-motion';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/editor-store';
import { removeIdAttributes } from '~/core/state/editor/utils';

import { Spacer } from '~/design-system/spacer';

import { NoContent } from '../space-tabs/no-content';
import { tiptapExtensions } from './extensions';
import { createIdExtension } from './id-extension';
import { ServerContent } from './server-content';

interface Props {
  spaceId: string;
  placeholder?: React.ReactNode;
  shouldHandleOwnSpacing?: boolean;
  spacePage?: boolean;
}

export const Editor = React.memo(function Editor({
  shouldHandleOwnSpacing,
  spaceId,
  placeholder = null,
  spacePage = false,
}: Props) {
  const { upsertEditorState, editorJson, blockIds } = useEditorStore();
  const editable = useUserIsEditing(spaceId);

  const extensions = React.useMemo(() => [...tiptapExtensions, createIdExtension(spaceId)], [spaceId]);

  const editor = useEditor({
    extensions,
    editable: true,
    content: editorJson,
    editorProps: {
      transformPastedHTML: html => removeIdAttributes(html),
    },
  });

  const onBlur = React.useCallback(
    (params: { editor: TiptapEditor }) => {
      // Responsible for converting all editor blocks to triples
      // Fires after the IdExtension's onBlur event which sets the "id" attribute on all nodes
      upsertEditorState(params.editor.getJSON());
    },
    [upsertEditorState]
  );

  // Running onBlur directly through the hook executes it twice for some reason.
  // Doing it imperatively here correctly only executes once.
  React.useEffect(() => {
    // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
    editor?.on('blur', onBlur as unknown as any);

    return () => {
      // Tiptap doesn't export the needed type APIs for us to be able to make this typesafe
      editor?.off('blur', onBlur as unknown as any);
    };
  }, [onBlur, editor]);

  // We are in browse mode and there is no content.
  if (!editable && blockIds.length === 0) {
    return (
      <>
        {spacePage && (
          <NoContent
            options={{
              image: '/overview.png',
              browse: {
                title: 'There’s no space overview here yet',
                description: 'Switch to edit mode to add an overview if you’re an editor of this space!',
              },
            }}
            isEditing={false}
          />
        )}
        <span>{placeholder}</span>
      </>
    );
  }

  return (
    <LayoutGroup id="editor">
      <div className={cx(editable ? 'editable' : 'not-editable')}>
        {!editor ? <ServerContent content={editorJson.content} /> : <EditorContent editor={editor} />}

        {shouldHandleOwnSpacing && <Spacer height={60} />}
      </div>
    </LayoutGroup>
  );
});
