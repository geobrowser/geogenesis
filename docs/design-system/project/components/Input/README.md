# Input

The text field. It draws its border with an inset shadow: 1px grey-02 at rest, text on hover, and 2px text on focus. It is `rounded`, `px-[10px] py-[9px]` and set in `input` type, with grey-03 placeholders. Disabled gives a divider fill and grey-03 text.

**Props** — native input props plus `withSearchIcon?` (a search glyph at left 12px, `pl-9`), `withExternalSearchIcon?`, `withFilterIcon?` (`rounded-r-none`), and `inputRef?`. `inputStyles` is exported for other fields.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/input.tsx` (geogenesis master).
