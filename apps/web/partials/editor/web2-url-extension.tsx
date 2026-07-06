import { Extension, Mark } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform';

import { detectWeb2URLsInMarkdown, isWeb2Url, normalizeWeb2Url } from '~/core/utils/url-detection';

// Re-exported so existing importers (and tests) can keep importing from here.
export { isWeb2Url, normalizeWeb2Url } from '~/core/utils/url-detection';

// ============================================================================
// Constants
// ============================================================================

const UPDATE_DEBOUNCE_MS = 150;

function getChangedRanges(tr: Transaction): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  tr.steps.forEach(step => {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      ranges.push({ from: step.from, to: step.to });
    }
  });
  // Merge overlapping ranges
  ranges.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const range of ranges) {
    if (merged.length === 0 || merged[merged.length - 1].to < range.from) {
      merged.push(range);
    } else {
      merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, range.to);
    }
  }
  return merged;
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
  const { url: _url, editMode: _editMode, editmode: _legacyEditMode, ...rest } = HTMLAttributes;

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

  // Only exclude conflicting link-style marks so other formatting can coexist
  excludes: 'link web2URL',

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
      // View mode renders the mark as an <a data-web2-url>, so parse it back
      // symmetrically (e.g. when rendered content is copied/pasted).
      {
        tag: 'a[data-web2-url]',
        getAttrs: element => ({
          url: (element as HTMLElement).getAttribute('data-url'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    const cleanHTMLAttributes = stripInternalWeb2HTMLAttributes(HTMLAttributes);

    const url = typeof mark.attrs.url === 'string' ? mark.attrs.url.trim() : '';

    // VIEW MODE with a valid URL: render as a clickable anchor.
    // Guard on `url` so normalizeWeb2Url is never called with a null/empty url
    // (e.g. a <span data-web2-url> parsed without a data-url attribute), which
    // would throw during rendering.
    if (!mark.attrs.editMode && url) {
      return [
        'a',
        {
          ...cleanHTMLAttributes,
          href: normalizeWeb2Url(url),
          'data-web2-url': 'true',
          'data-url': url,
          target: '_blank',
          rel: 'noopener noreferrer',
          style: 'color: #202020; text-decoration: underline; cursor: pointer;',
        },
        0,
      ];
    } else {
      // EDIT MODE (or missing URL): render as a plain span to preserve markdown
      // syntax visibility and avoid rendering a broken anchor.
      return [
        'span',
        {
          ...cleanHTMLAttributes,
          // Keep data attributes for persistence and re-parsing. Use the trimmed
          // url and omit data-url entirely when empty so we never serialize a
          // literal "null" or whitespace that would re-parse into a dirty value.
          'data-web2-url': 'true',
          ...(url ? { 'data-url': url } : {}),
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

// Detects external (web2) URLs in editor content and renders them as clickable
// anchors in browse mode while keeping markdown syntax visible in edit mode.
export const Web2URLExtension = Extension.create({
  name: 'web2URLHighlight',

  priority: 1000, // Higher priority than Link extension

  addExtensions() {
    return [Web2URLMark];
  },

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
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

          const updateLinkClasses = (changedRanges: { from: number; to: number }[] = []) => {
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
                      let shouldProcessText = changedRanges.length === 0;
                      if (!shouldProcessText) {
                        for (const range of changedRanges) {
                          if (pos < range.to && pos + node.nodeSize > range.from) {
                            shouldProcessText = true;
                            break;
                          }
                        }
                      }
                      if (shouldProcessText) {
                        const text = node.text ?? '';
                        const externalLinkMark = node.marks.find(
                          mark =>
                            mark.type.name === 'link' &&
                            isWeb2Url(mark.attrs?.href) &&
                            !mark.attrs?.href?.startsWith('graph://')
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
                    }

                    // Process text blocks to handle text that may be split across multiple text nodes.
                    // Paragraphs and headings need this when switching between edit and browse modes.
                    if (node.isTextblock && node.type.name !== 'codeBlock') {
                      let shouldProcessBlock = changedRanges.length === 0;
                      if (!shouldProcessBlock) {
                        for (const range of changedRanges) {
                          if (pos < range.to && pos + node.nodeSize > range.from) {
                            shouldProcessBlock = true;
                            break;
                          }
                        }
                      }
                      if (shouldProcessBlock) {
                        // Early exit if block has no content
                        if (!node.content.size) {
                          return;
                        }

                        // Check for web2URL marks that need reversion to Markdown in Edit Mode
                        if (isInEditMode) {
                          let relativePosTracker = 0;
                          node.content.forEach(child => {
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
                              endPos: absolutePos + textNode.nodeSize,
                            });
                            blockText += textNode.text;
                          }
                        });

                        // Early exit if no text content or no potential markdown/URL syntax
                        if (
                          !blockText ||
                          (!blockText.includes('[') && !blockText.includes('http') && !blockText.includes('www.'))
                        ) {
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
                                    needsProcessing =
                                      isCurrentlyEditMode !== shouldBeEditMode ||
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
                let changedRanges: { from: number; to: number }[] = [];
                if (view.state.doc !== prevState.doc) {
                  changedRanges = getChangedRanges(view.state.tr);
                }
                updateLinkClasses(changedRanges);
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
