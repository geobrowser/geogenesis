import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import { detectWeb2URLsInMarkdown } from '~/core/utils/url-detection';

import { Web2LinkHoverCard } from './web2-link-tooltip';

// Custom mark for web2 URLs that renders as spans with hover cards
const Web2URLMark = Mark.create({
  name: 'web2URL',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-web2-url]',
        getAttrs: element => ({
          url: (element as HTMLElement).getAttribute('data-url'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        class: 'entity-link-invalid web2-url-mark',
        'data-web2-url': 'true',
        'data-url': mark.attrs.url,
      },
      0,
    ];
  },
});

//Links aren't clickable in browse mode but still appear in text; add external links in the properties panel.
export const Web2URLExtension = Extension.create({
  name: 'web2URLHighlight',

  priority: 1000, // Higher priority than Link extension

  addExtensions() {
    return [Web2URLMark];
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      // Plugin for hover card functionality using Tippy
      new Plugin({
        key: new PluginKey(this.name),
        view(editorView) {
          let currentTippyInstance: Instance | null = null;
          let isDestroyed = false;
          const tippyInstances = new Map<Element, Instance>();
          const reactRenderers = new Map<Element, ReactRenderer>();

          const showHoverCard = (element: Element) => {
            if (isDestroyed || !editorView) return;

            // Check if this element already has a tippy instance
            if (tippyInstances.has(element)) {
              const instance = tippyInstances.get(element)!;
              instance.show();
              currentTippyInstance = instance;
              return;
            }

            try {
              // Create ReactRenderer component
              const reactRenderer = new ReactRenderer(Web2LinkHoverCard, {
                props: {},
                editor,
              });

              // Create tippy instance
              const tippyInstance = tippy(element as Element, {
                content: reactRenderer.element,
                trigger: 'manual',
                interactive: true,
                placement: 'top',
                theme: 'light-border',
                arrow: true,
                appendTo: document.body,
                zIndex: 9999,
                delay: [200, 150], // Show delay, hide delay
                onShow() {
                  // Component already rendered by ReactRenderer
                },
                onHide() {
                  // Clean up when hiding
                  currentTippyInstance = null;
                },
              });

              tippyInstances.set(element, tippyInstance);
              reactRenderers.set(element, reactRenderer);
              tippyInstance.show();
              currentTippyInstance = tippyInstance;
            } catch (error) {
              console.warn('Web2URLExtension Tippy error:', error);
            }
          };

          const hideCurrentHoverCard = () => {
            if (currentTippyInstance) {
              currentTippyInstance.hide();
              currentTippyInstance = null;
            }
          };

          let currentHoveredSpan: Element | null = null;

          const handleMouseEnter = (event: Event) => {
            // Only show hover card in read mode, not edit mode
            if (editorView.editable) return;

            const target = event.target as Element;
            const web2Span = target.closest('span[data-web2-url]');

            if (web2Span && web2Span !== currentHoveredSpan) {
              currentHoveredSpan = web2Span;
              showHoverCard(web2Span);
            }
          };

          const handleMouseLeave = (event: Event) => {
            const target = event.target as Element;
            const web2Span = target.closest('span[data-web2-url]');

            if (web2Span === currentHoveredSpan) {
              // Let Tippy handle the delay logic
              setTimeout(() => {
                if (currentTippyInstance && !web2Span?.matches(':hover')) {
                  hideCurrentHoverCard();
                  currentHoveredSpan = null;
                }
              }, 150);
            }
          };

          editorView.dom.addEventListener('mouseenter', handleMouseEnter, true);
          editorView.dom.addEventListener('mouseleave', handleMouseLeave, true);

          return {
            destroy: () => {
              isDestroyed = true;
              try {
                editorView.dom.removeEventListener('mouseenter', handleMouseEnter, true);
                editorView.dom.removeEventListener('mouseleave', handleMouseLeave, true);

                // Destroy all tippy instances
                tippyInstances.forEach(instance => {
                  try {
                    instance.destroy();
                  } catch (error) {
                    console.warn('Error destroying tippy instance:', error);
                  }
                });
                tippyInstances.clear();

                // Destroy all ReactRenderer instances
                reactRenderers.forEach(renderer => {
                  try {
                    renderer.destroy();
                  } catch (error) {
                    console.warn('Error destroying ReactRenderer:', error);
                  }
                });
                reactRenderers.clear();

                currentTippyInstance = null;
                currentHoveredSpan = null;
              } catch (error) {
                console.warn('Web2URLExtension destroy cleanup warning:', error);
              }
            },
          };
        },
      }),
      // Plugin for URL detection and marking
      new Plugin({
        key: new PluginKey(this.name),
        view(editorView) {
          let isUpdating = false;
          let isDestroyed = false;

          const updateLinkClasses = () => {
            if (isUpdating || isDestroyed) return;
            isUpdating = true;

            // Use requestAnimationFrame to avoid blocking
            requestAnimationFrame(() => {
              try {
                // Check if the editor view is still valid
                if (isDestroyed || !editorView || !editorView.state || editorView.isDestroyed) {
                  isUpdating = false;
                  return;
                }

                const { state } = editorView;
                const { schema } = state;
                let hasChanges = false;

                // Create a new transaction to avoid conflicts
                const newTr = state.tr;

                // Find all text nodes in text blocks only
                state.doc.descendants((node, pos, parent) => {
                  // Only process text nodes that are inside text blocks (paragraphs)
                  if (node.isText && node.text && parent && parent.type.name === 'paragraph') {
                    const urls = detectWeb2URLsInMarkdown(node.text);

                    if (urls.length > 0) {
                      urls.forEach(url => {
                        const urlIndex = node.text!.indexOf(url);
                        if (urlIndex !== -1) {
                          const from = pos + urlIndex;
                          const to = from + url.length;

                          // Validate position bounds
                          if (from < 0 || to > state.doc.content.size || from >= to) {
                            return;
                          }

                          // Check if this range already has a web2URL mark
                          const hasWeb2Mark =
                            schema.marks.web2URL && state.doc.rangeHasMark(from, to, schema.marks.web2URL);
                          const hasLinkMark = state.doc.rangeHasMark(from, to, schema.marks.link);

                          if (!hasWeb2Mark) {
                            // Extract the actual URL from markdown link format [text](url)
                            const markdownMatch = url.match(/\[([^\]]+)\]\(([^)]+)\)/);
                            const actualUrl = markdownMatch ? markdownMatch[2] : url;
                            const linkText = markdownMatch ? markdownMatch[1] : url;

                            // Check if this is a web2 URL that should be invalid
                            const isWeb2URL =
                              actualUrl.startsWith('http') ||
                              actualUrl.startsWith('www.') ||
                              (!actualUrl.startsWith('graph://') && actualUrl.includes('.'));

                            if (isWeb2URL && schema.marks.web2URL) {
                              // Remove any existing link mark first if present
                              if (hasLinkMark) {
                                newTr.removeMark(from, to, schema.marks.link);
                              }

                              const web2Mark = schema.marks.web2URL.create({
                                url: actualUrl.startsWith('http') ? actualUrl : `https://${actualUrl}`,
                              });

                              // Replace the markdown text with just the link text and apply the web2URL mark
                              newTr.replaceWith(from, to, schema.text(linkText, [web2Mark]));
                              hasChanges = true;
                            }
                          }
                        }
                      });
                    }
                  }
                });

                // Apply changes if any were made and editor is still valid and editable
                if (hasChanges && !editorView.isDestroyed && editorView.editable) {
                  editorView.dispatch(newTr);
                }
              } catch (error) {
                console.warn('Web2URLExtension update error:', error);
              } finally {
                isUpdating = false;
              }
            });
          };

          // Update classes on initial load
          setTimeout(updateLinkClasses, 0);

          return {
            update: (view, prevState) => {
              // Only update if the document actually changed
              if (!isDestroyed && view.state.doc !== prevState.doc) {
                updateLinkClasses();
              }
            },
            destroy: () => {
              // Mark as destroyed to prevent any further operations
              isDestroyed = true;
            },
          };
        },
      }),
    ];
  },
});
