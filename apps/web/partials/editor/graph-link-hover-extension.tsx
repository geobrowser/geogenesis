import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Mark } from '@tiptap/pm/model';
import { ReactRenderer } from '@tiptap/react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';

import { NavUtils } from '~/core/utils/utils';

import { GraphLinkTooltip } from './graph-link-tooltip';

export const createGraphLinkHoverExtension = (spaceId: string, router: AppRouterInstance) => {
  return Extension.create({
    name: 'graphLinkHover',

    addProseMirrorPlugins() {
      const { editor } = this;

      return [
        new Plugin({
          key: new PluginKey(this.name),
          view(editorView) {
            let component: ReactRenderer | null = null;
            let popupElement: HTMLDivElement | null = null;
            let currentLinkElement: HTMLAnchorElement | null = null;
            let lastHoverId: string | null = null;
            let isDestroyed = false;
            let showTimeout: ReturnType<typeof setTimeout> | null = null;
            let cleanupAutoUpdate: (() => void) | null = null;

            const shouldShow = (target: Element): HTMLAnchorElement | null => {
              // Check if we're hovering over a graph:// link
              const linkElement = target.closest('a') as HTMLAnchorElement;

              if (linkElement && linkElement.getAttribute('href')?.startsWith('graph://')) {
                return linkElement;
              }

              return null;
            };

            const updatePosition = () => {
              if (!popupElement || !currentLinkElement) return;

              // strategy:'fixed' is required because the popup uses
              // `position:fixed`. Without it, computePosition returns
              // document-relative coordinates that cause the tooltip to drift
              // during scroll.
              computePosition(currentLinkElement, popupElement, {
                placement: 'top',
                strategy: 'fixed',
                middleware: [offset(8), flip(), shift({ padding: 8 })],
              }).then(({ x, y }) => {
                if (popupElement) {
                  popupElement.style.left = `${x}px`;
                  popupElement.style.top = `${y}px`;
                }
              });
            };

            const show = (linkElement: HTMLAnchorElement, linkUrl: string) => {
              if (isDestroyed || !editorView) return;

              // Check if editor is in edit mode
              if (!editor.isEditable) return;

              if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
              }

              if (currentLinkElement === linkElement && popupElement) {
                return; // Already showing for this link
              }

              showTimeout = setTimeout(() => {
                showTimeout = null;
                if (isDestroyed || !editor.isEditable) return;

                // Check if we are still hovering the intended element
                if (currentLinkElement !== linkElement) return;

                // Destroy existing popup and component
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

                const entityId = linkUrl.replace('graph://', '');

                // Read cached entity data from data attributes (avoids fetching)
                const cachedEntityName = linkElement.getAttribute('data-entity-name');
                const cachedEntitySpaceId = linkElement.getAttribute('data-space-id');

                try {
                  // Create popup container. top/left are initialised to 0 so
                  // the fixed element is placed at the origin before
                  // computePosition applies the final coordinates.
                  popupElement = document.createElement('div');
                  popupElement.style.position = 'fixed';
                  popupElement.style.top = '0';
                  popupElement.style.left = '0';
                  popupElement.style.zIndex = '9999';
                  document.body.appendChild(popupElement);

                  component = new ReactRenderer(GraphLinkTooltip, {
                    props: {
                      linkUrl,
                      spaceId,
                      entityId,
                      entityName: cachedEntityName || undefined,
                      entitySpaceId: cachedEntitySpaceId || undefined,
                      onShowConnection: () => {
                        // Validate entity ID before navigation
                        if (!entityId) {
                          return;
                        }

                        try {
                          router.push(NavUtils.toEntity(spaceId, entityId));
                        } catch (error) {
                          // Navigation failed silently
                        }

                        hide();
                      },
                      onRemoveLink: () => {
                        // Remove the link from the editor
                        const { state, dispatch } = editorView;
                        let transaction = state.tr;

                        try {
                          // Find the position of the current link element
                          if (currentLinkElement) {
                            const pos = editorView.posAtDOM(currentLinkElement, 0);

                            if (pos !== null) {
                              // Get the node at this position
                              const node = state.doc.nodeAt(pos);

                              if (node && node.isText) {
                                // Find and remove the link mark from this specific node
                                node.marks.forEach((mark: Mark) => {
                                  if (mark.type.name === 'link' && mark.attrs.href === linkUrl) {
                                    // Remove the link mark but keep the text
                                    const from = pos;
                                    const to = pos + node.nodeSize;
                                    transaction = transaction.removeMark(from, to, mark);
                                  }
                                });
                              }
                            }
                          }

                          // Apply the transaction
                          dispatch(transaction);
                        } catch (error) {
                          // Error removing link silently
                        }

                        hide();
                      },
                      onCopy: () => {
                        // Copy link URL to clipboard
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(linkUrl).catch(() => {
                            // Failed to copy silently
                          });
                        } else {
                          // Fallback for older browsers
                          const textArea = document.createElement('textarea');
                          textArea.value = linkUrl;
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand('copy');
                          document.body.removeChild(textArea);
                        }
                        hide();
                      },
                      onClose: () => {
                        hide();
                      },
                    },
                    editor,
                  });

                  // Append the renderer element to our popup container
                  if (popupElement && component?.element) {
                    popupElement.appendChild(component.element);
                  }

                  // Position the popup
                  updatePosition();

                  // Set up auto-update for position
                  cleanupAutoUpdate = autoUpdate(linkElement, popupElement, updatePosition);

                  currentLinkElement = linkElement;
                } catch (error) {
                  // GraphLinkHover error silently
                }
              }, 50); // End setTimeout
            };

            const hide = (immediate = false) => {
              if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
              }

              if (cleanupAutoUpdate) {
                cleanupAutoUpdate();
                cleanupAutoUpdate = null;
              }

              if (popupElement) {
                popupElement.remove();
                popupElement = null;
              }

              // Reset component to ensure fresh state
              if (component) {
                component.destroy();
                component = null;
              }

              currentLinkElement = null;
              lastHoverId = null;
            };

            const handleMouseEnter = (event: Event) => {
              // Only show hover card in edit mode, not read mode
              if (!editor.isEditable) {
                return;
              }

              const target = event.target as Element;
              const linkElement = shouldShow(target);

              // Early exit when link element is null
              if (!linkElement) return;

              const linkId = linkElement.getAttribute('href');

              // Always show the tooltip when hovering over a link
              // This fixes the issue where re-hovering the same link wouldn't show the tooltip
              lastHoverId = linkId;
              currentLinkElement = linkElement;
              const linkUrl = linkElement.getAttribute('href') || '';
              show(linkElement, linkUrl);
            };

            // Listen for editor editable state changes to hide tooltip in read mode
            const handleEditableChange = () => {
              if (!editor.isEditable && popupElement) {
                hide(true);
              }
            };

            // Listen to 'update' and 'focus' events to catch state changes
            editor.on('update', handleEditableChange);
            editor.on('focus', handleEditableChange);
            editor.on('blur', handleEditableChange);

            const handleMouseLeave = (event: Event) => {
              const target = event.target as Element;
              const linkElement = shouldShow(target);

              if (linkElement === currentLinkElement) {
                // Don't hide immediately - check if mouse moved to popup
                setTimeout(() => {
                  // Check if we have moved to another link in the meantime
                  if (currentLinkElement !== linkElement) {
                    return;
                  }

                  // Check if mouse is still over the link or the popup content
                  if (popupElement) {
                    const isHoveringLink = linkElement?.matches(':hover');
                    const isHoveringPopup = popupElement?.matches(':hover');

                    // Only hide if not hovering over link or popup
                    if (!isHoveringLink && !isHoveringPopup) {
                      hide();
                    }
                  }
                }, 250); // Increased delay for better UX
              }
            };

            editorView.dom.addEventListener('mouseenter', handleMouseEnter, true);
            editorView.dom.addEventListener('mouseleave', handleMouseLeave, true);

            return {
              destroy() {
                isDestroyed = true;
                if (showTimeout) {
                  clearTimeout(showTimeout);
                  showTimeout = null;
                }
                try {
                  editorView.dom.removeEventListener('mouseenter', handleMouseEnter, true);
                  editorView.dom.removeEventListener('mouseleave', handleMouseLeave, true);
                  editor.off('update', handleEditableChange);
                  editor.off('focus', handleEditableChange);
                  editor.off('blur', handleEditableChange);

                  // Clean up tooltip immediately
                  hide(true);

                  currentLinkElement = null;
                  lastHoverId = null;
                } catch (error) {
                  console.error('Error during cleanup:', error);
                  // Destroy cleanup error silently
                }
              },
            };
          },
        }),
      ];
    },
  });
};
