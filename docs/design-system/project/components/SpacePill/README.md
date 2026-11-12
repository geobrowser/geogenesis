# SpacePill

The side rail's space pill: a 16px avatar and the name in a `rounded-full border-grey-02` outline, at 16px/18px, with `hover:border-text`.

**When to use.** Join spaces on Explore and Subspaces on a space overview. `SpacePillList` wraps the pills (`flex flex-wrap gap-2`) and folds anything beyond 9 behind "Show more"/"Show less". `SpacePillSectionHeading` is the sticky 19px/23px semibold heading above it.

**The consumer provides** the element (a button for Join, a link for Subspaces) with `SPACE_PILL_CLASS`, plus `SpacePillAvatar` and `SpacePillLabel`, which truncates with `min-w-0`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/space-pill.tsx` (geogenesis master).
