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

export const ConfiguredEntityMentionExtension = EntityMentionSuggestion.configure({
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
          // Get current space ID from editor context or use default
          const currentSpaceId = props.editor.storage?.currentSpace?.id || 'default';

          reactRenderer = new ReactRenderer(MentionList, {
            props: {
              ...props,
              spaceId: currentSpaceId,
              command: (entityId: string, entityName: string) => {
                // Insert entity mention as a link (same format as command links)
                const linkText = entityName || entityId;
                const linkUrl = `graph://${entityId}`;
                
                // Use same pattern as command-items.tsx for consistency
                props.editor
                  .chain()
                  .focus()
                  .deleteRange(props.range)
                  .insertContent(`[${linkText}](${linkUrl})`)
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

// Export both for backward compatibility
export const EntityMentionExtension = ConfiguredEntityMentionExtension;
