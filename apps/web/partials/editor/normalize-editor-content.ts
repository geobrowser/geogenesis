import { JSONContent } from '@tiptap/react';

// Normalizes an editor JSON document for equality comparison against the store.
//
// Two classes of difference must be ignored so the content-sync effect in
// `editor.tsx` doesn't treat them as external changes:
//
//   1. Volatile node attrs (`spaceId`, `relationId`) and null/undefined attrs.
//   2. `web2URL` marks. The web2URL detection plugin adds/removes these marks at
//      render time — including in browse mode — to make external links
//      clickable. They are presentational, not stored content. If the
//      comparison counted them, the sync effect would call setContent() to
//      revert the plugin's mark on every sync tick, and the plugin would
//      re-apply it, making raw links flicker between styled states.
export function normalizeEditorContent(content: JSONContent): JSONContent {
  const normalizedAttrs = content.attrs
    ? Object.fromEntries(
        Object.entries(content.attrs).filter(([key, value]) => {
          if (value === null || value === undefined) return false;
          return key !== 'spaceId' && key !== 'relationId';
        })
      )
    : undefined;

  const filteredMarks = content.marks?.filter(mark => mark.type !== 'web2URL');

  return {
    ...content,
    ...(normalizedAttrs && Object.keys(normalizedAttrs).length > 0 ? { attrs: normalizedAttrs } : {}),
    ...(!normalizedAttrs || Object.keys(normalizedAttrs).length === 0 ? { attrs: undefined } : {}),
    ...(content.marks ? { marks: filteredMarks && filteredMarks.length > 0 ? filteredMarks : undefined } : {}),
    ...(content.content
      ? {
          content: content.content.map(child => normalizeEditorContent(child)),
        }
      : {}),
  };
}
