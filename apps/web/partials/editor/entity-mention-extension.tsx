import { PluginKey } from '@tiptap/pm/state';
import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { VirtualElement } from '@floating-ui/dom';

import { insertGraphLink } from './insert-graph-link';
import { MentionList } from './mention-list';

// ============================================================================
// Types
// ============================================================================

/**
 * Type definition for entity mention suggestion items
 */
interface EntityMentionItem {
  id: string;
  name: string;
  spaceId: string;
}

/**
 * Type for the command callback in MentionList
 */
type EntityMentionCommand = (
  entityId: string,
  entityName: string,
  entitySpaceId: string
) => void;

/**
 * Type for the escape callback
 */
type EscapeCallback = () => void;

/**
 * Props passed to MentionList component
 */
interface MentionListProps {
  spaceId: string;
  editor: SuggestionProps<EntityMentionItem>['editor'];
  command: EntityMentionCommand;
  onEscape?: EscapeCallback;
}

/**
 * Interface for MentionList ref, used for keyboard navigation
 */
interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// ============================================================================
// Extension
// ============================================================================

const EntityMentionSuggestion = Extension.create<{
  suggestion: Omit<SuggestionOptions<EntityMentionItem>, 'editor'>;
}>({
  name: 'entityMention',

  addOptions() {
    return {
      suggestion: {
        char: '@',
        command: () => {
          // Command is handled directly in MentionList callback
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey(this.name),
        ...this.options.suggestion,
      }),
    ];
  },
});

export const createEntityMentionExtension = (spaceId: string) =>
  EntityMentionSuggestion.configure({
    suggestion: {
      items: () => {
        // Return empty array - MentionList handles the search
        return [];
      },
      render() {
        let reactRenderer: ReactRenderer<MentionListRef, MentionListProps>;
        let popupElement: HTMLDivElement | null = null;
        let currentClientRect: SuggestionProps<EntityMentionItem>['clientRect'] = null;
        // Stores the cleanup function returned by autoUpdate
        let stopAutoUpdate: (() => void) | null = null;

        /**
         * Stable virtual reference element whose getBoundingClientRect always
         * delegates to the latest currentClientRect so that every position
         * computation — including those triggered by autoUpdate — reflects the
         * live cursor location rather than a stale snapshot.
         *
         * contextElement is set to the editor's DOM node in onStart so that
         * autoUpdate can traverse the correct scroll ancestor chain.
         */
        const virtualRef: VirtualElement = {
          getBoundingClientRect: (): DOMRect => {
            if (currentClientRect) {
              return currentClientRect() ?? new DOMRect();
            }
            return new DOMRect();
          },
        };

        /**
         * Recompute the popup position using Floating UI.
         *
         * strategy: 'fixed' is required because the popup element uses
         * `position: fixed`.  Without it, computePosition returns coordinates
         * relative to the document / offset-parent, which are incorrect for a
         * fixed element and cause the popup to drift during scroll.
         */
        const updatePosition = (): void => {
          if (!currentClientRect || !popupElement) return;

          computePosition(virtualRef, popupElement, {
            placement: 'bottom-start',
            strategy: 'fixed',
            middleware: [offset(8), flip(), shift({ padding: 8 })],
          }).then(({ x, y }) => {
            if (popupElement) {
              popupElement.style.left = `${x}px`;
              popupElement.style.top = `${y}px`;
            }
          });
        };

        /**
         * Start (or restart) autoUpdate so that the popup position is
         * recomputed whenever the reference element or any of its scrollable
         * ancestors changes.  autoUpdate handles scroll, resize, and layout
         * shifts and returns a cleanup function that removes all listeners.
         */
        const startAutoUpdate = (): void => {
          // Remove any existing autoUpdate listeners before starting fresh
          if (stopAutoUpdate) {
            stopAutoUpdate();
            stopAutoUpdate = null;
          }

          if (!popupElement) return;

          stopAutoUpdate = autoUpdate(virtualRef, popupElement, updatePosition);
        };

        /**
         * Full teardown: stop autoUpdate listeners, remove the popup from the
         * DOM, and destroy the React renderer.  Called on Escape, onExit, and
         * after a successful command insertion.
         */
        const cleanup = (): void => {
          if (stopAutoUpdate) {
            stopAutoUpdate();
            stopAutoUpdate = null;
          }
          if (popupElement) {
            popupElement.remove();
            popupElement = null;
          }
          if (reactRenderer) {
            reactRenderer.destroy();
          }
          currentClientRect = null;
        };

        return {
          onStart: (props: SuggestionProps<EntityMentionItem>) => {
            currentClientRect = props.clientRect;

            /**
             * Attach the editor's DOM node as the contextElement so that
             * autoUpdate can walk the correct ancestor chain and subscribe to
             * scroll events on every scrollable container above the editor,
             * including the window.
             */
            (virtualRef as VirtualElement & { contextElement?: Element }).contextElement =
              props.editor.view.dom;

            // Create popup container with fixed positioning
            popupElement = document.createElement('div');
            popupElement.style.position = 'fixed';
            popupElement.style.top = '0';
            popupElement.style.left = '0';
            popupElement.style.zIndex = '9999';
            document.body.appendChild(popupElement);

            reactRenderer = new ReactRenderer<MentionListRef, MentionListProps>(MentionList, {
              props: {
                ...props,
                spaceId,
                command: (entityId: string, entityName: string, entitySpaceId: string) => {
                  // Capture range before cleanup destroys the suggestion state
                  const from = props.range.from;
                  const to = props.range.to;

                  cleanup();

                  // Use shared function to insert graph link
                  insertGraphLink({
                    editor: props.editor,
                    entityId,
                    linkText: entityName,
                    spaceId: entitySpaceId,
                    from,
                    to,
                  });
                },
                onEscape: () => {
                  cleanup();
                },
              },
              editor: props.editor,
            });

            // Append the renderer element to our popup container
            if (popupElement && reactRenderer.element) {
              popupElement.appendChild(reactRenderer.element);
            }

            /**
             * Start autoUpdate before calling updatePosition so the initial
             * paint and all subsequent scroll / resize events are handled.
             * autoUpdate immediately calls updatePosition once on start.
             */
            startAutoUpdate();
          },

          onUpdate(props: SuggestionProps<EntityMentionItem>) {
            // Keep currentClientRect up to date so the stable virtualRef
            // returns fresh coordinates on the next computePosition call.
            currentClientRect = props.clientRect;

            if (reactRenderer) {
              reactRenderer.updateProps({
                ...props,
                spaceId,
              });
            }

            // Recompute position immediately for the updated suggestion state
            updatePosition();
          },

          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === 'Escape') {
              cleanup();
              return true;
            }

            return reactRenderer?.ref?.onKeyDown(props) ?? false;
          },

          onExit() {
            cleanup();
          },
        };
      },
    },
  });
