# Sign-in attribution (GEO-3071)

A sign-in attempt snapshots the shared GEO-3073 action description at the initiating control. `auth_attempt_id` joins its opening, terminal outcome, account, onboarding and deferred action. `component` describes the surface; `auth_control` distinguishes buttons within it (including agree/disagree); `auth_trigger` distinguishes controls, deep links, invite links and redirects. Unattributed completions explicitly use `unknown`, including an attempt ID, without inventing an opening impression.

## Events and storage

- `auth_attempt_started`: a control or headless flow starts an attempt.
- `auth_prompt_viewed`: Privy reports its modal open, or the headless email verification step opens. Once per attempt; duration begins here when available.
- `auth_attempt_completed`: `signed_up`, `signed_in`, `closed`, or `superseded`, with `auth_duration_ms` and `prompt_seen`.
- Existing `signed_up` / `signed_in`: the complete starting description, stable `operation_id`, and attempt ID. Session restores remain separate. The existing runtime owns persistent lifecycle deduplication and delivery; the deterministic signup operation ID permits downstream deduplication across sessions.
- `auth_identity_linked`: account ID plus the initiating anonymous/session IDs, with the same attempt ID. Join to the opening event by attempt ID if the analytics runtime was not ready at the press. No additional email or identity payload is collected.
- `auth_onboarding_progress`: viewed step, explicit dismissal, optimistic form completion, and background personal-space success/failure. Form completion is not registration success.
- `auth_action_completed`: outcome of a linked action, or cancellation of a queued action when sign-in is closed/superseded. The canonical `action_completed` also carries the attempt ID.

Storage contains only the allowlisted attribution, IDs and timestamps, never email codes, credentials or user-entered text. An attempt lasts at most 24 hours. This tab's in-memory pointer wins, with its session-storage pointer used after reload; an OAuth completion in a new tab can recover a single active attempt from shared origin storage. Several active attempts are ambiguous and produce `unknown`. Tabs starting independent attempts do not overwrite each other. Blocked storage falls back to memory. This supports the same browser/origin on mobile, not cross-device identity recovery.

Explicit dismissal is observable. Closing a tab, killing a browser or leaving during OAuth is not an auth dismissal: an opening without a terminal event is **unresolved**, and reports may classify it as abandoned after 24 hours. It does not have an invented duration. Delivery cannot be guaranteed after a browser is killed, analytics is blocked, or consent is withheld.

## Entry-point coverage

| Entry | Component / control | Continuation |
| --- | --- | --- |
| Navbar | `navbar` / `sign_in` | No gated action |
| Explore claim cards | `explore_feed_card` / `agree` or `disagree` | Another press required, as before |
| Claim page/gallery/matchmaking claim | inherited surface or `claim_position_control` / `agree` or `disagree` | Another press required |
| Video ticker and end card | `debate_claim_ticker` / `debate_end_card`, agree/disagree separately | Another press required |
| Entity vote buttons | inherited surface or `entity_vote_buttons` / response kind + direction | Existing queued vote retains attempt ID |
| Winner vote | inherited surface or `winner_vote_button` / `pick_winner` | Existing queued vote retains attempt ID |
| Ranking | `ranking_composer` / `add_ranking` | Composer resumes |
| Comment / reply | `comment_composer` / `comment` | Composer resumes |
| Join space | `join_space_button` / `join_space` | Existing deferred membership retains attempt ID |
| Debate people/claims hub | `debate_matchmaking` / browse, see-times, start-debate | Another press required |
| Availability invite | `invite_link` / `book_debate` | Availability resumes |
| Bounty cards/detail | `bounty_interest` / `express_interest` | Another press required |
| Explore email capture | `explore_email_capture` / `create_account` | Headless verification; modal fallback is a new attempt |
| Sign-in/debate links | `sign_in_deep_link`, `invite_link`, or `debate_matchmaking` | Explicit deep-link or invite trigger |
| Unexpected modal/redirect | `unknown` / `unknown`, trigger `redirect` | No fabricated control |

The snapshot retains page vs target, claim source IDs, overlay, feed position, video presentation/playback and variant from the shared context. Video stage is the component; round and speaker still require GEO-3073's graph/timeline enrichment.

Queued actions are linked explicitly through their captured context. Comment/ranking continuations use the first matching resumed action on the same target, labelled `auth_continuation=resume`; they are not claims that publishing happened automatically. `repeat` controls intentionally do not attribute a later click as replay. Reporting retains the distinction and does not treat absent replay as a failed transaction. Failure reasons on canonical actions remain allowlisted. Dismissing onboarding emits a separate record; a later resume can still succeed.

## Marketing handoff

The separate marketing project should generate a random handoff UUID at CTA click, record it with its own page/CTA event and navigate to:

```
/explore?modal=signin&via=marketing&marketing_page=home&marketing_cta=hero_signup&marketing_handoff_id=<uuid>
```

These three values are stable identifiers matching `[a-zA-Z0-9_-]{1,80}`. Do not send full URLs, CTA text, account IDs, email addresses or tokens. The app snapshots them before sign-in and copies them to completion. The handoff ID is the cross-project join key; existing anonymous analytics IDs may additionally join the visit. The marketing producer is not present in this repository and must be implemented there. Old `via=marketing` links continue to work but cannot identify a page/CTA they did not send.

## Review and rollout

The bundled registry, content hash, SRI and manifest include the six new events. Runtime tests execute that exact JS bundle and inspect serialized collector fields. Regression tests cover abandonment, immutable context, blocked storage, TTL, ambiguous tabs, duplicate completions and session restores. Existing signup email handling is unchanged. Auth lifecycle records now carry the same team/test/automation classification as actions; reports also exclude warehouse account labels.

The SQL files provide production-schema reports. They are review artifacts, not evidence that the collector has received production rows. Before accepting the production criteria:

1. Update the external collector registry to match these contracts and verify all fields arrive.
2. Implement the marketing CTA producer above in its separate project.
3. Run email-code, OAuth, new-tab and mobile signups/logins from each entry above. Inspect page, target, sources, overlay, position, playback, control and outcome. Verify signup once, no login on reload, and anonymous history joins. Label test account IDs for exclusion.
4. Schedule reconciliation against the authoritative Privy account export. Browser-only delivery/deduplication cannot guarantee every Privy account has exactly one warehouse row. Compare daily distinct accounts, raw duplicates and attribution coverage, and require >=98% known after rollout. Backfill/server reconciliation is a collector/warehouse concern.
5. Schedule the reports and unresolved-attempt classification. Complete GEO-3073's round/speaker enrichment.

Do not mark GEO-3071 Done until the user confirms merging the draft PR. Keep these rollout dependencies visible after merge.
