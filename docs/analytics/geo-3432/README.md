# Scheduled debate outcomes (GEO-3432)

How often a scheduled debate is held, how late each side arrives, and who repeatedly doesn't show
up. It is the baseline for the GEO-3426 no-show fixes.

The measurement lives outside this repo:

- **geo-chat** records each step of a scheduled debate as it happens (migration 0112,
  `scheduled_debate_events`). Its hourly `geo-chat-lobby-export` job sends the steps to the
  warehouse.
- **geobrowser/analytics** holds the warehouse tables and outcome views (migration 113) and the
  reports: `docs/analytics/scheduled-debates.md`, `scheduled-debate-outcomes.sql` (by week) and
  `scheduled-debate-debaters.sql` (by person). Team and test accounts are excluded there.

## What Genesis sends

`debate_availability_viewed` carries `request_id` when the week was opened to move an existing
debate. So does `debate_availability_link_opened` for an email's link, because it fires even when
the week never loads (signed out, an error). That covers a scheduling email's "Choose different time", Reschedule on an accepted debate
in the Requests tab, and "Choose different time" on an invite there. The weekly report joins it to
geo-chat's record and counts reschedules that were started and then abandoned: no move or
cancellation of that debate within 30 minutes.

It is `null` on every other week view. A link's id is already checked by
`rescheduleRequestIdFromTarget` before it reaches the week. The property is optional, so the
analytics registry needs no change.
