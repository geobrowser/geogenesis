import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';

import { detectWeb2URLsInMarkdown } from '~/core/utils/url-detection';
import { Web2LinkHoverCard } from './web2-link-tooltip';

// ============================================================================
// Constants
// ============================================================================

const HOVER_SHOW_DELAY_MS = 100;
const HOVER_HIDE_DELAY_MS = 150;
const UPDATE_DEBOUNCE_MS = 150;
const TOOLTIP_OFFSET = 8;
const TOOLTIP_Z_INDEX = 9999;
const WEB2_URL_PREFIX_REGEX = /^(https?:\/\/|www\.)/i;

export function isWeb2Url(url: string | null | undefined): url is string {
  return !!url?.trim() && WEB2_URL_PREFIX_REGEX.test(url.trim());
}

export function normalizeWeb2Url(url: string): string {
  const trimmedUrl = url.trim();
  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
}

export function isStandaloneWeb2Text(text: string, url: string): boolean {
  const trimmedText = text.trim();

  if (!trimmedText) return false;
  if (trimmedText === url) return true;
  if (!isWeb2Url(trimmedText)) return false;

  return normalizeWeb2Url(trimmedText) === normalizeWeb2Url(url);
}

export function getWeb2Replacement(text: string, url: string, isInEditMode: boolean) {
  const trimmedUrl = url.trim();

  if (isInEditMode && !isStandaloneWeb2Text(text, url)) {
    return {
      text: `[${text}](${trimmedUrl})`,
      url: trimmedUrl,
      editMode: true,
    };
  }

  return {
    text,
    url: trimmedUrl,
    editMode: isInEditMode,
  };
}

export function stripInternalWeb2HTMLAttributes(HTMLAttributes: Record<string, unknown>) {
  const {
    url: _url,
    editMode: _editMode,
    editmode: _legacyEditMode,
    ...rest
  } = HTMLAttributes;

  return rest;
}

// ============================================================================
// Custom Mark for Web2 URLs
// ============================================================================

// Custom mark for web2 URLs that renders as spans with hover cards
export const Web2URLMark = Mark.create({
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
    const cleanHTMLAttributes = stripInternalWeb2HTMLAttributes(HTMLAttributes);

    // Mode-aware rendering
    if (mark.attrs.editMode) {
      // EDIT MODE: Subtle styling for markdown
      return [
        'span',
        {
          ...cleanHTMLAttributes,
          class: 'web2-url-edit-mode',
          'data-web2-url': 'true',
          'data-url': mark.attrs.url,
          style: 'color: #e57373; cursor: text;',
        },
        0,
      ];
    } else {
      // VIEW MODE: Normal text
      return [
        'span',
        {
          ...cleanHTMLAttributes,
          // Keep data attributes for persistence and re-parsing
          'data-web2-url': 'true',
          'data-url': mark.attrs.url,
          // Explicitly clear class and style to ensure normal text appearance
          class: '',
          style: 'color: inherit; text-decoration: none; background-color: transparent; cursor: inherit;',
        },
        0,
      ];
    }
  },
});

// ============================================================================
// Web2 URL Extension
// ============================================================================

// Links aren't clickable in browse mode but still appear in text; add external links in the properties panel.
export const Web2URLExtension = Extension.create({
  name: 'web2URLHighlight',

  priority: 1000, // Higher priority than Link extension

  addExtensions() {
    return [Web2URLMark];
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      // Plugin for hover card functionality using Floating UI
      new Plugin({
        key: new PluginKey('web2URLHoverCard'),
        view(editorView) {
          let component: ReactRenderer | null = null;
          let popupElement: HTMLDivElement | null = null;
          let currentHoveredSpan: Element | null = null;
          let isDestroyed = false;
          let showTimeout: ReturnType<typeof setTimeout> | null = null;
          let hideTimeout: ReturnType<typeof setTimeout> | null = null;
          let cleanupAutoUpdate: (() => void) | null = null;

          const updatePosition = () => {
            if (!popupElement || !currentHoveredSpan) return;

            // strategy:'fixed' is required because the popup uses
            // `position:fixed`. Without it, computePosition returns
            // document-relative coordinates that cause the tooltip to drift
            // during scroll.
            computePosition(currentHoveredSpan, popupElement, {
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

          const showHoverCard = (element: Element) => {
            if (isDestroyed || !editorView) return;

            // Check if editor is in edit mode
            if (!editor.isEditable) return;

            // Clean up existing popup
            if (cleanupAutoUpdate) {
              cleanupAutoUpdate();
              cleanupAutoUpdate = null;
            }
            if (popupElement) {
              popupElement.remove();
              popupElement = null;
            }
            if (component) {
              component.destroy();
              component = null;
            }

            try {
              // Create popup container. top/left are initialised to 0 so the
              // fixed element is placed at the origin before computePosition
              // applies the final coordinates, preventing a flash at an
              // arbitrary browser-default scroll position.
              popupElement = document.createElement('div');
              popupElement.style.position = 'fixed';
              popupElement.style.top = '0';
              popupElement.style.left = '0';
              popupElement.style.zIndex = String(TOOLTIP_Z_INDEX);

              popupElement.addEventListener('mouseleave', () => {
                if (hideTimeout) {
                  clearTimeout(hideTimeout);
                }

                hideTimeout = setTimeout(() => {
                  const isStillHovering = currentHoveredSpan?.matches(':hover');
                  const isTooltipHovered = popupElement?.matches(':hover');

                  if (!isStillHovering && !isTooltipHovered) {
                    hideHoverCard();
                  }
                  hideTimeout = null;
                }, HOVER_HIDE_DELAY_MS);
              });

              document.body.appendChild(popupElement);

              // Create ReactRenderer component
              component = new ReactRenderer(Web2LinkHoverCard, {
                props: {},
                editor,
              });

              // Append the renderer element to our popup container
              if (popupElement && component?.element) {
                popupElement.appendChild(component.element);
              }

              // Position the popup
              currentHoveredSpan = element;
              updatePosition();

              // Set up auto-update for position
              cleanupAutoUpdate = autoUpdate(element, popupElement, updatePosition);
            } catch (error) {
              console.warn('Web2URLExtension hover card error:', error);
            }
          };

          const hideHoverCard = () => {
            if (cleanupAutoUpdate) {
              cleanupAutoUpdate();
              cleanupAutoUpdate = null;
            }
            if (popupElement) {
              popupElement.remove();
              popupElement = null;
            }
            if (component) {
              component.destroy();
              component = null;
            }
            currentHoveredSpan = null;
          };

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

          const handleMouseEnter = (event: Event) => {
            // Disable hover card in View Mode - check dynamically
            if (!editor.isEditable) return;

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
                if (currentHoveredSpan) {
                  hideHoverCard();
                }

                // Debounce show to prevent flickering on rapid hover changes
                showTimeout = setTimeout(() => {
                  // Double-check the element is still hovered before showing
                  if (web2Span.matches(':hover') && editor.isEditable) {
                    showHoverCard(web2Span);
                  }
                  showTimeout = null;
                }, HOVER_SHOW_DELAY_MS);
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
                const isTooltipHovered = popupElement?.matches(':hover');

                if (!isStillHovering && !isTooltipHovered) {
                  hideHoverCard();
                }
                hideTimeout = null;
              }, HOVER_HIDE_DELAY_MS);
            }
          };

          // Listen for editor editable state changes to hide tooltip in read mode
          const handleEditableChange = () => {
            if (!editor.isEditable && popupElement) {
              hideHoverCard();
            }
          };

          // Listen to events to catch state changes
          editor.on('update', handleEditableChange);
          editor.on('focus', handleEditableChange);
          editor.on('blur', handleEditableChange);

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
                editor.off('update', handleEditableChange);
                editor.off('focus', handleEditableChange);
                editor.off('blur', handleEditableChange);

                // Clean up hover card
                hideHoverCard();
              } catch (error) {
                console.warn('Web2URLExtension destroy cleanup warning:', error);
              }
            },
          };
        },
      }),
      // Plugin for URL detection and marking
      new Plugin({
        key: new PluginKey('web2URLDetection'),
        view(editorView) {
          let rafId: number | null = null;
          let updateTimeout: ReturnType<typeof setTimeout> | null = null;
          let isDestroyed = false;
          let previousEditableState = editor.isEditable;

          interface TextNodeInfo {
            node: PMNode;
            startPos: number;
            endPos: number;
          }

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

                  // Get current edit mode dynamically
                  const isInEditMode = editor.isEditable;

                  // Create a new transaction to avoid conflicts
                  const newTr = state.tr;

                  // Convert parsed external link marks from imported markdown/html into our
                  // custom web2URL mark so they render consistently with detected web2 links.
                  state.doc.descendants((node, pos) => {
                    if (node.isText && schema.marks.web2URL && schema.marks.link) {
                      const text = node.text ?? '';
                      const externalLinkMark = node.marks.find(
                        mark => mark.type.name === 'link' && isWeb2Url(mark.attrs?.href) && !mark.attrs?.href?.startsWith('graph://')
                      );

                      if (externalLinkMark && text) {
                        const originalStart = pos;
                        const originalEnd = originalStart + node.nodeSize;
                        const from = newTr.mapping.map(originalStart);
                        const to = newTr.mapping.map(originalEnd);

                        if (from >= 0 && to <= newTr.doc.content.size && from < to) {
                          const replacement = getWeb2Replacement(text, externalLinkMark.attrs.href, isInEditMode);
                          const web2Mark = schema.marks.web2URL.create({
                            url: replacement.url,
                            editMode: replacement.editMode,
                          });

                          newTr.removeMark(from, to, schema.marks.link);
                          newTr.removeMark(from, to, schema.marks.web2URL);

                          if (replacement.text === text) {
                            newTr.addMark(from, to, web2Mark);
                          } else {
                            newTr.replaceWith(from, to, schema.text(replacement.text, [web2Mark]));
                          }

                          hasChanges = true;
                        }
                      }
                    }

                    // Process text blocks to handle text that may be split across multiple text nodes.
                    // Paragraphs and headings need this when switching between edit and browse modes.
                    if (node.isTextblock && node.type.name !== 'codeBlock') {
                      // Early exit if block has no content
                      if (!node.content.size) {
                        return;
                      }

                      // Check for web2URL marks that need reversion to Markdown in Edit Mode
                      if (isInEditMode) {
                        let relativePosTracker = 0;
                        node.content.forEach((child) => {
                          const childSize = child.nodeSize;
                          if (child.isText && child.marks) {
                            const web2Mark = child.marks.find(m => m.type.name === 'web2URL');
                            if (web2Mark) {
                              const url = web2Mark.attrs.url;
                              const text = child.text || '';

                              // Check if already markdown
                              const isMarkdown = /^\[.*\]\(.*\)$/.test(text);

                              // Check if standalone URL (heuristic)
                              const isStandalone = isStandaloneWeb2Text(text, url);

                              if (!isMarkdown && !isStandalone) {
                                const originalStart = pos + 1 + relativePosTracker;
                                const originalEnd = originalStart + childSize;

                                // Map positions to account for changes made in this transaction
                                const from = newTr.mapping.map(originalStart);
                                const to = newTr.mapping.map(originalEnd);

                                const markdownText = `[${text}](${url})`;
                                const newMark = schema.marks.web2URL.create({
                                  url,
                                  editMode: true,
                                });

                                newTr.replaceWith(from, to, schema.text(markdownText, [newMark]));
                                hasChanges = true;
                              }
                            }
                          }
                          relativePosTracker += childSize;
                        });
                      }

                      // Collect all text content from the paragraph
                      let blockText = '';
                      const textNodePositions: TextNodeInfo[] = [];

                      node.descendants((textNode, relativePos) => {
                        if (textNode.isText && textNode.text) {
                          const absolutePos = pos + 1 + relativePos; // +1 for paragraph node offset
                          textNodePositions.push({
                            node: textNode,
                            startPos: absolutePos,
                            endPos: absolutePos + textNode.nodeSize
                          });
                          blockText += textNode.text;
                        }
                      });

                      // Early exit if no text content or no potential markdown/URL syntax
                      if (!blockText || (!blockText.includes('[') && !blockText.includes('http') && !blockText.includes('www.'))) {
                        return;
                      }

                      const urls = detectWeb2URLsInMarkdown(blockText);

                      if (urls.length > 0) {
                        let searchStartIndex = 0;

                        for (const url of urls) {
                          const urlIndex = blockText.indexOf(url, searchStartIndex);
                          if (urlIndex !== -1) {
                            searchStartIndex = urlIndex + url.length;

                            // Find the actual document positions for this URL span
                            let currentTextPos = 0;
                            let fromPos = -1;
                            let toPos = -1;

                            for (const textNodeInfo of textNodePositions) {
                              const nodeText = textNodeInfo.node.text;
                              if (!nodeText) continue;
                              
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
                              const from = newTr.mapping.map(fromPos);
                              const to = newTr.mapping.map(toPos);

                              // Validate position bounds
                              if (from < 0 || to > newTr.doc.content.size || from >= to) {
                                continue;
                              }

                              // Check if this range already has a web2URL mark
                              const hasWeb2Mark =
                                schema.marks.web2URL && newTr.doc.rangeHasMark(from, to, schema.marks.web2URL);
                              const hasLinkMark = newTr.doc.rangeHasMark(from, to, schema.marks.link);

                              // Process if no mark exists or if mode doesn't match current state
                              let needsProcessing = !hasWeb2Mark;

                              // If mark exists, check if it needs mode update
                              if (hasWeb2Mark) {
                                // Get existing mark to check its mode
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                let existingMark: any = null;
                                newTr.doc.nodesBetween(from, to, node => {
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
                                  const shouldBeEditMode = isInEditMode;

                                  // Extract current URL from markdown for comparison
                                  const markdownMatch = url.match(/\[([^\]]+)\]\(([^)]+)\)/);
                                  const currentUrl = markdownMatch ? markdownMatch[2] : url;
                                  const existingUrl = existingMark.attrs?.url || '';

                                  // Need to update if mode doesn't match OR URL has changed
                                  needsProcessing = isCurrentlyEditMode !== shouldBeEditMode ||
                                    normalizeWeb2Url(existingUrl) !== normalizeWeb2Url(currentUrl);
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
                                    if (!isInEditMode) {
                                      // VIEW MODE: Convert to styled span
                                      const web2Mark = schema.marks.web2URL.create({
                                        url: actualUrl,
                                        editMode: false,
                                      });

                                      // Replace markdown with styled text
                                      newTr.replaceWith(from, to, schema.text(linkText, [web2Mark]));
                                      hasChanges = true;
                                    } else {
                                      // EDIT MODE: Keep as markdown but add subtle styling
                                      const web2Mark = schema.marks.web2URL.create({
                                        url: actualUrl,
                                        editMode: true,
                                      });

                                      // Apply mark to the entire markdown text for subtle styling
                                      newTr.addMark(from, to, web2Mark);
                                      hasChanges = true;
                                    }
                                  } else {
                                    // STANDALONE URL: Mode-aware rendering
                                    const web2Mark = schema.marks.web2URL.create({
                                      url: actualUrl,
                                      editMode: isInEditMode,
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
            }, UPDATE_DEBOUNCE_MS);
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
