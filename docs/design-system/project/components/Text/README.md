# Text

Typography as a component: `<Text variant color as>` maps to the `text-<variant>` and `text-<color>` utilities. Sizes come from `styles.css`, not from `typography.ts`.

**Props** — `{ children; variant?: TypographyName; color?: ColorName; as?: 'h1'|'h2'|'h3'|'p'|'span'|'div'|'a'|'li'; ellipsize?; className? }`. Newer debates code writes the utilities directly (`text-metadata text-grey-04`). Both are fine.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/text.tsx` (geogenesis master).
