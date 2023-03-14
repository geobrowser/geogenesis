import UniqueID from '@tiptap-pro/extension-unique-id';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';
import { useActionsStore } from '~/modules/action';
import { SquareButton } from '~/modules/design-system/button';
import { useEntityStore } from '~/modules/entity';
import { useEditEvents } from '../edit-events';
import { ConfiguredCommandExtension } from './command-extension';
import { tiptapJsonToTriples } from './editor-utils';
import { TableNode } from './table-node';

interface Props {
  spaceId: string;
  editable?: boolean;
  entityId: string;
  name: string;
}

export const Editor = ({ editable = true, spaceId, entityId, name }: Props) => {
  const { triples: localTriples, update, create, remove } = useEntityStore();

  const { actions } = useActionsStore(spaceId);

  // const triples = localTriples.length === 0 && actions.length === 0 ? serverTriples : localTriples;

  const send = useEditEvents({
    context: {
      entityId,
      spaceId: spaceId,
      entityName: name,
    },
    api: {
      create,
      update,
      remove,
    },
  });

  const allExtensions = useMemo(
    () => [
      StarterKit,
      ConfiguredCommandExtension(spaceId),
      TableNode,
      Image,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Heading...';
          }

          return '/ to select content block or write some content...';
        },
      }),
      UniqueID.configure({
        types: ['tableNode', 'paragraph', 'heading'],
      }),
    ],
    [spaceId]
  );

  const editor = useEditor(
    {
      extensions: allExtensions,
      editable,

      onBlur({ editor }) {
        const { content } = editor.getJSON();
        if (content) {
          console.log(tiptapJsonToTriples({ content, extensions: allExtensions, spaceId, entityId }));
        }
      },
    },
    [editable]
  );

  return editor ? (
    <>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>
        <div className="absolute -left-12 -top-3">
          <SquareButton onClick={() => editor.chain().focus().insertContent('/').run()} icon="plus" />
        </div>
      </FloatingMenu>
    </>
  ) : null;
};
