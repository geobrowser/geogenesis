'use client';

import CodeBlock from '@tiptap/extension-code-block';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import * as React from 'react';

const CodeBlockComponent = React.memo(({ node, selected }: NodeViewProps) => {
  const content = node.textContent;

  const { lines, lineNumberWidth } = React.useMemo(() => {
    const contentLines = content.split('\n');
    // Handle empty code blocks
    const actualLines = contentLines.length === 1 && contentLines[0] === '' ? [''] : contentLines;

    const maxLineNumber = actualLines.length;
    const width = Math.max(2, maxLineNumber.toString().length);

    return {
      lines: actualLines,
      lineNumberWidth: width,
      isEmpty: content.trim() === '',
    };
  }, [content]);

  const renderLineNumbers = React.useCallback(() => {
    return lines.map((_, index) => (
      <span key={`line-${index + 1}`} className="block whitespace-pre leading-5" aria-label={`Line ${index + 1}`}>
        {(index + 1).toString().padStart(lineNumberWidth, ' ')}
      </span>
    ));
  }, [lines, lineNumberWidth]);

  return (
    <NodeViewWrapper
      className={`code-block-wrapper ${selected ? 'ProseMirror-selectednode' : ''}`}
      data-testid="code-block"
    >
      <div className="code-block-container mb-4 overflow-hidden rounded-lg border border-grey-02 font-mono text-[15px] font-medium leading-5">
        <div className="relative flex">
          {/* Line numbers with proper accessibility */}
          <div
            className="user-select-none flex min-w-14 select-none flex-col bg-divider px-2 py-1 text-right text-grey-04"
            role="presentation"
            aria-hidden="true"
          >
            {renderLineNumbers()}
          </div>

          {/* Code content */}
          <pre className="flex-1 overflow-hidden">
            <NodeViewContent
              as="code"
              className="relative resize-none overflow-x-auto whitespace-pre-wrap break-words text-[#35363A] outline-none"
              style={{
                minHeight: `${Math.max(1, lines.length) * 1.25}rem`,
              }}
              spellCheck={false}
              role="textbox"
              aria-label="Code content"
              aria-multiline="true"
            />
          </pre>
        </div>
      </div>
    </NodeViewWrapper>
  );
});

CodeBlockComponent.displayName = 'CodeBlockComponent';

export const CodeBlockWithLineNumbers = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      
      // Handle arrow up - exit code block if at the beginning of first line
      'ArrowUp': ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from } = selection;
        
        // Check if we're in a code block
        if ($from.parent.type.name !== 'codeBlock') {
          return false;
        }
        
        // Check if cursor is at the very beginning of the code block
        const codeBlockStart = $from.start();
        if ($from.pos === codeBlockStart) {
          // Move to the previous block with - 1 (line number)
          const prevPos = $from.before() - 1;
          if (prevPos > 0) {
            const $prevPos = state.doc.resolve(prevPos);
            editor.commands.setTextSelection($prevPos.pos);
            return true;
          }
        }
        
        // Check if cursor is on the first line and at the beginning of that line
        const textContent = $from.parent.textContent;
        const currentOffset = $from.parentOffset;
        const textBeforeCursor = textContent.slice(0, currentOffset);
        
        // If we're at the beginning of first line (no newlines before cursor)
        if (!textBeforeCursor.includes('\n') && currentOffset === 0) {
          // Move to the previous block
          const prevPos = $from.before();
          if (prevPos > 0) {
            const $prevPos = state.doc.resolve(prevPos);
            editor.commands.setTextSelection($prevPos.end());
            return true;
          }
        }
        
        return false;
      },
    };
  },
});
