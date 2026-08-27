/**
 * Whether a click asked the browser to do something other than follow the link here and now —
 * cmd/ctrl for a new tab, shift for a new window, alt to download, middle click for a background
 * tab.
 *
 * A handler that navigates on click has to check this. Without it, cmd-clicking an entity opens it
 * in a new tab *and* moves the current one, or the handler swallows the event and the modifier does
 * nothing at all. Fanning research out across tabs is a core way to read a knowledge graph, so this
 * is a question of function rather than polish (GEO-2701).
 *
 * `button === 1` is the middle button, which browsers deliver as `auxclick` rather than `click` —
 * so an `onClick` handler never sees one. It is checked here for handlers wired to `onAuxClick` or
 * to a raw listener, which do. An anchor needs none of this for middle click: nothing runs, nothing
 * prevents the default, and the browser opens its background tab.
 */
export function isModifiedClick(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
}): boolean {
  return Boolean(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1);
}
