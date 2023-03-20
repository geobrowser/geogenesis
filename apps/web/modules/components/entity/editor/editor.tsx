import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SquareButton } from '~/modules/design-system/button';
import { useEntityStore } from '~/modules/entity';
import { ConfiguredCommandExtension } from './command-extension';
import { removeIdAttributes } from './editor-utils';
import { IdExtension } from './id-extension';
import { TableNode } from './table-node';

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
      const isHeading = node.type.name === 'heading';
      return isHeading ? 'Heading...' : '/ to select content block or write some content...';
    },
  }),
  IdExtension,
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
      editorProps: {
        transformPastedHTML: html => removeIdAttributes(html),
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
