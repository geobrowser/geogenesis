import { Node } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { TextSelection } from '@tiptap/pm/state';
import { Editor } from '@tiptap/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { focusEditorAtClick } from './focus-editor-at-click';
import { TrailingNode } from './trailing-node';

const TableNode = Node.create({
  name: 'tableNode',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'table-node' }],
  renderHTML: () => ['table-node'],
});

const BOX = { left: 100, right: 500, top: 0, bottom: 300 };

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.restoreAllMocks();
});

type Block = string | 'table';

function makeEditor(blocks: Block[]) {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, TableNode, TrailingNode],
    content: {
      type: 'doc',
      content: blocks.map(block =>
        block === 'table' ? { type: 'tableNode' } : { type: 'paragraph', content: [{ type: 'text', text: block }] }
      ),
    },
  });
  editors.push(editor);
  vi.spyOn(editor.view.dom, 'getBoundingClientRect').mockReturnValue({ ...BOX, width: 400, height: 300 } as DOMRect);
  return editor;
}

function blocks(editor: Editor) {
  return Array.from({ length: editor.state.doc.childCount }, (_, index) => {
    const child = editor.state.doc.child(index);
    return child.type.name === 'tableNode' ? 'table' : child.textContent;
  });
}

describe('focusEditorAtClick', () => {
  it('puts the caret in a new paragraph below a table that ends the doc', () => {
    const editor = makeEditor(['A', 'table']);
    const posAtCoords = vi.spyOn(editor.view, 'posAtCoords');

    focusEditorAtClick(editor, { clientX: 300, clientY: BOX.bottom + 20 });
    editor.commands.insertContent('x');

    expect(posAtCoords).not.toHaveBeenCalled();
    expect(blocks(editor)).toEqual(['A', 'table', 'x']);
  });

  it('puts the caret at the end of a paragraph that ends the doc', () => {
    const editor = makeEditor(['A', 'B']);

    focusEditorAtClick(editor, { clientX: 300, clientY: BOX.bottom + 20 });
    editor.commands.insertContent('x');

    expect(blocks(editor)).toEqual(['A', 'Bx']);
  });

  it('looks up a gutter click at its height just inside the editor', () => {
    const editor = makeEditor(['A', 'B', 'C']);
    const insideB = editor.state.doc.child(0).nodeSize + 2;
    const posAtCoords = vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: insideB, inside: -1 });

    focusEditorAtClick(editor, { clientX: BOX.left - 40, clientY: 150 });
    editor.commands.insertContent('x');

    expect(posAtCoords).toHaveBeenCalledWith({ left: BOX.left + 1, top: 150 });
    expect(blocks(editor)).toEqual(['A', 'Bx', 'C']);
  });

  it('never selects a table beside the click', () => {
    const editor = makeEditor(['table', 'A']);
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 0, inside: 0 });

    focusEditorAtClick(editor, { clientX: BOX.left - 40, clientY: 20 });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    editor.commands.insertContent('x');
    expect(blocks(editor)).toEqual(['table', 'xA']);
  });

  it('falls back to the end when nothing is at the click', () => {
    const editor = makeEditor(['A', 'B']);
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue(null);

    focusEditorAtClick(editor, { clientX: BOX.left - 40, clientY: 150 });
    editor.commands.insertContent('x');

    expect(blocks(editor)).toEqual(['A', 'Bx']);
  });
});
