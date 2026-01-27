import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import { GraphLinkTooltip } from './graph-link-tooltip';

export const createGraphLinkHoverExtension = (spaceId: string) => {
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
            console.log('GraphLinkHoverExtension initialized for spaceId:', spaceId);

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

                const linkText = linkElement.textContent || '';

                try {
                  component = new ReactRenderer(GraphLinkTooltip, {
                      props: {
                        linkText,
                        linkUrl,
                        parentTippy: null, // Will be set after popup creation
                        editor: editor, // Pass editor instance
                        onShowConnection: () => {
                          // Extract entity ID from URL
                          const entityId = linkUrl.replace('graph://', '');

                          // Use the spaceId passed to the extension
                          const currentSpaceId = spaceId;

                          // Navigate to entity connection view
                          const entityUrl = `/space/${currentSpaceId}/${entityId}`;

                          // Open in new tab
                          window.open(entityUrl, '_blank');

                          hide();
                        },
                        onRemoveLink: () => {
                          // Remove the link from the editor
                          const { state, dispatch } = editorView;
                          let transaction = state.tr;

                          try {
                            // Find all positions of this link in the document
                            state.doc.descendants((node: any, pos: number) => {
                              if (node.isText) {
                                node.marks.forEach((mark: any) => {
                                  if (mark.type.name === 'link' && mark.attrs.href === linkUrl) {
                                    // Remove the link mark but keep the text
                                    const from = pos;
                                    const to = pos + node.nodeSize;
                                    transaction = transaction.removeMark(from, to, mark);
                                  }
                                });
                              }
                            });

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
                      interactiveBorder: 30, // Larger border for nested tooltip navigation
                      placement: 'top',
                      theme: 'light',
                      arrow: false,
                      offset: [0, 0],
                      maxWidth: 300,
                      zIndex: 9999,
                      appendTo: document.body,
                      delay: [0, 0], // longer hide delay for nested tooltip UX
                      duration: [100, 150], // animation duration
                      trigger: 'mouseenter',
                      hideOnClick: false, // Don't hide on click
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

                    // Update component with parentTippy reference
                    if (component && popup) {
                      component.updateProps({
                        ...component.props,
                        parentTippy: popup,
                      });
                    }
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

              if (linkId !== lastHoverId) {
                lastHoverId = linkId;
                currentLinkElement = linkElement;
                const linkUrl = linkElement.getAttribute('href') || '';
                show(linkElement, linkUrl);
              }
            };

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
