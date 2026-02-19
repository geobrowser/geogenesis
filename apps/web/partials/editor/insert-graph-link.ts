import { ChainedCommands, Editor } from '@tiptap/core';

interface InsertGraphLinkOptions {
  /** The TipTap editor instance (for @mention use case) */
  editor?: Editor;
  /** Chain function from handler (for input/paste rule use case) */
  chain?: () => ChainedCommands;
  /** The entity ID to link to */
  entityId?: string;
  /** The full graph URL (e.g., graph://entityId) */
  url?: string;
  /** link text to display */
  linkText?: string;
  /** The entity name */
  entityName?: string;
  /** The space ID where the entity belongs (stored as data attribute) */
  spaceId?: string;
  /** The start position of the selection/range */
  from?: number;
  /** The end position of the selection/range */
  to?: number;
}

/**
 * Inserts a graph link into the editor at the specified position.
 * This function handles multiple use cases:
 * - @mention replacement (with editor instance)
 * - Markdown link input/paste rules (with chain function)
 * - New link insertion at cursor
 *
 * @param options - Configuration options for link insertion
 */
export const insertGraphLink = (options: InsertGraphLinkOptions): void => {
  const { editor, chain, entityId, url, linkText, entityName, spaceId, from, to } = options;

  // Determine the URL and link text
  const linkUrl = url || (entityId ? `graph://${entityId}` : '');
  const text = linkText || entityId || '';

  // Build link attributes including data attributes for entity name and space ID
  const linkAttrs: Record<string, string> = {
    href: linkUrl,
    type:'this is changes'
  };

  // Add data attributes for hover tooltip (entity name and space ID)
  // Note: entityName is passed directly, or via linkText (as in entity-mention-extension)
  const effectiveEntityName = entityName || linkText;
  if (effectiveEntityName) {
    linkAttrs['data-entity-name'] = effectiveEntityName;
  }
  if (spaceId) {
    linkAttrs['data-space-id'] = spaceId;
  }

  if (!linkUrl) {
    console.warn('insertGraphLink: No URL or entityId provided');
    return;
  }

  // If we have a range to delete (from/to) and a chain function (handler use case)
  if (chain && from !== undefined && to !== undefined) {
    // First delete the range, then insert content at the current selection
    // After deleteRange, the cursor will be at the 'from' position, so insertContent will insert there
    chain()
      .deleteRange({ from, to })
      .insertContent({
        type: 'text',
        text: text,
        marks: [
          {
            type: 'link',
            attrs: linkAttrs,
          },
        ],
      })
      .run();
    return;
  }

  // If we have an editor instance (@mention use case)
  if (editor) {
    // If we have a selection range, delete it first (e.g., for @mention replacement)
    if (from !== undefined && to !== undefined) {
      // Use a single chain to ensure atomic operation
      // After deleteRange, insertContent will insert at the current cursor position
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({
          type: 'text',
          text: text,
          marks: [
            {
              type: 'link',
              attrs: linkAttrs,
            },
          ],
        })
        .run();
    } else {
      // Insert new link at cursor position
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: text,
          marks: [
            {
              type: 'link',
              attrs: linkAttrs,
            },
          ],
        })
        .run();
    }
  }
};

/**
 * Legacy overload for backward compatibility.
 * Inserts a graph link using an editor instance.
 */
export function insertGraphLinkLegacy(
  editor: Editor,
  entityId: string,
  entityName?: string,
  from?: number,
  to?: number
): void {
  insertGraphLink({
    editor,
    entityId,
    linkText: entityName,
    from,
    to,
  });
}
