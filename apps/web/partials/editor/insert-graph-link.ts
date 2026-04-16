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

  const linkAttrs: Record<string, string> = {
    href: linkUrl,
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

  const linkContent = {
    type: 'text',
    text: text,
    marks: [
      {
        type: 'link',
        attrs: linkAttrs,
      },
    ],
  };


  // If we have a range to delete (from/to) and a chain function (handler use case)
  if (chain && from !== undefined && to !== undefined) {
    // Delete the range, then insert content at the explicit 'from' position.
    // Using insertContentAt with the explicit position avoids TipTap v3's
    // position adjustment logic in insertContent that can shift the cursor.
    chain().deleteRange({ from, to }).insertContentAt(from, linkContent).run();
    return;
  }

  // If we have an editor instance (@mention use case)
  if (editor) {
    const chain = editor.chain().focus();
    if (from !== undefined && to !== undefined) {
      chain.setTextSelection({ from, to });
    }
    chain.insertContent(linkContent).run();
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
