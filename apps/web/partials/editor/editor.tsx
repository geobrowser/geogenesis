'use client';

import { GraphUrl } from '@geogenesis/sdk';
import { EditorContent, Editor as TiptapEditor, useEditor } from '@tiptap/react';
import { Hash } from 'effect';
import { LayoutGroup } from 'framer-motion';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { removeIdAttributes } from '~/core/state/editor/utils';
import { NavUtils } from '~/core/utils/utils';

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

  useInterceptEditorLinks(spaceId);

  const onBlur = (params: { editor: TiptapEditor }) => {
    // Responsible for converting all editor blocks to Geo knowledge graph state
    upsertEditorState(params.editor.getJSON());
  };

  const editor = useEditor(
    {
      extensions,
      editable: true,
      content: editorJson,
      editorProps: {
        transformPastedHTML: html => removeIdAttributes(html),
      },
      immediatelyRender: false,
      onBlur: onBlur,
    },
    [editorJson]
  );

  // We are in browse mode and there is no content.
  if (!editable && blockIds.length === 0) {
    return (
      <>
        {spacePage && (
          <NoContent
            options={{
              image: '/overview.png',
              browse: {
                title: 'There’s no content here yet',
                description: 'Switch to edit mode to add content if you’re an editor of this space!',
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
      <div className={editable ? 'editable' : 'not-editable'}>
        {editor ? <EditorContent editor={editor} /> : <ServerContent content={editorJson.content} />}

        {shouldHandleOwnSpacing && <Spacer height={60} />}
      </div>
    </LayoutGroup>
  );
});

/**
 * Sets up listeners to intercept clicks on links on entity pages and redirect them to the
 * appropriate entity based on the `graph://` URI.
 *
 * This is one of the most hacky ways to do it, but is the least amount of effort to implement
 * for now. Alternative approaches are to use Linkify, which tiptap uses internally, to render
 * the links using a custom React component which can handle the `graph://` protocol, or to
 * somehow render the links as a React component through tiptap itself.
 */
function useInterceptEditorLinks(spaceId: string) {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!target) {
        return;
      }

      // @ts-expect-error target doesn't have "closest" method in types
      const link = target.closest('a');

      if (!link) {
        return;
      }

      // Check if the clicked element is a link
      if (link.tagName === 'A') {
        const originalUrl = link.href;

        if (originalUrl.startsWith('graph://')) {
          // Prevent the default link behavior
          event.stopPropagation();
          event.preventDefault();
          const entityId = GraphUrl.toEntityId(originalUrl);
          router.prefetch(NavUtils.toEntity(spaceId, entityId));
          router.push(NavUtils.toEntity(spaceId, entityId));
        }
      }
    }

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [router, spaceId]);
}
