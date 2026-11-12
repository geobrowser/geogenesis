# Avatar

A person's or space's picture. When there is no image, it is a generated boring-avatars "beam" face in the app palette (ctaPrimary, purple, pink, orange, green), seeded by `value`.

**Use.** Always clip it in a `rounded-full` box of the same size (32px in PersonRow, 20px in request parties, 16px in claim pills, 12px in responder stacks). Pass `square` for spaces.

**Props** — `{ avatarUrl?; value?; alt?; size? (12); priority?; square? }`. The preview shows the generated fallback, rendered by the real component.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/avatar.tsx` (geogenesis master).
