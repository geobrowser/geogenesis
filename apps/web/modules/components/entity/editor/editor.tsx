import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello World! 🌎️</p>',
    editable,
  });

  return <EditorContent editor={editor} />;
};
