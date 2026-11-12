# Divider

A rule: `solid` is a 0.5px divider border, and `dashed` is a top `border-dashed border-grey-02`. Set `type` to `'horizontal'` or `'vertical'`.

**Props** — `{ type: 'horizontal'|'vertical'; style?: 'solid'|'dashed'; className? }`. Most dividers in the app are plain `border-b border-grey-02` on list rows (PersonRow) or `border-divider` hairlines.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/divider.tsx` (geogenesis master).
