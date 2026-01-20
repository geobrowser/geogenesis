import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import { detectWeb2URLsInMarkdown } from '~/core/utils/url-detection';
import { Web2LinkHoverCard } from './web2-link-tooltip';

// Custom mark for web2 URLs that renders as spans with hover cards
const Web2URLMark = Mark.create({
  name: 'web2URL',

  // Prevent mark from extending to new content (e.g., when pressing Enter)
  inclusive: false,

  // Exclude all other marks to prevent propagation
  excludes: '_',

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
      editMode: {
        default: false,
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
    // Mode-aware rendering
    if (mark.attrs.editMode) {
      // EDIT MODE: Subtle styling for markdown
      return [
        'span',
        {
          ...HTMLAttributes,
          class: 'web2-url-edit-mode',
          'data-web2-url': 'true',
          'data-url': mark.attrs.url,
          style: 'color: #e57373; cursor: text;',
        },
        0,
      ];
    } else {
      // VIEW MODE: Full invalid link styling
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
    }
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

          // Timeout management for better hover stability
          let showTimeout: NodeJS.Timeout | null = null;
          let hideTimeout: NodeJS.Timeout | null = null;
          let currentHoveredSpan: Element | null = null;

          const clearTimeouts = () => {
            if (showTimeout) {
              clearTimeout(showTimeout);
              showTimeout = null;
            }
            if (hideTimeout) {
              clearTimeout(hideTimeout);
              hideTimeout = null;
            }
          };

          const showHoverCard = (element: Element) => {
            if (isDestroyed) return;

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

              // Create tippy instance with improved configuration
              const tippyInstance = tippy(element as Element, {
                content: reactRenderer.element,
                trigger: 'manual',
                interactive: true,
                placement: 'top',
                theme: 'light-border',
                arrow: true,
                appendTo: document.body,
                zIndex: 9999,
                delay: [0, 100], // No show delay (handled by our timeout), short hide delay
                // Add offset to prevent overlap issues
                offset: [0, 3],
                // Allow mouse to move between element and tooltip
                interactiveBorder: 10,
                onShow() {
                  // Component already rendered by ReactRenderer
                },
                onHide() {
                  // Clean up when hiding
                  if (currentTippyInstance === tippyInstance) {
                    currentTippyInstance = null;
                  }
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

          const handleMouseEnter = (event: Event) => {

            const target = event.target as Element;
            const web2Span = target.closest('span[data-web2-url]');

            if (web2Span) {
              // Clear any pending hide timeout
              if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
              }

              // If this is a different span or we don't have a current span
              if (web2Span !== currentHoveredSpan) {
                // Clear any pending show timeout
                if (showTimeout) {
                  clearTimeout(showTimeout);
                  showTimeout = null;
                }

                // Hide current card immediately if showing different element
                if (currentTippyInstance && currentHoveredSpan) {
                  hideCurrentHoverCard();
                }

                currentHoveredSpan = web2Span;

                // Debounce show to prevent flickering on rapid hover changes
                showTimeout = setTimeout(() => {
                  // Double-check the element is still hovered before showing
                  if (web2Span.matches(':hover') && currentHoveredSpan === web2Span) {
                    showHoverCard(web2Span);
                  }
                  showTimeout = null;
                }, 100); // Short delay to stabilize hover
              } else {
                // Same element - ensure card is showing
                if (currentTippyInstance) {
                  currentTippyInstance.show();
                }
              }
            }
          };

          const handleMouseLeave = (event: Event) => {
            const target = event.target as Element;
            const web2Span = target.closest('span[data-web2-url]');

            if (web2Span === currentHoveredSpan) {
              // Clear any pending show timeout
              if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
              }

              // Clear any existing hide timeout
              if (hideTimeout) {
                clearTimeout(hideTimeout);
              }

              // Add a grace period before hiding to allow mouse movement to tooltip
              hideTimeout = setTimeout(() => {
                // Check if mouse is over the span or the tooltip
                const isStillHovering = web2Span?.matches(':hover');
                const isTooltipHovered = currentTippyInstance?.popper?.matches(':hover');

                if (!isStillHovering && !isTooltipHovered) {
                  hideCurrentHoverCard();
                  currentHoveredSpan = null;
                }
                hideTimeout = null;
              }, 150);
            }
          };

          editorView.dom.addEventListener('mouseenter', handleMouseEnter, true);
          editorView.dom.addEventListener('mouseleave', handleMouseLeave, true);

          return {
            destroy: () => {
              isDestroyed = true;
              try {
                // Clear all pending timeouts
                clearTimeouts();

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
          let rafId: number | null = null;
          let updateTimeout: NodeJS.Timeout | null = null;
          let isDestroyed = false;
          let previousEditableState = editorView.editable;

          const updateLinkClasses = () => {
            if (isDestroyed) return;

            // Clear any pending timeout to debounce rapid updates
            if (updateTimeout !== null) {
              clearTimeout(updateTimeout);
            }

            // Debounce updates to prevent excessive processing during rapid typing
            updateTimeout = setTimeout(() => {
              // Cancel any pending animation frame to prevent race conditions
              if (rafId !== null) {
                cancelAnimationFrame(rafId);
              }

              // Use requestAnimationFrame to avoid blocking
              rafId = requestAnimationFrame(() => {
                try {
                  // Check if the editor view is still valid
                  if (isDestroyed || !editorView || !editorView.state || editorView.isDestroyed) {
                    rafId = null;
                    return;
                  }

                  const { state } = editorView;
                  const { schema } = state;
                  let hasChanges = false;

                  // Create a new transaction to avoid conflicts
                  const newTr = state.tr;

                  // Process paragraph nodes to handle text that may be split across multiple text nodes
                  state.doc.descendants((node, pos) => {
                    // Only process paragraph nodes
                    if (node.type.name === 'paragraph') {
                      // Early exit if paragraph has no content
                      if (!node.content.size) {
                        return;
                      }

                      // Collect all text content from the paragraph
                      let paragraphText = '';
                      const textNodePositions: Array<{ node: any; startPos: number; endPos: number }> = [];

                      node.descendants((textNode, relativePos) => {
                        if (textNode.isText && textNode.text) {
                          const absolutePos = pos + 1 + relativePos; // +1 for paragraph node offset
                          textNodePositions.push({
                            node: textNode,
                            startPos: absolutePos,
                            endPos: absolutePos + textNode.nodeSize
                          });
                          paragraphText += textNode.text;
                        }
                      });

                      // Early exit if no text content or no potential markdown/URL syntax
                      if (!paragraphText || (!paragraphText.includes('[') && !paragraphText.includes('http'))) {
                        return;
                      }

                      const urls = detectWeb2URLsInMarkdown(paragraphText);

                      if (urls.length > 0) {
                        for (const url of urls) {
                          const urlIndex = paragraphText.indexOf(url);
                          if (urlIndex !== -1) {
                            // Find the actual document positions for this URL span
                            let currentTextPos = 0;
                            let fromPos = -1;
                            let toPos = -1;

                            for (const textNodeInfo of textNodePositions) {
                              const nodeText = textNodeInfo.node.text;
                              const nodeEndPos = currentTextPos + nodeText.length;

                              // Check if URL starts within this text node
                              if (fromPos === -1 && urlIndex >= currentTextPos && urlIndex < nodeEndPos) {
                                fromPos = textNodeInfo.startPos + (urlIndex - currentTextPos);
                              }

                              // Check if URL ends within this text node
                              const urlEndIndex = urlIndex + url.length;
                              if (toPos === -1 && urlEndIndex > currentTextPos && urlEndIndex <= nodeEndPos) {
                                toPos = textNodeInfo.startPos + (urlEndIndex - currentTextPos);
                                break;
                              }

                              currentTextPos = nodeEndPos;
                            }

                            if (fromPos !== -1 && toPos !== -1) {
                              const from = fromPos;
                              const to = toPos;

                              // Validate position bounds
                              if (from < 0 || to > state.doc.content.size || from >= to) {
                                continue;
                              }

                              // Check if this range already has a web2URL mark
                              const hasWeb2Mark =
                                schema.marks.web2URL && state.doc.rangeHasMark(from, to, schema.marks.web2URL);
                              const hasLinkMark = state.doc.rangeHasMark(from, to, schema.marks.link);

                              // Process if no mark exists or if mode doesn't match current state
                              let needsProcessing = !hasWeb2Mark;

                              // If mark exists, check if it needs mode update
                              if (hasWeb2Mark) {
                                // Get existing mark to check its mode
                                let existingMark: any = null;
                                state.doc.nodesBetween(from, to, node => {
                                  if (node.isText) {
                                    node.marks.forEach(mark => {
                                      if (mark.type.name === 'web2URL') {
                                        existingMark = mark;
                                      }
                                    });
                                  }
                                });

                                if (existingMark) {
                                  const isCurrentlyEditMode = !!existingMark.attrs?.editMode;
                                  const shouldBeEditMode = editorView.editable;

                                  // Extract current URL from markdown for comparison
                                  const markdownMatch = url.match(/\[([^\]]+)\]\(([^)]+)\)/);
                                  const currentUrl = markdownMatch ? markdownMatch[2] : url;
                                  const existingUrl = existingMark.attrs?.url || '';

                                  // Need to update if mode doesn't match OR URL has changed
                                  needsProcessing = isCurrentlyEditMode !== shouldBeEditMode ||
                                    existingUrl !== (currentUrl.startsWith('http') ? currentUrl : `https://${currentUrl}`);
                                }
                              }

                              if (needsProcessing) {
                                // Check if this is a markdown link or standalone URL
                                const markdownMatch = url.match(/\[([^\]]+)\]\(([^)]+)\)/);
                                const isMarkdownLink = !!markdownMatch;
                                const actualUrl = markdownMatch ? markdownMatch[2] : url;
                                const linkText = markdownMatch ? markdownMatch[1] : url;

                                if (schema.marks.web2URL) {
                                  // Remove existing web2URL mark first if updating mode
                                  if (hasWeb2Mark) {
                                    newTr.removeMark(from, to, schema.marks.web2URL);
                                  }

                                  // Remove any existing link mark
                                  if (hasLinkMark) {
                                    newTr.removeMark(from, to, schema.marks.link);
                                  }

                                  if (isMarkdownLink) {
                                    // MARKDOWN LINK: Mode-aware rendering
                                    if (!editorView.editable) {
                                      // VIEW MODE: Convert to styled span
                                      const web2Mark = schema.marks.web2URL.create({
                                        url: actualUrl.startsWith('http') ? actualUrl : `https://${actualUrl}`,
                                        editMode: false,
                                      });

                                      // Replace markdown with styled text
                                      newTr.replaceWith(from, to, schema.text(linkText, [web2Mark]));
                                      hasChanges = true;
                                    } else {
                                      // EDIT MODE: Keep as markdown but add subtle styling
                                      const web2Mark = schema.marks.web2URL.create({
                                        url: actualUrl.startsWith('http') ? actualUrl : `https://${actualUrl}`,
                                        editMode: true,
                                      });

                                      // Apply mark to the entire markdown text for subtle styling
                                      newTr.addMark(from, to, web2Mark);
                                      hasChanges = true;
                                    }
                                  } else {
                                    // STANDALONE URL: Always convert to invalid link (no mode-aware behavior)
                                    const web2Mark = schema.marks.web2URL.create({
                                      url: actualUrl.startsWith('http') ? actualUrl : `https://${actualUrl}`,
                                      editMode: false, // Always use view mode styling for standalone URLs
                                    });

                                    // Replace standalone URL with styled text
                                    newTr.replaceWith(from, to, schema.text(linkText, [web2Mark]));
                                    hasChanges = true;
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  });

                  // Apply changes if any were made and editor is still valid
                  if (hasChanges && !editorView.isDestroyed) {
                    editorView.dispatch(newTr);
                  }
                } catch (error) {
                  console.warn('Web2URLExtension update error:', error);
                } finally {
                  rafId = null;
                }
              });
              updateTimeout = null;
            }, 150); // Debounce delay: 150ms
          };

          // Update classes on initial load
          setTimeout(updateLinkClasses, 0);

          return {
            update: (view, prevState) => {
              // Check if editable state changed
              const editableStateChanged = view.editable !== previousEditableState;
              if (editableStateChanged) {
                previousEditableState = view.editable;
              }

              // Update if document changed OR if editable state changed (mode switching)
              if (!isDestroyed && (view.state.doc !== prevState.doc || editableStateChanged)) {
                updateLinkClasses();
              }
            },
            // Handle paste events to process markdown links immediately
            handleDOMEvents: {
              paste: () => {
                // Process web2 URLs after paste is handled by TipTap
                setTimeout(() => {
                  if (!isDestroyed) {
                    updateLinkClasses();
                  }
                }, 0);
                return false; // Let TipTap handle the paste normally
              },
            },
            destroy: () => {
              // Mark as destroyed to prevent any further operations
              isDestroyed = true;

              // Clean up pending timeout and animation frame
              if (updateTimeout !== null) {
                clearTimeout(updateTimeout);
                updateTimeout = null;
              }
              if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
              }
            },
          };
        },
      }),
    ];
  },
});
