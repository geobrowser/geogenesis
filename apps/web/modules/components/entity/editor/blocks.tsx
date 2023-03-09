import { Heading } from '@tiptap/extension-heading';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Editor, NodeViewContent, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ElementType } from 'react';
import { CommandListPopover } from './command-list-popover';

export const TextBlock = Paragraph.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlockComponent);
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor?.chain().focus(this.editor.state.selection.from).createParagraphNear().run(),
    };
  },
});

export const HeadingBlock = Heading.extend({
  addAttributes() {
    return {
      level: 1,
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockComponent);
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor?.chain().focus(this.editor.state.selection.from).createParagraphNear().run(),
    };
  },
});

const placeholder = (node: NodeViewRendererProps['node']) => {
  if (node.type.name === 'heading') {
    return 'Heading...';
  }

  return '/ to select content block or write some content...';
};

export const BlockComponent = ({ editor, node }: { editor: Editor; node: NodeViewRendererProps['node'] }) => {
  const htmlTag = (node.type.name === 'heading' ? `h${node.attrs.level}` : 'p') as ElementType<any>;

  return (
    <NodeViewWrapper className={`tiptap-block tiptap-${htmlTag}`} data-placeholder={placeholder(node)}>
      <NodeViewContent as={htmlTag} />
      <span contentEditable={false}>
        <CommandListPopover editor={editor} />
      </span>
    </NodeViewWrapper>
  );
};
