# ClaimSummary

How a claim's responses split: the agree percentage, a green/red-01 split bar and the responder avatars.

**Layouts.** `inline` is a 2px bar between the reading and the avatars, used inside `claim-card-summary-band` and setting `--avatar-group-ring` to grey-01. `stacked` is a 6px bar with the reading and the avatars beneath it. Nothing renders until there are counts (the "invite" tier renders nothing).

**Props** — `{ entityId; spaceId; responseKind; summary: ClaimResponseSummary; className?; layout?: 'stacked'|'inline' }`. Also exported: `ClaimSplitBar({ percent, className })`, `ControversialTag`, `ClaimSides`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/claims/browse/claim-summary.tsx` (geogenesis master).
