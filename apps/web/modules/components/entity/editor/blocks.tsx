import { Heading } from '@tiptap/extension-heading';
import { Paragraph } from '@tiptap/extension-paragraph';
import {
  Editor,
  mergeAttributes,
  NodeViewContent,
  NodeViewRendererProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react';
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
  addNodeView() {
    return ReactNodeViewRenderer(BlockComponent);
  },
  renderHTML({
    node,
    HTMLAttributes,
  }: {
    node: NodeViewRendererProps['node'];
    HTMLAttributes: Record<string, unknown>;
  }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];

    return [`f${level}`, mergeAttributes(this.options.HTMLAttributes, { class: `asdfh${level}` }), 0];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor?.chain().focus(this.editor.state.selection.from).createParagraphNear().run(),
    };
  },
});

export const BlockComponent = ({ editor, node }: { editor: Editor; node: NodeViewRendererProps['node'] }) => {
  const htmlTag = (node.type.name === 'heading' ? `h${node.attrs.level}` : 'p') as ElementType<any>;

  return (
    <NodeViewWrapper className="tiptap-block relative">
      <NodeViewContent as={htmlTag} />
      <span className="tiptap-menu-trigger" contentEditable={false}>
        <CommandListPopover editor={editor} />
      </span>
    </NodeViewWrapper>
  );
};
