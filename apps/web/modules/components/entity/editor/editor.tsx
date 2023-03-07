import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ConfiguredCommandExtension } from './commands';
import { TableNode } from './table-node';

interface Props {
  editable?: boolean;
}

export const Editor = ({ editable = true }: Props) => {
  const editor = useEditor({
    extensions: [StarterKit, ConfiguredCommandExtension, TableNode],
    content: `
    <p>
      This is still the text editor you’re used to, but enriched with node views.
    </p>
    <table-node>
    Foobar
    </table-node>
    <p>
      Did you see that? That’s a React component. We are really living in the future.
    </p>`,
    editable,
    // onUpdate: ({ editor }) => {
    //   console.log(editor.getHTML());
    // },
    // onTransaction: ({ state }) => {
    //   console.log(state.selection.anchor);
    // },
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
