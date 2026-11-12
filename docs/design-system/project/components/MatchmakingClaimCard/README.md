# MatchmakingClaimCard

The hub's claim card: a space eyebrow, the claim, the Agree/Disagree row and the summary band. It is the most-used debates surface.

**Anatomy** (shared utilities in `styles.css` keep the feed and the hub in step):
- `claim-card-panel-surface` = `rounded-lg border border-grey-02 bg-white p-3`.
- `claim-card-panel-header` = `mb-2 flex flex-nowrap items-start justify-between gap-3` (here also `items-baseline`). It holds `SpaceChip` (optional 16px `rounded-sm` thumbnail plus the space name in `footnoteMedium` grey-04), an optional `ControversialTag` (fire icon plus "Controversial" in red-01 at 14px), optional `· meta`, and the end slot on the right. The end slot is the small black "Debate now" pill: `h-5 px-2.5 text-[14px] rounded-full bg-text text-white`, sized against "Requesting…" so it never jumps.
- `claim-card-panel-title` = `mb-3 line-clamp-3 block text-metadataMedium leading-snug text-pretty`, linking to the claim and underlined on hover.
- `PositionRow`: the Agree/Disagree pills (see its card).
- `ClaimSummary` inline in `claim-card-summary-band` = `border-t border-divider bg-grey-01 px-3 py-2`, bled to the card edge (`-mx-3 mt-3 -mb-3 rounded-b-[inherit]`). It shows the agree share ("62%" in metadataMedium, "agree" in metadata grey-04), a 2px split bar (green and red-01), and the responders' avatar stack.

**Narrow.** Below 520px of card width (`claim-card-narrow:`) the feed card drops its side-by-side layout. Below 272px (`claim-pills-wide`) the pills stack.

**The consumer provides** `claim` (`DebateClaimSummary`), `positions`, `readiness`, `analyticsSurface`, and optionally `endSlot`, `footer`, `headerMeta`, `hideSummary`, `onOpenClaim`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/matchmaking/matchmaking-claim-card.tsx` (geogenesis master).
