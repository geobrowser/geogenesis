import { Paragraph } from '@tiptap/extension-paragraph';
import { Editor, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { CommandListPopover } from './command-list-popover';

export const ParagraphExtension = Paragraph.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ParagraphComponent);
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor?.chain().focus(this.editor.state.selection.from).createParagraphNear().run(),
    };
  },
});

export const ParagraphComponent = ({ editor }: { editor: Editor }) => {
  return (
    <NodeViewWrapper className="tiptap-paragraph relative">
      <NodeViewContent />
      <span className="absolute -left-8 top-0" contentEditable={false}>
        <CommandListPopover editor={editor} />
      </span>
    </NodeViewWrapper>
  );
};
