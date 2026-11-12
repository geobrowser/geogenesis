# AvatarGroup

An overlapping stack of faces (`-space-x-2`). Each face has a 2px ring in the surface colour, read from `--avatar-group-ring` (white by default). A grey-02 `+N` chip ends the stack.

**Sizes.** `AvatarGroup.Item size={12|20}`, and `AvatarGroup.Overflow count size` (12px: 9px text; 20px: 11px text). Set `--avatar-group-ring` to the ground the stack sits on (the summary band sets grey-01).

**Props** — `AvatarGroup { children; variant?: 'overlap'|'spaced' }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/avatar-group.tsx` (geogenesis master).
