# Copilot review follow-up

Reviewed all four inline threads, resolved/outdated-thread metadata, review bodies (including collapsed sections), and issue comments. There were no additional suppressed or previously missed findings in the available review.

| Finding | Decision and scope audit | Regression proof |
| --- | --- | --- |
| Query-only page views | Valid. Key by pathname and normalized search; notify retained surfaces through the existing page tracker. Audited all shared page/display ID consumers. Hash-only changes retain the view. Query text is not emitted. | Removing the query key fails the ID and impression tests. Removing the surface subscription alone fails the retained-card test. |
| Search identity after an await | Valid. Create one operation at attempt start; complete it after either success or failure. Suppress the paired legacy search event after an identity change. Audited canonical operation/recording sites: other writes begin observation before their request; profile staging checks the owner before publication. Deferred sign-in actions intentionally bind the authenticated actor when replayed. | Restoring completion-time creation fails both successful and failed account-switch tests. An unchanged identity still emits one outcome; existing refetch tests pass. |
| Gallery list/position loss | Valid; a one-call-site fix is too narrow. The shared card inherits omitted list/position props and respects explicit overrides. Audited both list providers and all card callers, including data-block/ranking feeds. | Restoring the card defaults fails both profile and other-gallery cases; explicit overrides still pass. |
| Source UUID normalization | Valid. Normalize every origin, playback-debate and debate-target ID before deduplication. Audited the reporting queries; rounds already normalize graph join IDs. Account IDs are not graph UUIDs and are unchanged. | The actual SQL on synthetic ClickHouse CTEs fails with normalization removed, and passes when restored. Mixed case, dashes, multiple sources and internal filtering are covered. |

Each regression failed on the original code, passed with the fix, and failed again when its fix was deliberately removed. All mutations were restored before final checks. No repo-wide test or lint policy was added. The changes affect attribution and reporting, not layout, playback, search results or product actions.

## Separate follow-up

Legacy comment (`commentCreated`/`commentEdited`), review-publish (`publishedEdit`) and copied-debate-link (`debate_share_action`) events still emit after asynchronous work without an identity-revision guard. This behavior is present in master before this PR; the new canonical `action_completed` events are already guarded. Fixing those older reporting paths should be a separate PR: capture the initiating revision, gate legacy completion, and add account-switch tests while preserving deferred sign-in replay. No changes to those legacy paths were made here.

Another focused review is worthwhile for the new retained-view subscription and actor boundaries. Production collector acceptance and warehouse rollout checks remain separate from this code review.
