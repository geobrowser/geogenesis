import UniqueID from '@tiptap-pro/extension-unique-id';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo } from 'react';
import { SquareButton } from '~/modules/design-system/button';
import { useEntityStore } from '~/modules/entity';
import { ConfiguredCommandExtension } from './command-extension';
import { TableNode } from './table-node';

interface Props {
  spaceId: string;
  editable?: boolean;
}

export const Editor = ({ editable = true, spaceId, blocks }: Props) => {
  const entityStore = useEntityStore();

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
      content: entityStore.editorContentFromBlocks(blocks),
      onBlur({ editor }) {
        entityStore.updateEditorBlocks(editor);
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
