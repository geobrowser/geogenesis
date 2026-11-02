# Device-vote sides and exits after sign-up (GEO-3243)

## Votes kept on the device

A signed-out visitor's vote (GEO-3214) is recorded as `action_completed` with `action_kind=local_vote`. It now carries the same vote fields as a vote published from an account: `response_action` (agree/disagree for a claim, upvote/downvote otherwise), `vote_direction`, `vote_kind`, `vote_action`, `mutation_kind`, `previous_vote_direction`, `response_kind`, `entity_id`, `space_id` and `object_type`, plus `local_vote_count`. Both are built by `voteOutcomeProperties` in `apps/web/core/responses/entity-response.ts`, so the two compare field for field.

Before this change, device votes carried `vote_direction` but no `response_action`. `local-votes-by-direction.sql` derives the side from `vote_direction` for those, so the whole history splits by side. A removal has no side and is left out.

## Exits after Privy signed someone in

Privy creates the account when the email code is accepted. If the visitor then exits Privy's dialog, `useLogin` never completes, so there is no browser `signed_up`, and Privy signs the account back out. These exits were recorded as `closed`. They now end the attempt with:

- `left_after_sign_up`: the account was created during this attempt. That means its creation time is no earlier than the attempt's start, using the same skew allowance and second-precision rounding as signup visitor attribution (`createdSince` in `apps/web/core/auth/signup-visitor.ts`).
- `left_after_sign_in`: an existing account.

`closed` now means nobody had signed in. `sign-in-outcomes.sql` counts attempts by outcome per day, and the GEO-3071 funnel reports both new outcomes in their own columns. Data before this change still shows these exits as `closed`.

New accounts with no attempt at all usually arrived through a restored session, for example an account created from the email link in another tab. Those already show `session_restored`.

## Onboarding progress

`auth_onboarding_progress` is reported once per step and outcome per attempt. Before this, a step could be reported twice in the same moment: the personal space runner can resolve one creation twice when its effect re-runs.
