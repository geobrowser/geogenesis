import Paragraph from '@tiptap/extension-paragraph';
import {
  NodeViewContent,
  NodeViewRendererProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
} from '@tiptap/react';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

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
    return ReactNodeViewRenderer(ParagraphNodeComponent);
  },
});

function ParagraphNodeComponent({ node }: NodeViewRendererProps) {
  const isEditable = useUserIsEditing(node.attrs.spaceId);

  return (
    <NodeViewWrapper>
      <NodeViewContent as="p" contentEditable={isEditable ? 'true' : 'false'} />
    </NodeViewWrapper>
  );
}
