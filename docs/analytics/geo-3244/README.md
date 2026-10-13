# GEO-3244: debate requests, end to end

Readout for debate requests: where they were sent from, how, and whether they turned into a debate.

## What the web app records

Every debate request's `action_completed` (`action_kind = start_debate`) now carries:

| Property | Values |
|---|---|
| `request_surface` | `explore_card`, `claim_page`, `claim_side_panel`, `hub_panel`, `hub_fullscreen`, `calendar`, `profile`, `lobby`, `rematch_page`, `availability_link` |
| `request_path` | `first_available` (claim request), `specific_person` (challenge), `scheduled`, `rematch` |
| `origin_surface` | where the flow began, when that was somewhere else (a calendar opened from a claim) |
| `opportunity_id` | the claim page's Request debate button that the flow began from |
| `request_id` | the request, challenge, rematch request or scheduled request it created, without dashes |

An accept (`join_debate`) records `debate_id` (claim requests and rematches) and `rematch_session_id` (rematches and challenges).

A refusal from geo-chat, such as `recipient_away` or `intent_missing`, is recorded as `outcome = failed`, with geo-chat's code as its `failure_code`. Before this change it read as `unknown`.

The claim page's Request debate button sends `action_opportunity` when it shows, with `eligibility_reason` set to `live` (filled) or `scheduled` (outlined). A send from it, or from the calendar it opens, sends `action_attempted` with the same `opportunity_id`. The collector accepts `start_debate` there only after geobrowser/analytics#107 is rolled out.

`debate_scheduled_request_sent` also carries `request_surface`, `origin_surface` and `opportunity_id`.

## Files

- `funnel.sql`: for each surface and path, the steps opportunities, attempts, sent, accepted and held, plus the median time from sent to accepted.
- `held.sql`: accepted claim requests and rematches, matched to the published-debate snapshot.

## Caveats

- "Held" means published. It joins the accept's `debate_id` to `analytics.debate_timing_debates`. A debate that was held but never published does not count. Challenges and scheduled debates count only up to "accepted": their accept does not name a debate. An exact "held" count is GEO-3259.
- The new properties start at launch. Older rows have none of them, so compare older periods by `component` and `page_type` instead.
- Leave out 9 Aug to 8 Sep 2026. Interaction events were not recorded in that window.
