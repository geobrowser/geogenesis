# TabGroup

The page tab row for entities and spaces. Tabs are `quoteMedium` labels 24px apart (`gap-6`): grey-04 when inactive, text when active, with a 1px text underline that moves under the active tab on a full-width grey-02 rule. A disabled tab is `opacity-25`.

**Extras.** A `Badge` count (`rounded bg-black px-1.25 py-0.5 text-xs text-white`), a `TabGroupDivider` (`h-4 w-px bg-grey-02`), and white edge fades with drag-to-scroll when the row overflows. `onlyWhenNarrow` tabs appear only at the `lg:` width.

**Props** — `{ tabs: { href; label; badge?; disabled?; hidden?; dividerBefore?; onlyWhenNarrow?; sidePanelKey? }[]; className? }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/tab-group.tsx` (geogenesis master).
