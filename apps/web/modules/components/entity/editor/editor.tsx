import UniqueID from '@tiptap-pro/extension-unique-id';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ConfiguredCommandExtension } from './command-extension';
import { TableNode } from './table-node';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor(
    {
      extensions: [
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
        UniqueID.configure({
          types: ['tableNode', 'p', 'heading'],
        }),
      ],
      editable,
      onUpdate: ({ editor }) => {
        // console.log(editor.getJSON());
      },
      onBlur({ editor, event }) {
        // The editor isn’t focused anymore.
      },
    },
    [editable]
  );

  return <EditorContent editor={editor} />;
};
