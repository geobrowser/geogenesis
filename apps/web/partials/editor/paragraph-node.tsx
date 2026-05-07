import Paragraph from '@tiptap/extension-paragraph';
import {
  NodeViewRendererProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
} from '@tiptap/react';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';

import { Content } from './node-view-content';

export const ParagraphNode = Paragraph.extend({
  ...Paragraph,
  name: 'paragraph',
  defining: true,
  content: 'inline*',
  code: false,

  addAttributes() {
    return {
      ...this.parent?.(),
      tailPlaceholder: {
        default: null,
        parseHTML: element => element.getAttribute('data-tail-placeholder') === 'true',
        renderHTML: attributes => {
          if (!attributes.tailPlaceholder) {
            return {};
          }
          return { 'data-tail-placeholder': 'true' };
        },
      },
    };
  },

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
  const { spaceId } = useEditorInstance();
  const isEditable = useUserIsEditing(spaceId);
  const tailPlaceholder = Boolean(node.attrs.tailPlaceholder);

  return (
    <NodeViewWrapper className={tailPlaceholder ? 'paragraph-tail-placeholder' : undefined}>
      <div className="paragraph-node">
        <Content as="p" contentEditable={isEditable ? 'true' : 'false'} suppressContentEditableWarning />
      </div>
    </NodeViewWrapper>
  );
}
