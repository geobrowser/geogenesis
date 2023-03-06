import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ConfiguredCommandExtension } from './commands';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor({
    extensions: [StarterKit, ConfiguredCommandExtension],
    content: '<p>Hello World! 🌎️</p>',
    editable,
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
