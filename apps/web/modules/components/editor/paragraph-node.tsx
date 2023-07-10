import * as React from 'react';
import {
  mergeAttributes,
  NodeViewRendererProps,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
} from '@tiptap/react';

import Paragraph from '@tiptap/extension-paragraph';
import { useUserIsEditing } from '~/modules/hooks/use-user-is-editing';

export const ParagraphNode = Paragraph.extend({
  ...Paragraph,
  name: 'paragraph',
  spanning: true,
  defining: true,
  exitable: true,
  content: 'inline*',
  code: false,

  parseHTML() {
    return [
      {
        tag: 'p',
        priority: 1000,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TextNodeComponent);
  },
});

function TextNodeComponent({ node }: NodeViewRendererProps) {
  const isEditable = useUserIsEditing(node.attrs.spaceId);

  return (
    <NodeViewWrapper>
      <p contentEditable={isEditable ? 'true' : 'false'}>
        <NodeViewContent />
      </p>
    </NodeViewWrapper>
  );
}
