'use client';

import * as React from 'react';

/** Where typing goes: a key pressed here is the field's, never the editor's. */
const TEXT_FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
/** Inputs that take no text: a checkbox's `value` is "on", which is not text typed into it. */
const NO_TEXT_INPUT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
/** Controls with their own keys: an edge handle's arrows, a menu's Space and Esc. */
const OWN_KEYS = '[role="slider"], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="listbox"]';

export type EditorKeyIntent = 'space' | 'escape' | null;

/**
 * What a key press asks of the editor (GEO-3773), or `null` when it is someone else's.
 *
 * - Anything a control already handled (`defaultPrevented`: a Radix menu or popover closing on Esc)
 *   is left alone, so one press never closes two levels.
 * - Only presses on the page itself (focus on `body`) or inside the editor count.
 * - Space plays or stops the reel, also after a click left focus on a card or a button, but never
 *   while typing, on an edge handle (`role="slider"`), or in a menu.
 * - Esc closes an open popover even from a field; otherwise it leaves a text field that has text in
 *   it (and an edge handle) alone, then closes the side panel, then deselects.
 */
export function editorKeyIntent(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'defaultPrevented' | 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>,
  root: Element | null,
  popoverOpen: boolean
): EditorKeyIntent {
  if (event.defaultPrevented || root === null) return null;
  const target = event.target instanceof Element ? event.target : null;
  const onPage = target === null || target === document.body || target === document.documentElement;
  if (!onPage && !root.contains(target)) return null;

  if (event.key === 'Escape') {
    if (popoverOpen) return 'escape';
    if (target?.closest(OWN_KEYS)) return null;
    const field = target?.closest(TEXT_FIELD);
    if (field && fieldHasText(field)) return null;
    return 'escape';
  }
  if (event.key === ' ' || event.code === 'Space') {
    if (event.metaKey || event.ctrlKey || event.altKey) return null;
    if (target?.closest(TEXT_FIELD) || target?.closest(OWN_KEYS)) return null;
    if (target instanceof HTMLElement && target.isContentEditable) return null;
    return 'space';
  }
  return null;
}

function fieldHasText(field: Element) {
  if (field instanceof HTMLInputElement) return !NO_TEXT_INPUT.has(field.type) && field.value !== '';
  if (field instanceof HTMLTextAreaElement) return field.value !== '';
  if (field instanceof HTMLSelectElement) return true;
  return (field.textContent ?? '') !== '';
}

/**
 * The editor's keys, listened for on `document` so a press with focus on the page counts as much
 * as one inside the editor. `onEscape` says whether it closed something: only then is the press
 * taken (`preventDefault`). Without `onSpace` Space is left to the browser.
 */
export function useEditorKeyboard(
  root: React.RefObject<HTMLElement | null>,
  handlers: { popoverOpen: boolean; onEscape: () => boolean; onSpace?: () => void }
) {
  const latest = React.useRef(handlers);
  latest.current = handlers;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { popoverOpen, onEscape, onSpace } = latest.current;
      const intent = editorKeyIntent(event, root.current, popoverOpen);
      if (intent === 'escape') {
        if (onEscape()) event.preventDefault();
      } else if (intent === 'space' && onSpace) {
        event.preventDefault();
        onSpace();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [root]);
}
