import { PluginKey } from '@tiptap/pm/state';
import { Extension, ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';
import tippy from 'tippy.js';
import type { Instance } from 'tippy.js';

import { MentionList } from './mention-list';

const EntityMentionSuggestion = Extension.create<{
  suggestion: Omit<SuggestionOptions<any>, 'editor'>;
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
        let reactRenderer: ReactRenderer<any, any>;
        let popup: Instance | null = null;

        return {
          onStart: props => {
            // Use passed spaceId
            const currentSpaceId = spaceId;

            reactRenderer = new ReactRenderer(MentionList, {
              props: {
                ...props,
                spaceId: currentSpaceId,
                command: (entityId: string, entityName: string) => {
                  // Insert entity mention as markdown link format [name](graph://id)
                  const linkText = entityName || entityId;
                  const linkUrl = `graph://${entityId}`;

                  // Insert as HTML anchor tag to ensure reliable link rendering
                  props.editor
                    .chain()
                    .focus()
                    .deleteRange(props.range)
                    .insertContent(`<a href="${linkUrl}">${linkText}</a>`)
                    .run();
                },
                onEscape: () => {
                  if (popup) {
                    popup.hide();
                  }
                },
              },
              editor: props.editor,
            });

          if (!props.clientRect) {
            console.warn('EntityMention: No clientRect available, skipping popup creation');
            return;
          }

          // Create single popup instance
          const instances = tippy('body', {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: reactRenderer.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            theme: 'light',
            arrow: false,
            offset: [0, 8],
            maxWidth: 420,
            zIndex: 9999,
          });

          popup = instances[0];
        },

        onUpdate(props) {
          if (reactRenderer) {
            reactRenderer.updateProps(props);
          }

          if (popup && props.clientRect) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as any,
            });
          }
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            if (popup) {
              popup.hide();
            }
            return true;
          }

          return reactRenderer?.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          if (popup) {
            popup.destroy();
            popup = null;
          }
          if (reactRenderer) {
            reactRenderer.destroy();
          }
        },
      };
    },
  },
});

// Export for backward compatibility if needed, but prefer createEntityMentionExtension
// export const EntityMentionExtension = createEntityMentionExtension('default');
