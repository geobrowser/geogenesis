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
          let isDestroyed = false;

          const shouldShow = (target: Element): HTMLAnchorElement | null => {
            // Check if we're hovering over a graph:// link
            const linkElement = target.closest('a') as HTMLAnchorElement;

            if (linkElement && linkElement.getAttribute('href')?.startsWith('graph://')) {
              return linkElement;
            }

            return null;
          };

          const show = (linkElement: HTMLAnchorElement, linkUrl: string) => {
            console.log('GraphLinkHover: show() called', { linkElement, linkUrl, isDestroyed, editorView });

            if (isDestroyed || !editorView) return;

            if (currentLinkElement === linkElement && popup && popup.state.isVisible) {
              console.log('GraphLinkHover: Already showing for this link');
              return; // Already showing for this link
            }

            // Always hide any existing tooltip to ensure clean state
            hide();

            // Add small delay to ensure cleanup is complete
            setTimeout(() => {
              if (isDestroyed) return;
              
              const linkText = linkElement.textContent || '';
              console.log('GraphLinkHover: Creating tooltip with text:', linkText);

            try {
              if (!component) {
                console.log('GraphLinkHover: Creating new ReactRenderer');
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
                        navigator.clipboard
                          .writeText(linkUrl)
                          .then(() => {
                            console.log('Link copied to clipboard');
                          })
                          .catch(err => {
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
                        console.log('Link copied to clipboard (fallback)');
                      }
                      hide();
                    },
                    onClose: () => {
                      hide();
                    },
                  },
                  editor,
                });
              } else {
                // Update existing component with new props
                component.updateProps({
                  linkText,
                  linkUrl,
                  editor: editor, // Pass editor instance
                  onShowConnection: () => {
                    const entityId = linkUrl.replace('graph://', '');
                    const currentSpaceId = spaceId;
                    const entityUrl = `/space/${currentSpaceId}/${entityId}`;
                    window.open(entityUrl, '_blank');
                    hide();
                  },
                  onRemoveLink: () => {
                    const { state, dispatch } = editorView;
                    let transaction = state.tr;

                    try {
                      state.doc.descendants((node: any, pos: number) => {
                        if (node.isText) {
                          node.marks.forEach((mark: any) => {
                            if (mark.type.name === 'link' && mark.attrs.href === linkUrl) {
                              const from = pos;
                              const to = pos + node.nodeSize;
                              transaction = transaction.removeMark(from, to, mark);
                            }
                          });
                        }
                      });

                      dispatch(transaction);
                    } catch (error) {
                      console.error('Error removing link:', error);
                    }

                    hide();
                  },
                  onCopy: () => {
                    // Copy link URL to clipboard
                    if (navigator.clipboard) {
                      navigator.clipboard
                        .writeText(linkUrl)
                        .then(() => {
                          console.log('Link copied to clipboard');
                        })
                        .catch(err => {
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
                      console.log('Link copied to clipboard (fallback)');
                    }
                    hide();
                  },
                  onClose: () => {
                    hide();
                  },
                });
              }

              if (!popup && component?.element) {
                popup = tippy(linkElement, {
                  content: component.element,
                  interactive: true,
                  interactiveBorder: 30, // Larger border for nested tooltip navigation
                  placement: 'top',
                  theme: 'light',
                  arrow: false,
                  offset: [0, 8],
                  maxWidth: 300,
                  zIndex: 9999,
                  appendTo: document.body,
                  delay: [200, 400], // longer hide delay for nested tooltip UX
                  duration: [200, 150], // animation duration
                  trigger: 'mouseenter',
                  hideOnClick: false, // Don't hide on click
                  onHide: () => {
                    currentLinkElement = null;
                  },
                  onShow: () => {
                    console.log('GraphLinkHover: Tippy shown');
                  },
                });
                console.log('GraphLinkHover: Tippy instance created:', popup);

                // Update component with parentTippy reference
                if (component && popup) {
                  component.updateProps({
                    ...component.props,
                    parentTippy: popup,
                  });
                }
              }

              if (popup) {
                console.log('GraphLinkHover: Showing popup');
                popup.show();
                currentLinkElement = linkElement;
              } else {
                console.log('GraphLinkHover: No popup to show');
              }
            } catch (error) {
              console.warn('GraphLinkHover error:', error);
            }
            }, 50); // End setTimeout
          };

          const hide = () => {
            if (popup) {
              popup.hide();
              // Don't destroy immediately, let tippy handle it
              setTimeout(() => {
                if (popup && !popup.state.isVisible) {
                  popup.destroy();
                  popup = null;
                }
              }, 100);
            }
            
            // Reset component to ensure fresh state
            if (component) {
              component.destroy();
              component = null;
            }
            
            currentLinkElement = null;
          };

          const handleMouseEnter = (event: Event) => {
            console.log('GraphLinkHover: mouseenter event', event.target);

            // Only show hover card in edit mode, not read mode
            if (!editorView.editable) {
              console.log('GraphLinkHover: Editor is not editable, not showing tooltip');
              return;
            }

            const target = event.target as Element;
            const linkElement = shouldShow(target);
            
            //add early exit when link element null
            if (!linkElement) return;

            console.log('GraphLinkHover: Link element found:', linkElement);

            if (linkElement && linkElement !== currentLinkElement) {
              // Hide any existing popup first
              if (popup && currentLinkElement !== linkElement) {
                hide();
              }

              currentLinkElement = linkElement;
              const linkUrl = linkElement.getAttribute('href') || '';
              console.log('GraphLinkHover: Showing tooltip for:', linkUrl);
              show(linkElement, linkUrl);
            }
          };

          const handleMouseLeave = (event: Event) => {
            const target = event.target as Element;
            const linkElement = shouldShow(target);

            if (linkElement === currentLinkElement) {
              // Don't hide immediately - let tippy handle the interactive logic
              setTimeout(() => {
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
              try {
                editorView.dom.removeEventListener('mouseenter', handleMouseEnter, true);
                editorView.dom.removeEventListener('mouseleave', handleMouseLeave, true);

                // Clean up tooltip
                hide();

                // Clean up component
                if (component) {
                  component.destroy();
                  component = null;
                }

                currentLinkElement = null;
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
    const floatingElements = document.querySelectorAll('[data-tippy-root]');
    floatingElements.forEach(element => {
      try {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      } catch (error) {
        console.warn('GraphLinkHover cleanup warning:', error);
      }
    });
  },
  });
};
