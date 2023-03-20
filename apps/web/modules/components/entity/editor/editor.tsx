import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SquareButton } from '~/modules/design-system/button';
import { useEntityStore } from '~/modules/entity';
import { ConfiguredCommandExtension } from './command-extension';
import { TableNode } from './table-node';
import { UUIDExtension } from './uuid-extension';

interface Props {
  editable?: boolean;
}

export const tiptapExtensions = [
  StarterKit,
  ConfiguredCommandExtension,
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
  UUIDExtension,
];

export const Editor = ({ editable = true }: Props) => {
  const entityStore = useEntityStore();

  const editor = useEditor(
    {
      extensions: tiptapExtensions,
      editable: editable,
      content: entityStore.editorJson,
      onBlur({ editor }) {
        entityStore.updateEditorBlocks(editor);
      },
    },
    [editable, entityStore.editorJson] /* 
    Only set the editor's content once when editable content becomes available or when the editor switches editable states
    Because the entity-store sets the ID attribute of the editor's content, we need to re-render the editor when the editorJson changes
    so we don't create generate new IDs and triples for the same content
    */
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
