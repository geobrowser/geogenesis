import * as React from 'react';
import {
  mergeAttributes,
  Node,
  NodeViewRendererProps,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
} from '@tiptap/react';

import Paragraph from '@tiptap/extension-paragraph';
import { useUserIsEditing } from '~/modules/hooks/use-user-is-editing';

export const TextNode = Paragraph.extend({
  name: 'paragraph',
  // group: 'block',
  // atom: true,
  // spanning: false,
  // allowGapCursor: false,
  // defining: true,
  // exitable: true,
  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'p',
        priority: 1000,
      },
    ];
  },

  addAttributes() {
    return {
      typeId: {
        default: null,
      },
      typeName: {
        default: null,
      },
      spaceId: {
        default: '',
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TextNodeComponent);
  },
});

function TextNodeComponent({ node }: NodeViewRendererProps) {
  console.log('node', node);

  const isEditable = useUserIsEditing(node.attrs.spaceId);

  return (
    <NodeViewWrapper>
      <p contentEditable={isEditable ? 'true' : 'false'}>
        <NodeViewContent />
      </p>
    </NodeViewWrapper>
  );
}
