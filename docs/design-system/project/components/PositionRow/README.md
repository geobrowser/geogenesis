# PositionRow

The Agree/Disagree pair. Each side is a `rounded-full` pill in `button` type showing a thumb icon, the label and up to two faces of people on that side, then a +N.

**States.** Unpicked: `border-dashed border-grey-03 bg-white`, `hover:border-text`. Picked: `border-transparent bg-divider` with the thumb filled, and the face rings switch to `border-divider`. Pending or disabled: `opacity-60`.

**Layout.** It is a container query, not a viewport query. One column until the row is 272px wide (`claim-pills-wide:grid-cols-2`). With an end slot (comments and share) it becomes three columns from 330px (`claim-row-end-inline`), or from 370px with a third action. The faces hide inside a narrow pill (`@max-[102px]`, `@max-[115px]`, `@max-[128px]`) so the label never truncates to "Dis…".

**Copy.** Always "Agree" and "Disagree" (`CLAIM_RESPONSE_COPY`). The old Verify/Dispute wording is gone.

**Props** — `{ positions; responseKind; viewerPosition: boolean|null; onRespond?; disabled?; pending?; titleFor?; noteFor?; localSide?; endSlot?; endSlotWraps?: 'compact'|'wide'; showParticipants?; analyticsSurface? }`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/matchmaking/matchmaking-claim-card.tsx` (geogenesis master).
