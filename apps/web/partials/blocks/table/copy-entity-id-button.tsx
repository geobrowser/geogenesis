'use client';

import { useEffect, useRef, useState } from 'react';

import { CopySmall } from '~/design-system/icons/copy-small';
import { TickSmall } from '~/design-system/icons/tick-small';

import { rowOpenerClassName } from '~/partials/blocks/table/row-control-styles';

type Props = {
  /** The entity the row stands for — for a collection row, the one its relation points at. */
  entityId: string;
  /**
   * Where it is being drawn. `menu` sits among the 12px glyphs inside the row menu; `row` sits in
   * the row itself, where it has to match the side-panel button it stands next to rather than
   * merely sit near it.
   */
  variant?: 'menu' | 'row';
};

/**
 * Copies a row's entity id: the thing you paste into a query or quote in a ticket (GEO-2679).
 *
 * Collection rows reach it through the "..." menu, which they already have. Query rows have no menu
 * to open, so they render this directly beside the side-panel button — same control, one fewer
 * click, and nothing worth adding a menu for.
 */
export function CopyEntityIdButton({ entityId, variant = 'menu' }: Props) {
  const isRowControl = variant === 'row';
  const className = isRowControl ? rowOpenerClassName : 'inline-flex items-center p-1';
  // `SidePanel` is drawn at 19; the menu glyphs at 12.
  const iconSize = isRowControl ? 19 : 12;
  const [hasCopiedId, setHasCopiedId] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      if (announceTimeoutRef.current) {
        clearTimeout(announceTimeoutRef.current);
      }
    };
  }, []);

  const onCopyEntityId = async () => {
    // Clipboard writes reject on insecure origins, on denied permissions, and when the document
    // isn't focused. None of that is worth breaking a row over, and leaving the icon alone is the
    // honest response — a tick would claim a copy that never happened.
    try {
      await navigator.clipboard.writeText(entityId);
    } catch (error) {
      console.error('Failed to copy entity ID', entityId, error);
      return;
    }

    // Empty the region, then fill it on the next commit. A live region announces when its text
    // changes, and for a second copy inside the confirmation window the text is identical — so
    // without an empty render in between, the words are already there and nothing is announced.
    // The copy happened; the confirmation is what goes missing.
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    if (announceTimeoutRef.current) {
      clearTimeout(announceTimeoutRef.current);
    }

    setHasCopiedId(false);
    announceTimeoutRef.current = setTimeout(() => {
      setHasCopiedId(true);
      copiedTimeoutRef.current = setTimeout(() => setHasCopiedId(false), 1500);
    }, 0);
  };

  return (
    <>
      <button
        type="button"
        // Stable, tick or no tick. Renaming a focused control mid-interaction is announced
        // inconsistently, and while it is renamed the button claims to be a thing that happened
        // rather than the thing it does. The region below says what happened.
        aria-label="Copy entity ID"
        title="Copy entity ID"
        onClick={onCopyEntityId}
        onMouseDown={e => e.preventDefault()}
        className={className}
      >
        {hasCopiedId ? <TickSmall size={iconSize} /> : <CopySmall size={iconSize} />}
      </button>
      {/* A clipboard write leaves nothing behind to look at, so the tick is the whole confirmation
          — and a tick is nothing at all if you are not looking. Mounted empty so the region is
          already there when the text arrives, which is what makes it announce. */}
      <span role="status" aria-live="polite" className="sr-only">
        {hasCopiedId ? 'Entity ID copied' : ''}
      </span>
    </>
  );
}
