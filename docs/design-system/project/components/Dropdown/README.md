# Dropdown

A select-style dropdown. The trigger is a white `rounded` button with an inset grey-02 outline (`shadow-inner-grey-02`, text on hover, 2px text on focus) and a ctaPrimary chevron. The list is 273px wide with grey-02 rules between rows.

**Rows** are `min-h-10 px-3 py-2 text-button text-grey-04`, turning `bg-bg` and text on hover. A disabled row shows its `sublabel` on the right in `smallButton` grey-04.

**Props** — `{ trigger; align?; scrollableList?; options: { label; sublabel?; value; disabled; onClick }[] }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/dropdown.tsx` (geogenesis master).
