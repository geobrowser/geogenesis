# Chip

Entity chips: `LinkableChip` (a linked entity name) and `LinkableRelationChip` (a relation value with its relation and space controls).

**Look.** `rounded border border-grey-02 bg-white`. Hover gives `border-text`. Focus gives `border-text bg-ctaTertiary shadow-inner-lg`. `LinkableChip` is `px-1.5 py-1 text-metadataMedium leading-4.5! font-normal!` and clamps to 4 lines from 42 characters. `LinkableRelationChip` is `pl-1.5 py-0.5 text-metadata tabular-nums` (`py-px` when `small`), with a grey-03 relation icon that turns text on hover. In edit mode it adds a space picker and delete (×).

**Props** — `LinkableChip { href; children; disableLink? }`. `LinkableRelationChip { isEditing; currentSpaceId; entityId; spaceId?; relationEntityId?; relationId?; verified?; onDelete?; onDone?; small?; className?; disableLink?; truncateLabel?; children }`. `LinkableMediaChip` (an 80px image/video tile) is not previewed.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/chip.tsx` (geogenesis master).
