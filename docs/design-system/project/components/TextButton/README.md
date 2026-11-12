# TextButton

A bare text action in `smallButton` type: grey-04 that turns text on hover, or ctaPrimary that turns ctaHover on hover.

**When to use.** Secondary inline actions such as Clear or Done in a popover. The quiet underlined "Back to times" style beside a stack of pills is `HubQuietButton` (in `hub-pill-button.tsx`), shown last in the preview.

**Props** — `ComponentPropsWithoutRef<'button'> & { color?: 'grey-04' | 'ctaPrimary' }`; `disabled` gives `cursor-not-allowed text-grey-04`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/text-button.tsx` (geogenesis master).
