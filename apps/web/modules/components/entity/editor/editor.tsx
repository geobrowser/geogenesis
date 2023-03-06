import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CommandExtension } from './commands';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor({
    extensions: [StarterKit, CommandExtension.configure({ suggestion: {} })],
    content: '<p>Hello World! 🌎️</p>',
    editable,
    onUpdate: ({ editor }) => {
      console.log(editor.getHTML());
    },
    onTransaction: ({ state }) => {
      console.log(state.selection.anchor);
    },
  });

  return (
    <div>
      <EditorContent editor={editor} />
      {/* {editor && (
        <ControlledBubbleMenu editor={editor} open={true}>
          Hi Hello
        </ControlledBubbleMenu>
      )} */}
    </div>
  );
};
