import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { PageStringField } from '../editable-fields';

export const ReactComponent = Node.create({
  name: 'reactComponent',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'react-component',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['react-component', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(Component);
  },
});
export const Component = () => {
  return (
    <NodeViewWrapper className="react-component-with-content">
      <b className="label" contentEditable={false}>
        <PageStringField value="asdfsf" />
      </b>

      <NodeViewContent className="content" />
    </NodeViewWrapper>
  );
};
