'use client';

import Code from '@tiptap/extension-code';
import { mergeAttributes } from '@tiptap/react';
import type { SingleCommands } from '@tiptap/core';

// Custom inline code extension with enhanced functionality (mark-based)
export const InlineCode = Code.extend({
  name: 'inlineCode',

  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'inline-code',
        spellcheck: 'false',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'code',
        getAttrs: node => {
          // Only match code elements that are not inside pre tags (those are code blocks)
          // Check if we're in browser environment and node has the expected properties
          if (typeof window !== 'undefined' && node && typeof node === 'object' && 'parentElement' in node) {
            const element = node as HTMLElement;
            return element.parentElement?.tagName !== 'PRE' ? {} : false;
          }
          // During SSR, accept all code tags and let the browser handle the distinction
          return {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['code', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setInlineCode:
        () =>
        ({ commands }: { commands: SingleCommands }) => {
          return commands.setMark(this.name);
        },
      toggleInlineCode:
        () =>
        ({ commands }: { commands: SingleCommands }) => {
          return commands.toggleMark(this.name);
        },
      unsetInlineCode:
        () =>
        ({ commands }: { commands: SingleCommands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-e': () => this.editor.commands.toggleMark('inlineCode'),
      'Mod-`': () => this.editor.commands.toggleMark('inlineCode'),
    };
  },
});