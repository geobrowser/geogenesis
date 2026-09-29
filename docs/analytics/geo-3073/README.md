# Action attribution (GEO-3073)

The browser emits one `action_completed` record for each observed operation. Count this event, deduplicated by `operation_id`; do not add the legacy `vote_cast` submitted/indexed records to it. Those remain available for reconciliation and existing dashboards. `outcome` is `succeeded`, `failed`, or `unknown`. Receipt/network ambiguity remains unknown, and errors use allowlisted categories rather than provider messages. An account change suppresses the previous account's asynchronous completion.

## Shared description

`core/action-context.ts` defines the component vocabulary and a runtime field allowlist. The description contains the starting `page_path`, `page_type`, `page_view_id`, page entity, target entity/type (and graph type IDs when available), every known source entity ID, overlay entity, list and one-based position, presentation ID, playback ID/position, and rendered variant. It contains no labels, comment text, search text, email addresses or tokens. Existing search redaction is unchanged.

A claim's `Sources` relations supply `origin_entity_ids`. A reused claim can have several sources; none is arbitrarily designated its only source. Sources are not necessarily debates. Filter or enrich by graph entity type before labelling the origin report “debates.” IDs retain their source representation; graph joins should normalize UUID punctuation and case.

The entity route layout supplies the page's actual entity and its claim/topic/person/debate classification. A side panel retains the opening feed's context and adds its own entity. A React context follows portals; an event-scoped context also handles callbacks constructed above a video surface. Both clear independently of a queued action's saved snapshot. Snapshot at initiation, before awaiting or handing an action to onboarding. `useEnqueuePendingAction` and deferred joins retain the starting description across navigation and replay.

`action_session_id` and `action_anonymous_id` retain the initiating session/visitor when the runtime is available. The runtime supplies the completion's account, session and visitor as usual. It owns identity binding; the client description does not invent an account or copy credentials. No client can guarantee delivery after a tab is killed or consent is withheld.

## Instrumented entry points

| Action | Entry point / outcome boundary |
| --- | --- |
| Up/down, agree/disagree, verify/dispute, remove/switch | `useEntityResponse`; receipt-backed submission. `response_action`, `response_kind`, `vote_action` distinguish semantics. |
| Debate winner, including switching | `useDebateVotes`; successful publish. |
| Ranking | `useRankingSubmissions`; submitted result, with the existing opportunity ID. |
| Comment / edit comment | `usePublishComment`; published result. Queued publishing retains the initiating operation. |
| Publish | Review Changes and profile Save; confirmed callback. Review batches also include their selected entity IDs. |
| Local editor and data-block edits | The existing editor-change boundary; `edit_scope=local_draft` separates these from publishing. |
| Share | Debate and ranking shares, availability links, and graph/block-link copies. Clipboard success is observable; an external social handoff is unknown. |
| Join space | `useRequestToBeMember`; explicit membership request, including deferred joins. Automatic membership side effects are not separate user actions. |
| Bounty interest | `useInterestedInBounty`; publish callback. |
| Start/join debate | Claim requests, accepting requests, profile challenges, accepting challenges, and rematch requests. These describe request/challenge acceptance, not successful camera admission. |
| Search | `useSearch`; completion or failed result, once per user query. Cache refetches are excluded. |
| Search result | Global search dialog and inline entity picker; mouse/keyboard selection, including choosing a result's space. |
| Assistant message / option | Chat widget dispatch; distinguishes typed messages and option choices without copying their text into the description. |
| Create space | `useDeploySpace`; new space ID on success, unknown on ambiguous transport failure. |

## Visibility

Only Explore-style cards, the debate player, ticker claims, end card, and claims panel emit `component_impression`. At least 50% of the measured element must intersect the viewport and the document must be visible. A display is keyed by page view, component, target, list and position; rerenders and remounts reuse its ID and do not add another impression. Returning to a page creates a new view. The feed's original article roots and existing refs are preserved so measurement does not change card layout or `:last-child` styling.

`presentation_instance_id` links actions to their displayed component. The playback instance is separate and uses the existing playback measurement's ID; `playback_position_ms` is on the debate timeline. Ticker and end-card actions have distinct component names. Rounds and speakers are deliberately absent from action records: derive them from published claim timing and debate turns, or from the action's playback position for non-claim actions.

The existing `debate_exposed` event retains its previous 60%-for-one-second rule. Do not combine it with the new 50% component impression denominator.

## Traffic filters

All captured events carry `is_automated` (WebDriver or a headless user agent), `is_test`, and `is_internal`. Preview/development hosts and explicit test builds are internal. `NEXT_PUBLIC_ANALYTICS_TEAM_ACCOUNT_IDS` optionally accepts comma-separated Privy account IDs for client classification. The reporting queries also exclude active `privy_account_labels` by account ID, using the existing warehouse labels without emails. Browser automation that deliberately hides its automation signals is not reliably detectable by client code; warehouse fleet classification remains relevant.

## Runtime and validation

The content-hashed vendor bundle registers both new events and their `growth-v2` contracts. `action_context_version=v1` versions the description independently. `scripts/analytics/extend-action-registry.py` reapplies the reviewed registry extension to an upstream bundle and updates its filename, SRI and manifest. The manifest preserves upstream source provenance and explicitly identifies the local patch; it does not claim this is an upstream release.

`action-runtime.test.ts` executes the actual shipped JavaScript, checks validation for every component, and inspects the serialized collector payload and identity fields. Source contract tests reject operation call sites missing an attribution argument. Context and component types catch invalid names; runtime allowlisting drops unexpected description fields. Tests cover replay after navigation, page/target separation, nested event contexts, immutable origins, background/off-screen suppression, remount deduplication, and one canonical outcome across submitted/indexed callbacks.

On 2026-09-28, `actions.sql`, `completeness.sql` and `origins.sql` executed against the production schema and returned no new-format rows, as expected before deployment. This verifies query compatibility, not production ingestion. Automatic approval review rejected execution of `displays.sql` because it could return organizational analytics data; it has not been run against production.

## Remaining acceptance work

This draft does **not** assert that all ticket acceptance criteria are complete:

- The collector/warehouse registry lives outside this repository. Its owners must accept the two new contracts alongside the browser update. Confirm real production rows and every field after deployment; a passing bundle test is not proof of collector acceptance.
- Install the daily `completeness.sql` check in the warehouse's scheduler and alert above 1%. There is no scheduler or warehouse migration project in this repository. Check legacy-to-canonical operation coverage too; completeness among emitted records alone cannot detect entirely missing actions.
- Round/speaker reporting still needs a warehouse enrichment of published claim timing and debate turns. No such tables were present in the inspected analytics schema. `rounds.sql` supplies the join and an explicit two-table input contract; the client supplies claim/source/debate/playback keys. The query cannot run against production until those enrichment tables (or equivalent HTTP external tables) are provided.
- Perform the signed-in staging hand check on a known claim and through Explore's side panel. Confirm account, page, overlay, component, target, sources, position, outcome and display joins, then repeat deferred voting and ranking through onboarding.
- Deliberate exclusions: copying raw IDs or diagnostic reports is not sharing an entity; automatic membership joins are side effects of the recorded vote/ranking; transport reconnections are not new debate joins. Intermediate property-cell changes are represented by their eventual Review Changes publish, while document-editor local changes are separately labelled `local_draft`. This avoids counting internal store synchronization as user edits.
- Main entity feeds, person record feeds, topic coverage, space claims, profile galleries, ranking/data-block Explore views, and debate claim lists pass positions. Paginated lists currently use the displayed page's one-based position. Arbitrary future experiments must pass their variant; current card and video variants are included.

Keep GEO-3073 In Progress through review. Move it to Done only when the user confirms merging, and retain these rollout dependencies in the ticket so a draft is not mistaken for production verification.
