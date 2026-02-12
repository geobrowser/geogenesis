import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import tippy, { Instance } from 'tippy.js';

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
            let popup: Instance | null = null;
            let currentLinkElement: HTMLAnchorElement | null = null;
            let lastHoverId: string | null = null;
            let isDestroyed = false;
            let showTimeout: ReturnType<typeof setTimeout> | null = null;

            const shouldShow = (target: Element): HTMLAnchorElement | null => {
              // Check if we're hovering over a graph:// link
              const linkElement = target.closest('a') as HTMLAnchorElement;

              if (linkElement && linkElement.getAttribute('href')?.startsWith('graph://')) {
                return linkElement;
              }

              return null;
            };

            const show = (linkElement: HTMLAnchorElement, linkUrl: string) => {
              if (isDestroyed || !editorView) return;

              if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
              }

              if (currentLinkElement === linkElement && popup && popup.state.isVisible) {
                return; // Already showing for this link
              }

              showTimeout = setTimeout(() => {
                showTimeout = null;
                if (isDestroyed || !editor.isEditable) return;

                // Check if we are still hovering the intended element
                if (currentLinkElement !== linkElement) return;

                // Destroy existing popup and component
                if (popup) {
                  popup.destroy();
                  popup = null;
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
                          console.error('Invalid graph link: empty entity ID');
                          return;
                        }

                        try {
                          router.push(NavUtils.toEntity(spaceId, entityId));
                        } catch (error) {
                          console.error('Navigation failed:', error);
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
                                node.marks.forEach((mark: any) => {
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
                          console.error('Error removing link:', error);
                        }

                        hide();
                      },
                      onCopy: () => {
                        // Copy link URL to clipboard
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(linkUrl).catch(err => {
                            console.error('Failed to copy link:', err);
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

                  if (!popup && component?.element) {
                    popup = tippy(linkElement, {
                      content: component.element,
                      interactive: true,
                      interactiveBorder: 10,
                      placement: 'top',
                      theme: 'light',
                      arrow: false,
                      offset: [0, 0],
                      maxWidth: 300,
                      zIndex: 9999,
                      appendTo: document.body,
                      delay: [0, 0],
                      duration: [100, 150],
                      trigger: 'mouseenter',
                      hideOnClick: false,
                      onShow: () => {
                        // Prevent showing tooltip in read mode
                        if (!editor.isEditable) {
                          return false;
                        }
                      },
                      onHide: () => {
                        if (
                          popup &&
                          popup.popper.getAttribute('data-link-href') === currentLinkElement?.getAttribute('href')
                        ) {
                          currentLinkElement = null;
                        }
                      },
                    });

                    // Set data attribute to identify the popup
                    popup.popper.setAttribute('data-link-href', linkUrl);
                  }

                  if (popup) {
                    popup.show();
                    currentLinkElement = linkElement;
                  }
                } catch (error) {
                  console.warn('GraphLinkHover error:', error);
                }
              }, 50); // End setTimeout
            };

            const hide = (immediate = false) => {
              if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
              }

              if (popup) {
                if (immediate) {
                  popup.destroy();
                  popup = null;
                } else {
                  popup.hide();
                  // Don't destroy immediately, let tippy handle it
                  setTimeout(() => {
                    if (popup && !popup.state.isVisible) {
                      popup.destroy();
                      popup = null;
                    }
                  }, 50);
                }
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

              //add early exit when link element null
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
              if (!editor.isEditable && popup && popup.state.isVisible) {
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
                // Don't hide immediately - let tippy handle the interactive logic
                setTimeout(() => {
                  // Check if we have moved to another link in the meantime
                  if (currentLinkElement !== linkElement) {
                    return;
                  }

                  // Check if mouse is still over the link or the popup content
                  if (popup && popup.state.isVisible) {
                    const isHoveringLink = linkElement?.matches(':hover');
                    const isHoveringPopup = popup.popper?.matches(':hover');

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

                  // Clean up component
                  if (component) {
                    component.destroy();
                    component = null;
                  }

                  currentLinkElement = null;
                  lastHoverId = null;
                } catch (error) {
                  console.warn('GraphLinkHover destroy cleanup warning:', error);
                }
              },
            };
          },
        }),
      ];
    },

    onDestroy() {
      // Additional cleanup when extension is destroyed
      // Only remove tippy instances that are related to our graph links
      const floatingElements = document.querySelectorAll('[data-tippy-root]');
      floatingElements.forEach(element => {
        try {
          // Check if the popper has our specific attribute
          const popper = element.querySelector('[data-link-href]');
          if (popper && element.parentNode) {
            element.parentNode.removeChild(element);
          }
        } catch (error) {
          console.warn('GraphLinkHover cleanup warning:', error);
        }
      });
    },
  });
};
