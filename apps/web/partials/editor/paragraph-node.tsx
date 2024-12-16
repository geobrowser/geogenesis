import Paragraph from '@tiptap/extension-paragraph';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorInstance } from '~/core/state/editor/editor-provider';

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

function ParagraphNodeComponent() {
  const { spaceId } = useEditorInstance();
  const isEditable = useUserIsEditing(spaceId);

  return (
    <NodeViewWrapper>
      <div className="paragraph-node">
        <NodeViewContent as="p" contentEditable={isEditable ? 'true' : 'false'} />
      </div>
    </NodeViewWrapper>
  );
}
