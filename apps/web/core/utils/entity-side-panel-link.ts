import type * as React from 'react';

/** The side panel and the popovers, menus and dialogs layered over the page. A press inside one is not a press on the page. */
export const ENTITY_SIDE_PANEL_LAYER_SELECTOR =
  '[data-entity-side-panel], [data-power-tools-entity-panel], [data-radix-popper-content-wrapper], [data-radix-portal], [role="dialog"], [role="menu"], [role="listbox"], .elevated-popover, .side-panel-elevated-popover';

/**
 * Let tracking run after the room's capture handler chooses the destination. A callback that
 * also navigates must honor defaultPrevented. Stop afterward so parent card handlers cannot
 * navigate again. Outside the room, this preserves the link's ordinary click behavior.
 */
export function observePanelNavigation(onClick?: React.MouseEventHandler<HTMLAnchorElement>) {
  return {
    'data-entity-side-panel-navigation': 'observe' as const,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) event.stopPropagation();
    },
  };
}
