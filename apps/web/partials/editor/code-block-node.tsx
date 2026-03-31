import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import * as React from 'react';

import { Content } from './node-view-content';

export const CodeBlockNode = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ArrowUp: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;

        // Only handle when inside a code block and cursor is at the very start
        if ($from.parent.type.name !== 'codeBlock') return false;
        if ($from.parentOffset !== 0) return false;

        // Move to the block before the code block
        const before = $from.before($from.depth);
        if (before <= 0) return false;

        return editor.commands.setTextSelection(before - 1);
      },
    };
  },
});

function CodeBlockComponent({ node }: NodeViewRendererProps) {
  const lineCount = node.textContent.split('\n').length;

  return (
    <NodeViewWrapper as="pre" className="code-block" style={{ whiteSpace: 'pre' }}>
      <div className="code-block-line-numbers" aria-hidden>
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <Content as="code" />
    </NodeViewWrapper>
  );
}
