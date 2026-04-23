/** Roughly 4.5 default-sized rows, capped by viewport height. */
export const DROPDOWN_LIST_MAX_HEIGHT_REM = 11.25;
export const DROPDOWN_LIST_VIEWPORT_MAX_HEIGHT_RATIO = 0.65;
export const DROPDOWN_LIST_MAX_HEIGHT_CLASS = 'max-h-[min(11.25rem,65vh)]';

/**
 * Standard scrollable list region for menus, selects, and Radix dropdown content.
 * Roughly 4.5 default-sized rows, capped by viewport height.
 * (Keep class names literal so Tailwind can scan this module.)
 */
export const DROPDOWN_LIST_SCROLL_CLASSES =
  'max-h-[min(11.25rem,65vh)] overflow-y-auto overflow-x-hidden overscroll-contain';

/** Scrollable list body under a fixed header inside a `flex flex-col max-h-*` container. */
export const DROPDOWN_LIST_BODY_SCROLL_CLASSES = 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain';

/** Pair with `DROPDOWN_LIST_SCROLL_CLASSES` on `SelectPrimitive.Viewport` for scrollbar styling in `styles.css`. */
export const GEO_SELECT_VIEWPORT_CLASS = 'geo-select-viewport';
