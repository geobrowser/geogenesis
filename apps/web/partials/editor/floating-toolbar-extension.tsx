import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import React from 'react';

import { FloatingSelectionToolbar } from './floating-selection-toolbar';

// React component for the floating toolbar content
const FloatingToolbarContent: React.FC<{ editor: any }> = ({ editor }) => {
  return (
    <div className="floating-toolbar" suppressContentEditableWarning={true}>
      <FloatingSelectionToolbar editor={editor} />
    </div>
  );
};

export const FloatingToolbarExtension = Extension.create({
  name: 'floatingToolbar',

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey(this.name),
        view() {
          let component: ReactRenderer | null = null;
          let popup: Instance | null = null;

          const shouldShow = ({ editor, state }: { editor: any; state: any }) => {
            // Don't show if not editable or editor is destroyed
            if (!editor || editor.isDestroyed || !editor.isEditable) {
              return false;
            }

            const { selection } = state;
            const { from, to } = selection;

            // Don't show if no text is selected (just cursor position)
            if (from === to || state.doc.textBetween(from, to).trim().length === 0) {
              return false;
            }

            // Don't show if selection contains any link marks
            const { schema } = state;
            const hasLinkMark = state.doc.rangeHasMark(from, to, schema.marks.link);
            if (hasLinkMark) {
              return false;
            }

            return true;
          };

          const show = () => {
            if (!component) {
              component = new ReactRenderer(FloatingToolbarContent, {
                props: { editor },
                editor,
              });
            }

            if (!popup && component?.element) {
              popup = tippy(document.body, {
                getReferenceClientRect: null,
                content: component.element,
                interactive: true,
                trigger: 'manual',
                placement: 'top',
                hideOnClick: 'toggle',
                offset: [0, 10],
                duration: 200,
                animation: 'fade',
                appendTo: () => document.body,
              });
            }
          };

          const hide = () => {
            if (popup) {
              popup.hide();
              popup.destroy();
              popup = null;
            }
          };

          const update = (view: any) => {
            const { state } = view;
            const { selection } = state;

            if (shouldShow({ editor, state })) {
              show();

              if (popup) {
                // Position the popup based on selection
                const { from, to } = selection;
                popup.setProps({
                  getReferenceClientRect: () => {
                    const start = view.coordsAtPos(from);
                    const end = view.coordsAtPos(to);

                    return new DOMRect(start.left, start.top, end.left - start.left, end.bottom - start.top);
                  },
                });
                popup.show();
              }
            } else {
              hide();
            }
          };

          return {
            update,
            destroy() {
              hide();
              if (component) {
                component.destroy();
                component = null;
              }
            },
          };
        },
      }),
    ];
  },

  onDestroy() {
    // Cleanup floating elements when extension is destroyed
    const floatingElements = document.querySelectorAll('[data-tippy-root]');
    floatingElements.forEach(element => {
      try {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      } catch (error) {
        console.warn('FloatingToolbar cleanup warning:', error);
      }
    });
  },
});
