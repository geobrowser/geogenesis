import { Editor, mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { CommandListPopover } from './command-list-popover';

export const ParagraphExtension = Node.create({
  name: 'textBlock',
  group: 'block',
  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'text-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table-node', mergeAttributes(HTMLAttributes), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ParagraphComponent);
  },
});

export const ParagraphComponent = ({ editor }: { editor: Editor }) => {
  return (
    <NodeViewWrapper className="relative">
      <NodeViewContent />
      <div className="absolute left-0" contentEditable={false}>
        <CommandListPopover editor={editor} />
      </div>
    </NodeViewWrapper>
  );
};
