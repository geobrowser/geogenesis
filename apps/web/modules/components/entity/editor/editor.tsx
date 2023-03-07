import UniqueID from '@tiptap-pro/extension-unique-id';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ConfiguredCommandExtension } from './command-extension';
import { TableNode } from './table-node';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ConfiguredCommandExtension,
      TableNode,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Heading...';
          }

          return '/ to select content block or write some content...';
        },
      }),
      UniqueID.configure({
        types: ['tableNode', 'p', 'h1', 'h2', 'h3'],
      }),
    ],

    editable,
    onUpdate: ({ editor }) => {
      console.log(editor.getJSON());
    },
  });

  return <EditorContent editor={editor} />;
};
