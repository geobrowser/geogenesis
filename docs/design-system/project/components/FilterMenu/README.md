# FilterMenu

A faceted filter: a pill trigger showing the current selection, opening a `Menu` of rows with a check or checkbox and an optional count.

**Trigger** (`FILTER_PILL_CLASS`): `rounded-full border border-grey-02 px-[10px] py-[7px] text-[16px] leading-[20px] text-[#2A2B2E] hover:bg-grey-01`, with a small chevron. `trigger="button"` uses `SmallButton` instead. Rows are `rounded px-2 py-2 text-[16px] leading-[20px] hover:bg-grey-01`, disabled at `opacity-40`, with the count right-aligned in 14px grey-04 tabular numerals. Multi-select uses `CheckboxVisual` rows and an optional "All" row above a divider hairline. `#2A2B2E` is a literal in the source, not a token.

**Props** — `{ label; options: {key,label,count?,disabled?}[]; trigger?: 'pill'|'button'; triggerClassName?; contentClassName?; maxHeightClass?; closeOnSelect? }` plus either `{ selectedKey, onSelect }` or `{ multiple: true, selectedKeys, onToggle, allLabel?, onSelectAll?, emptyMeansAll? }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/filter-menu.tsx` (geogenesis master).
