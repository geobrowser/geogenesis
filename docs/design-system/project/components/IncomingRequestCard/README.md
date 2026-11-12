# IncomingRequestCard

A debate request someone sent you, in the Requests tab: space, countdown, claim, both sides, and Dismiss/Accept.

**Anatomy.** `flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3`.
- Top row: `SpaceChip`, then the countdown in `footnote` text with the time icon ("Expires in 4m", "Expires in 38s", "Expired").
- The claim in `metadataMedium`.
- `RequestParties`: a `rounded-lg bg-grey-01` strip. "You" sits on the left and the requester on the right, each with a 20px face, the name in `footnote`, and their side in a `rounded-full bg-grey-02 px-1.5 py-0.5` chip. A 24px "VS" disc on a grey-02 hairline divides them, and the overflow "…" menu sits at the end.
- When the requester is busy: a grey-04 footnote ("Dev Raman is in a debate. You can accept once they’re free."), and Accept reads "Pending" and is disabled.
- `grid grid-cols-2 gap-2`: secondary "Dismiss" and primary "Accept" (`HubPillButton`).

**Overflow menu** (`request-overflow-menu.tsx`): "I don't want to debate this claim", and "Block <name>" in red-01.

**Props** — `{ request: DebateRequest; ref? }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/matchmaking/incoming-request-card.tsx` (geogenesis master).
