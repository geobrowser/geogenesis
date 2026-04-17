import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';

import React from 'react';

import { FloatingSelectionToolbar } from './floating-selection-toolbar';

// ============================================================================
// Constants
// ============================================================================

const TOOLTIP_OFFSET = 10;
const POPUP_Z_INDEX = 9999;

// ============================================================================
// React Component
// ============================================================================

// React component for the floating toolbar content
const FloatingToolbarContent: React.FC<{ editor: any }> = ({ editor }) => {
  return (
    <div className="floating-toolbar" suppressContentEditableWarning={true}>
      <FloatingSelectionToolbar editor={editor} />
    </div>
  );
};

// ============================================================================
// Extension
// ============================================================================

export const FloatingToolbarExtension = Extension.create({
  name: 'floatingToolbar',

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey(this.name),
        view() {
          let component: ReactRenderer | null = null;
          let popupElement: HTMLDivElement | null = null;
          let cleanupAutoUpdate: (() => void) | null = null;
          let lastFrom = -1;
          let lastTo = -1;

          const shouldShow = ({ editor, state }: { editor: any; state: any }) => {
            // Don't show if not editable or editor is destroyed
            // Use editor.isEditable (TipTap v3 API)
            if (!editor || editor.isDestroyed || !editor.isEditable) {
              return false;
            }

            const { selection } = state;
            const { from, to } = selection;

            // Don't show if no text is selected (just cursor position)
            if (from === to || state.doc.textBetween(from, to).trim().length === 0) {
              return false;
            }

            // Don't show if selection contains any link or web2URL marks
            const { schema } = state;
            const hasLinkMark = state.doc.rangeHasMark(from, to, schema.marks.link);
            if (hasLinkMark) {
              return false;
            }

            if (schema.marks.web2URL && state.doc.rangeHasMark(from, to, schema.marks.web2URL)) {
              return false;
            }

            return true;
          };

          const updatePosition = (view: any, from: number, to: number) => {
            if (!popupElement) return;

            // Create a virtual element based on the live selection coordinates.
            // Coordinates are recomputed on every call so scroll does not
            // produce stale values.
            const start = view.coordsAtPos(from);
            const end = view.coordsAtPos(to);

            const virtualElement = {
              getBoundingClientRect: () =>
                new DOMRect(start.left, start.top, end.left - start.left, end.bottom - start.top),
            };

            // strategy:'fixed' is required because the popup uses
            // `position:fixed`. Without it, computePosition returns
            // document-relative coordinates that cause the toolbar to drift
            // during scroll.
            computePosition(virtualElement, popupElement, {
              placement: 'top',
              strategy: 'fixed',
              middleware: [offset(TOOLTIP_OFFSET), flip(), shift({ padding: 8 })],
            }).then(({ x, y }) => {
              if (popupElement) {
                popupElement.style.left = `${x}px`;
                popupElement.style.top = `${y}px`;
              }
            });
          };

          const show = (view: any, from: number, to: number) => {
            // Clean up existing autoUpdate
            if (cleanupAutoUpdate) {
              cleanupAutoUpdate();
              cleanupAutoUpdate = null;
            }

            if (!component) {
              component = new ReactRenderer(FloatingToolbarContent, {
                props: { editor },
                editor,
              });
            }

            if (!popupElement && component?.element) {
              // Create popup container
              popupElement = document.createElement('div');
              popupElement.style.position = 'fixed';
              popupElement.style.top = '0';
              popupElement.style.left = '0';
              popupElement.style.zIndex = String(POPUP_Z_INDEX);
              document.body.appendChild(popupElement);

              // Append the renderer element to our popup container
              popupElement.appendChild(component.element);
            }

            // Update position immediately
            updatePosition(view, from, to);

            // Set up auto-update for position (updates on scroll/resize).
            // The virtual element's getBoundingClientRect is kept dynamic so
            // that every scroll-triggered recompute reflects the real cursor
            // position rather than the stale snapshot taken at show() time.
            // contextElement points autoUpdate at the correct scroll-ancestor
            // chain so it fires on any container scroll, not just window.
            if (popupElement) {
              const autoUpdateRef = {
                getBoundingClientRect: () => {
                  const s = view.coordsAtPos(from);
                  const e = view.coordsAtPos(to);
                  return new DOMRect(s.left, s.top, e.left - s.left, e.bottom - s.top);
                },
                contextElement: view.dom as Element,
              };

              cleanupAutoUpdate = autoUpdate(autoUpdateRef, popupElement, () => {
                if (popupElement && view && !view.isDestroyed) {
                  updatePosition(view, from, to);
                }
              });
            }
          };

          const hide = () => {
            if (cleanupAutoUpdate) {
              cleanupAutoUpdate();
              cleanupAutoUpdate = null;
            }
            if (popupElement) {
              popupElement.remove();
              popupElement = null;
            }
          };

          const update = (view: any) => {
            const { state } = view;
            const { selection } = state;

            if (shouldShow({ editor, state })) {
              const { from, to } = selection;

              // Only update position if selection changed
              if (from !== lastFrom || to !== lastTo) {
                lastFrom = from;
                lastTo = to;
                show(view, from, to);
              }
            } else {
              lastFrom = -1;
              lastTo = -1;
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
    // This is a safety net for any orphaned elements
    const floatingToolbars = document.querySelectorAll('.floating-toolbar');
    floatingToolbars.forEach(element => {
      try {
        if (element.parentNode) {
          const parent = element.parentNode;
          if (parent.parentNode) {
            parent.parentNode.removeChild(parent);
          }
        }
      } catch (error) {
        console.warn('FloatingToolbar cleanup warning:', error);
      }
    });
  },
});
