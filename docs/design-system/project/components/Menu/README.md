# Menu

The popover menu shell and its items: `rounded-lg border border-grey-02 bg-white shadow-lg`, at most 360px wide, scrolling at `min(400px,75vh)`, opening 8px from the trigger and flipping to fit.

**MenuItem.** `px-3 py-[10px] text-button text-text`. Hover or active shows a `bg-grey-01` plate inset 4px (`absolute inset-1 rounded`), not a full-bleed fill. An icon and label sit at `gap-2`. Destructive rows (the request overflow menu) use red-01 text.

**Props** — `Menu { trigger; open; onOpenChange; align?; sideOffset? (8); className?; viewportClassName?; asChild?; modal? }`, `MenuItem { active?; href?; onClick?; className?; closeOnSelect?; children }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/menu.tsx` (geogenesis master).
