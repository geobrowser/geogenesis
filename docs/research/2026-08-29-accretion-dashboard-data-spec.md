# Accretion Dashboard: Product and Data Specification

**Date:** 2026-08-29

**Status:** Research artifact and implementation specification

**Source:** [Accretion dashboard: what gets measured](https://app.notion.com/p/Accretion-dashboard-what-gets-measured-3cb273e214eb81df8bb2e2eb758d250a) and its [Tokenomics Hub](https://app.notion.com/p/Tokenomics-Hub-3cb273e214eb8081b53aed1d5fbc214e) context

**Live data inspected:** `https://api-testnet.geobrowser.io/graphql`
**Snapshot caveat:** Counts below are a testnet snapshot from 2026-08-29. They prove schema and coverage, not production economic performance.

## Executive summary

The pre-launch accretion dashboard is feasible with current data, but it is a multi-source analytics feature rather than a single GraphQL query.

The Geo graph already contains a strong curator-program spine:

- Bounties with budget, scope, status, deadlines, difficulty, skills, and allocated curators.
- Payouts with amounts and mandatory links to bounties.
- Many-to-many links between bounties, governance proposals, and payouts.
- Governance proposal authorship, submission time, and execution time.
- Proposal diffs capable of describing the entities, claims, relations, and structure produced by accepted work.

The graph does **not** yet provide a reliable direct payout recipient, adjudication state history, rejection/rework events, token/currency metadata, funding balances, issuance, stake positions, commissions, appeals, affiliate relationships, or lifecycle declarations. Those gaps block the complete network, space, and staker dashboards, but they do not block a useful pre-launch curator-program dashboard.

The recommended first implementation is a read-only analytics surface with six panels:

1. Unit cost deck
2. Retroactive ROI
3. Absorption curve
4. Spend-to-output by curator cohort
5. Declared versus delivered
6. Duplication check

The implementation must preserve the source document's central boundary: these metrics inform governance, display, ranking, and staker choice. They must never automatically determine an individual's payment.

## Non-negotiable product boundary

The three levels answer different questions and must remain separate.

| Level   | Question                       | Allowed effect                                                          |
| ------- | ------------------------------ | ----------------------------------------------------------------------- |
| Network | Is issuance accretive?         | Governance judgment about issuance rate, split, and program design only |
| Space   | Is this space allocating well? | Public display, ranking inputs, and staker choice; never direct payment |
| Money   | Did adjudicated work clear?    | Binary human decision to pay or not pay; no continuous score            |

### Guardrails

- Do not expose a combined "curator score" that can become a shadow payout formula.
- Do not feed dashboard outputs into payout creation, payout amount, or adjudication.
- Display methodology, coverage, and incomplete-data warnings beside computed metrics.
- Keep observed facts separate from modeled value. For example, payout amount is observed; replacement-cost value is derived.
- Version formulas and artifact weights so historical charts do not silently change when methodology changes.

## Live source-system inventory

### 1. Knowledge graph entities, values, and relations

The public GraphQL endpoint provides the curator-program domain objects and their joins.

| Concept                  | Graph representation            | ID / field                         | Snapshot coverage                                    |
| ------------------------ | ------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| Bounty                   | Type                            | `808af0bad5884e3391f09dd4b25e18be` | 215 entities                                         |
| Bounty budget            | Decimal/number property         | `9ece325c592d42d5b2e785e8e6fe05b6` | 211/215 bounties (98.1%)                             |
| Bounty description/scope | Text property                   | `9b1f76ff9711404c861e59dc3fa7d037` | Present on many, not required                        |
| Bounty allocation        | Bounty to person/space relation | `cfeb642223c54df4b3f9375a489d9e22` | 475 links; 135 unique identities across 131 bounties |
| Bounty task status       | Bounty to status relation       | `054a7993ec2843e29688c84ac7a09220` | 131/215 bounties (60.9%)                             |
| Submission deadline      | Date-like property              | `7566286ca054405a83e185ffd60492fb` | 77/215 bounties (35.8%)                              |
| Proposal                 | Graph type mirror               | `490a7c90ad4b4029b2b4d85d22fe203a` | 3,927 typed entities                                 |
| Proposal to bounty       | Relation                        | `3b4c516ff3ac41e0a939374119a27d6e` | 3,942 links                                          |
| Payout                   | Type                            | `f5132deb102d64553049f1e9cb662f50` | 785 entities                                         |
| Payout amount            | Decimal property                | `82fe45a31df74c0291afa6e68d41cddf` | 770/785 payouts (98.1%)                              |
| Payout to bounty         | Relation                        | `1b595a8b81fc25856a9b503e3e993331` | 785 links; one for every payout                      |
| Payout to proposal       | Relation                        | `8128964c1ec54829beb380a21ab64c51` | 2,651 links                                          |
| Payout recipient         | Declared relation property      | `151b0bd3440d435ab093ed5fab73db6c` | 0 links; schema exists but is unused                 |

The payout amount sum in the snapshot is 587,575 across 770 populated records. This is a data-integrity observation only: the graph does not consistently identify currency, token, USD conversion, or whether historical testnet records represent real settlement.

The allocation relation currently provides the best graph-native view of curator participation: 475 allocation links cover 135 unique target identities, 131 bounties, and 32 spaces. Most targets are both Person and Space entities because personal spaces carry both types. A separate type named `Curator` exists, but its description is specific to a Paris content domain and it is not the curator-program identity model. Do not filter program participants by that type.

Current task-status distribution among the 131 bounties that have a status:

| Status      | Entity ID                          | Count |
| ----------- | ---------------------------------- | ----: |
| Todo        | `76b5b831a5fa4203ad61b3f93915edec` |    60 |
| Done        | `425f3e809cf9488696581775159dfc33` |    25 |
| Backlog     | `ee3dd49a49754ff696d0af79044dc21c` |    22 |
| In Progress | `548fca08e94743668457b0d8429d5bf9` |    19 |
| In review   | `16f543624376498ea00d5aad45096a45` |     4 |
| Cancelled   | `0fb6253b9f2c405886bc49f170f317b3` |     1 |

### 2. Governance indexer and REST API

Governance proposals have two relevant representations:

- `proposalsConnection` is the complete indexed governance table. The snapshot contains 30,244 proposals and exposes `id`, `spaceId`, `proposedBy`, `createdAt`, `executedAt`, and `unexecutableAt`.
- Proposal entities of type `490a7c90ad4b4029b2b4d85d22fe203a` are a smaller graph mirror used for semantic relations such as bounty and payout links. They are not a complete proposal-history source.

The application already uses the REST API for richer governance state:

- `GET /proposals/space/{spaceId}/status` supplies status, voting mode, actions, votes, timing, and executability.
- `GET /versioned/proposals/{proposalId}/diff?spaceId=...` supplies entity-level proposal diffs.

Use the indexed governance table for complete proposal identity, authorship, submission time, and execution time. Use the graph proposal entity for semantic joins. Use the REST status/diff endpoints for acceptance state and output classification.

### 3. Version history and authorship

The GraphQL API exposes relation and edit version history:

- `relationVersionsConnection` provides `validFromKey` and `validToKey`.
- `editVersionsConnection` maps a version key to `createdAt` and `createdById`.

This can recover when a bounty status or allocation relation changed and who published an entity's first version. The existing curator leaderboard already uses this pattern to attribute newly accepted news stories to their originating curator.

Version-history derivation is useful for backfill, but explicit lifecycle timestamps are preferable for future data. Reconstructing business events from arbitrary graph edits is costly and can be ambiguous.

### 4. Protocol/on-chain data not found as first-class dashboard types

The inspected graph has no relevant first-class types named Stake, Commission, Stipend, Appeal, or Issuance. A generic Funding round type exists, but it is not a curator-program funding ledger. The complete protocol dashboard therefore needs a separate indexed contract/accounting source for:

- Issuance by cycle and its USD value
- Curator and staker issuance shares
- Stake positions and position aging
- Commission accrual and settlement
- Space balances and funding windows
- Aggregator management fees

### 5. Existing application touchpoints

The web application already contains useful query and transformation patterns:

| File                                                        | Reusable responsibility                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/core/constants.ts`                                | Bounty, status, allocation, and proposal-link IDs                                         |
| `apps/web/core/community/fetch-space-bounties.ts`           | Space-scoped bounty, budget, status, skill, and allocation query                          |
| `apps/web/core/community/fetch-curator-leaderboard.ts`      | Paginated aggregation, proposal execution filtering, and first-version author attribution |
| `apps/web/partials/review/bounty-linking/build-bounties.ts` | Normalized bounty construction and allocation/status logic                                |
| `apps/web/core/io/subgraph/fetch-proposals.ts`              | Rich proposal lifecycle data from the REST API                                            |
| `apps/web/core/io/subgraph/fetch-proposal-diffs.ts`         | Paginated proposal-diff retrieval and post-processing                                     |
| `apps/web/core/community/community-graphql.ts`              | Capped pagination, UUID normalization, and query error handling                           |

These are good references, but dashboard aggregation should move server-side rather than importing UI-oriented fetchers into a large client query.

## Canonical curator-program join model

The dashboard's present-day analytical path should be:

```text
Space
  └─ Bounty
      ├─ budget / scope / deadline / current status
      ├─ allocated → curator personal space or person
      ├─ linked from → Proposal
      │    ├─ proposedBy / createdAt / executedAt
      │    └─ proposal diff → created and updated graph artifacts
      └─ linked from → Payout
           ├─ amount
           └─ linked to → one or more accepted proposals
```

### Join rules

1. Normalize all UUIDs to bare lowercase hex before joining. REST responses may be hyphenated while GraphQL IDs are generally bare.
2. Treat `Payout -> Payout bounty` as the canonical payout-to-bounty edge; snapshot coverage is complete.
3. Treat `Proposal -> Bounties` as the canonical submission-to-bounty edge.
4. A proposal is **accepted** for pre-launch analytics when the governance indexer has a non-null `executedAt`. Do not infer acceptance from the bounty's current `Done` status.
5. A payout may link to multiple proposals. Do not double-count the full payout amount once per proposal.
6. A bounty may have multiple allocated curators. Until `Payout recipient` is populated, recipient-level and cohort metrics are ambiguous and must be labeled provisional or omitted.
7. Treat payout amount as nominal until currency/token and USD-normalization fields exist.
8. Use proposal diffs to determine output; never use proposal title keywords as the production count.

## Artifact classification

The output side of the dashboard needs a stable classification contract.

### Recommended output record

Each accepted proposal diff should be transformed into one or more analytical output records:

| Field                 | Meaning                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `proposal_id`         | Governance proposal that delivered the change                                              |
| `bounty_id`           | Bounty linked to the proposal                                                              |
| `space_id`            | Space accepting the work                                                                   |
| `curator_id`          | Explicit payout recipient when available; otherwise provisional proposal author/allocation |
| `accepted_at`         | Proposal `executedAt`                                                                      |
| `entity_id`           | Changed graph entity                                                                       |
| `operation`           | `created`, `updated`, `related`, or `removed`                                              |
| `artifact_type_id`    | Primary graph type of the output entity                                                    |
| `artifact_type_name`  | Display name such as Claim, Topic, News story, or structural relation                      |
| `native_flag`         | Exact-new, reused-existing, or unknown                                                     |
| `weighted_units`      | Methodology-versioned output weight                                                        |
| `methodology_version` | Version of classification and weight rules                                                 |

### Creation versus reuse

- **Exact new:** the proposal creates the entity's first accepted version.
- **Reused existing:** the proposal adds values, relations, or space presence to an entity that already existed.
- **Structural:** the proposal primarily adds or changes relations, ordering, or blocks.
- **Semantic duplicate:** a newly created entity is substantially equivalent to an existing entity. This cannot be determined reliably from IDs alone; use embeddings plus a reviewed sample.

### Quality weighting

Start with transparent weights by artifact type and version them. Do not optimize weights against individual payouts. A defensible first release may display both raw counts and weighted units, with the weighted series explicitly marked experimental.

## Metric specification

### Pre-launch panels

#### 1. Unit cost deck

**Question:** What does accepted curator work actually cost by artifact type?

**Recommended formula:**

```text
clearing_unit_cost(type, trailing_window)
  = median(
      allocated_payout_amount_for_type
      / accepted_weighted_units_for_type
    )
```

**Inputs:** payout amount, payout-to-bounty link, payout-to-proposal link, accepted proposal execution time, proposal diff, artifact classification.

**Allocation rule:**

- Use directly attributable single-type proposals first.
- For mixed-output proposals, allocate payout proportionally by predeclared artifact weights.
- Never count the bounty budget as the clearing price when a payout amount exists.
- Keep records with missing amounts or output classification out of the median and disclose the excluded count.

**MVP status:** Buildable after the output transformer is implemented. Currency normalization remains a limitation.

#### 2. Retroactive ROI

**Question:** Was the curator program's accepted output worth at least what it cost?

```text
replacement_cost_value
  = sum(accepted_weighted_units_by_type × unit_cost_deck_by_type)

retroactive_roi
  = replacement_cost_value / cleared_payout_amount
```

Display the numerator, denominator, methodology version, and coverage beside the ratio. Because a unit-cost deck derived from the same program can make the result partly circular, add external benchmark rates when available and show a sensitivity range.

**MVP status:** Buildable as a modeled estimate, not an accounting fact.

#### 3. Absorption curve

**Question:** How much declared work can the contributor base complete?

Show cycle/week cohorts for:

- Bounties posted
- Budget posted
- Bounties with at least one accepted proposal
- Accepted payout amount
- Median time to first accepted proposal
- Median time to final accepted proposal

```text
bounty_absorption_rate = bounties_with_accepted_work / bounties_posted
budget_absorption_rate = cleared_payout_amount / bounty_budget_posted
```

Use bounty creation time for posting and proposal `executedAt` for accepted delivery. Track current task status separately. A `Done` relation is a declaration, not proof of accepted work.

**MVP status:** Buildable. Historical status-transition timing is derivable but should be replaced with explicit lifecycle timestamps.

#### 4. Spend-to-output by curator cohort

**Question:** Does allocation efficiency differ meaningfully across curator cohorts?

```text
cohort_efficiency
  = accepted_replacement_cost_value / cleared_payout_amount
```

Suggested cohorts: first payout month, space, artifact specialty, or new-versus-returning. Require a minimum sample size and show distributions rather than a public individual leaderboard.

**MVP status:** Blocked for a trustworthy release by the unused direct `Payout recipient` relation. A provisional private analysis can join through proposal author and bounty allocation, but multiple allocations make that attribution unsafe for public display.

#### 5. Declared versus delivered

**Question:** Does a space deliver the work it advertises?

For each posting cohort, show:

- Bounties published
- Bounties funded (requires an explicit funding definition)
- Bounties allocated
- Bounties with submitted proposals
- Bounties with accepted/executed proposals
- Bounties paid
- Delivered by deadline
- Median days to acceptance

**MVP status:** Partially buildable. Published, allocated, submitted, accepted, paid, and deadline timeliness are available. "Funded" is not yet represented independently from a stated budget.

#### 6. Duplication check

**Question:** How much output is genuinely additive?

Release in two layers:

1. **Exact reuse:** classify created entity IDs versus edits to pre-existing IDs from proposal diffs.
2. **Semantic duplication:** compare new entity names/descriptions/embeddings against existing entities and manually review a stratified sample.

Report `new`, `reused`, `suspected duplicate`, and `unknown` separately. Do not collapse reuse and duplication: extending an existing entity can be valuable maintenance.

**MVP status:** Exact reuse is buildable. Semantic duplication needs a new analysis job or a hand-audited sample.

### Network dashboard

| Metric                    | Formula                                                             | Current status                                                  |
| ------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Gross issuance ROI        | Change in replacement-cost curated graph value / total issuance USD | Blocked by issuance and price data; numerator can be prototyped |
| Curator ROI               | Same numerator / curator issuance share USD                         | Blocked by issuance split data                                  |
| Curated artifacts created | Accepted quality-weighted units by type                             | Buildable from proposal diffs                                   |
| Unit cost by type         | Trailing median clearing price per artifact type                    | Buildable with limitations described above                      |
| Maintenance decay         | Share of curated value not refreshed in trailing period             | Derivable after defining refresh eligibility and decay windows  |
| Absorption                | Cleared spend / issuance available to spend                         | Cleared spend partially available; issuance unavailable         |
| Cleared vs stopped        | Volume by cleared/stopped/appealed/overturned state                 | Blocked by payout adjudication events                           |
| Native vs duplicated      | New versus reused/semantically duplicated output                    | Exact layer buildable; semantic layer needs analysis            |

### Space dashboard

| Metric                              | Required source                                    | Current status                                   |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Spend-to-output                     | Payouts + accepted proposal diffs + unit-cost deck | Buildable after output transformer               |
| Commission per unit stake           | Commission ledger + stake snapshots                | Not available in inspected graph                 |
| Cleared payout volume by cycle/type | Payout amount, kind, currency, state, cycle        | Amount exists; kind/currency/state/cycle missing |
| Promised vs available funds         | Obligations + space balance/funding windows        | Not available                                    |
| Declared vs delivered               | Bounties + proposals + payouts + deadlines         | Partially buildable                              |
| Editor self-payment ratio           | Recipient + editor/affiliate snapshot              | Recipient unused; affiliate data missing         |
| Payout concentration                | Explicit recipient + normalized amount             | Blocked by recipient and currency gaps           |
| Curator churn                       | Explicit recipient + payout timestamp              | Blocked by recipient gap                         |
| Stop/appeal record                  | Adjudication event ledger                          | Not available                                    |
| Lifecycle and seasonality           | Space declaration + observed spend                 | Declaration model missing; spend derivable       |
| Aggregator management fee           | Fee declaration + settlement ledger                | Not available                                    |

### Staker dashboard

| Metric                   | Required source                                      | Current status                                                            |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Realized commission rate | Position-level stake and commission settlements      | Not available                                                             |
| Pending claims           | Funding windows, uncleared work, expected settlement | Not available                                                             |
| Benchmark comparison     | Position returns + aggregator blended return         | Not available                                                             |
| Position aging           | Stake open/close timestamps and balances             | Not available                                                             |
| Opportunity view         | Forward bounty book + interests + space track record | Bounty book and track record partially available; stake interests missing |

## Required data contracts and backfills

### Priority 0: needed for a credible pre-launch release

1. Populate `Payout recipient` on every new payout and backfill historical payouts.
2. Add `currency_or_token`, raw amount, decimals, and settlement-time USD value.
3. Define whether payout entity creation means human-cleared settlement; if not, add an explicit state.
4. Provide a stable proposal-diff analytics endpoint or batch export. The current per-proposal REST endpoint is suitable for UI review but expensive for a full historical dashboard.
5. Define artifact types and methodology-versioned output weights.
6. Record lifecycle events explicitly: posted, funded, allocated, submitted, accepted, rejected, rework requested, completed, and cancelled.

### Priority 1: needed for the complete space dashboard

Add a payout adjudication event model:

```text
payout_id
state: CLEARED | STOPPED | APPEALED | OVERTURNED
occurred_at
actor_id
reason_code
supersedes_event_id
```

Also add:

- Payout kind: bounty, stipend, round, or manual
- Cycle/season ID
- Settlement transaction/reference
- Bounty funding reservation and release
- Editor and affiliate membership snapshots at payout time
- Space lifecycle declaration and aggregator fee declaration

### Priority 2: needed for network and staker dashboards

- Issuance ledger by cycle with curator/staker split and USD conversion
- Stake-position event stream
- Commission attribution and settlement ledger
- Space/aggregator balance snapshots
- Funding-window and pending-claim records

## Recommended analytics architecture

Do not calculate the entire dashboard in the browser. The joins span paginated graph collections, governance records, historical proposal diffs, and eventually on-chain/accounting data.

### Ingestion

Incrementally ingest:

- Graph bounty, payout, proposal-entity, relation, value, and version changes
- Governance proposal lifecycle records
- Proposal diffs for bounty-linked proposals
- Future settlement, issuance, stake, and commission events

### Canonical facts

Materialize at least:

- `fact_bounty`
- `fact_bounty_lifecycle_event`
- `fact_proposal_delivery`
- `fact_artifact_output`
- `fact_payout`
- `fact_payout_adjudication_event`
- `dim_curator`
- `dim_space`
- `dim_cycle`
- `dim_artifact_type_weight`

### Serving API

Expose pre-aggregated, methodology-versioned responses, for example:

```text
GET /analytics/accretion/network?from=&to=&methodology=
GET /analytics/accretion/spaces/{space_id}?from=&to=&methodology=
GET /analytics/accretion/curator-program?from=&to=&space_id=
GET /analytics/accretion/methodologies/{version}
```

Every response should include:

- `as_of`
- `methodology_version`
- source-row counts
- missing/unclassified counts
- currency coverage
- whether the result is observed, derived, or modeled

## Suggested first Linear ticket

### Title

**Accretion dashboard: build curator-program data pipeline and pre-launch panels**

### Scope

Build a read-only curator-program dashboard using bounty, payout, governance proposal, and proposal-diff data. Include the six pre-launch panels, methodology/coverage disclosure, space and time filters, and CSV export for validation.

### Acceptance criteria

- The dashboard joins payouts to bounties and accepted proposals without double-counting many-to-many links.
- Accepted work is defined by non-null proposal `executedAt` and output is sourced from proposal diffs.
- Unit cost is shown by artifact type with raw count, weighted units, median, sample size, and excluded-record count.
- Retroactive ROI displays numerator, denominator, methodology version, and a sensitivity range.
- The absorption chart shows posted, accepted, and paid cohorts over time plus time-to-acceptance.
- Declared-versus-delivered distinguishes published, allocated, submitted, accepted, paid, and on-time.
- Duplication distinguishes exact-new, reused-existing, suspected semantic duplicate, and unknown.
- Curator-cohort metrics are hidden or marked provisional until direct payout-recipient coverage is sufficient.
- All panels support time and space filters and show an `as of` timestamp.
- Missing budget, amount, status, deadline, recipient, and output-classification coverage is visible.
- Test fixtures cover one bounty with multiple proposals, one payout with multiple proposals, multiple curators allocated to one bounty, missing amount, missing deadline, and a mixed-output proposal.
- No dashboard metric is imported by or callable from payout creation/adjudication code.

### Explicitly out of scope for the first ticket

- Automated payout decisions
- Stake or commission dashboards
- Issuance ROI using live token economics
- Appeal/overturn analysis before an adjudication event model exists
- Public individual curator rankings
- Fully automated semantic-duplication judgment

## Implementation work breakdown

1. **Data contract and backfill**
   - Populate payout recipient and currency metadata.
   - Confirm lifecycle semantics and create fixture coverage.
2. **Historical extractor**
   - Fetch bounty/payout/proposal joins.
   - Batch and cache proposal diffs.
   - Normalize IDs and timestamps.
3. **Output transformer**
   - Classify entity creation, reuse, relation work, and artifact type.
   - Apply versioned weights.
4. **Metric aggregation**
   - Produce unit cost, ROI, absorption, cohorts, delivery, and duplication series.
   - Emit coverage metadata with every aggregation.
5. **Dashboard UI**
   - Build six panels, filters, methodology drawer, warnings, and CSV export.
6. **Validation**
   - Reconcile a hand-selected bounty sample against graph records and human program records.
   - Compare aggregate payout totals with the source-of-truth payment ledger.

## Open decisions

These decisions should be resolved before implementation estimates are final:

1. What currency/token does each historical payout amount represent, and what is the USD conversion policy?
2. Does creating a payout entity guarantee that payment cleared, or is it merely a payout request?
3. Which event is authoritative for delivery: accepted proposal execution, bounty status `Done`, payout creation, or a new adjudication event?
4. How should one payout be allocated across multiple proposals and artifact types?
5. Who is the curator of record: payout recipient, proposal author, bounty allocation, or a team split?
6. What are the initial artifact-type weights, who governs them, and how often may they change?
7. What is the cycle boundary for historical curator-program data?
8. What qualifies as "funded" rather than merely budgeted?
9. What trailing window defines maintenance refresh and which artifact types decay?
10. What minimum sample size is required before cohort efficiency is displayed?

## Risks

- **Currency ambiguity:** Summing nominal payout amounts can produce a convincing but invalid financial chart.
- **Attribution ambiguity:** Bounty allocations are many-to-many and cannot safely substitute for a payout recipient.
- **Survivorship bias:** Proposal diffs emphasize accepted work; rejected and rework attempts need explicit events.
- **Circular valuation:** Deriving replacement value from the same payouts used as cost can mechanically pull ROI toward 1.
- **Graph mirror incompleteness:** Typed Proposal entities are a subset of indexed governance proposals.
- **Mutable methodology:** Changing artifact weights without versioning rewrites history.
- **Goodhart pressure:** Public individual efficiency rankings could become compensation proxies even without a direct code path.
- **Testnet contamination:** Seeded or synthetic records must not be presented as production economics.

## Queries used to validate the live model

The following are abbreviated forms of the read-only queries run against the testnet endpoint.

### Type counts

```graphql
query {
  bounties: entitiesConnection(
    first: 1
    typeId: "808af0bad5884e3391f09dd4b25e18be"
  ) {
    totalCount
  }

  payouts: entitiesConnection(
    first: 1
    typeId: "f5132deb102d64553049f1e9cb662f50"
  ) {
    totalCount
  }

  proposalsConnection(first: 1) {
    totalCount
  }
}
```

### Payout coverage

```graphql
query {
  amounts: valuesConnection(
    first: 1000
    filter: {
      propertyId: { is: "82fe45a31df74c0291afa6e68d41cddf" }
      entity: { typeIds: { overlaps: ["f5132deb102d64553049f1e9cb662f50"] } }
    }
  ) {
    totalCount
    nodes {
      entityId
      decimal
      spaceId
    }
  }

  bountyLinks: relationsConnection(
    first: 1
    filter: {
      typeId: { is: "1b595a8b81fc25856a9b503e3e993331" }
      fromEntity: {
        typeIds: { overlaps: ["f5132deb102d64553049f1e9cb662f50"] }
      }
    }
  ) {
    totalCount
  }
}
```

### Accepted bounty submissions

```graphql
query AcceptedBountySubmissions($spaceId: UUID!, $proposalIds: [UUID!]) {
  proposalsConnection(
    first: 200
    filter: {
      spaceId: { is: $spaceId }
      id: { in: $proposalIds }
      executedAt: { isNull: false }
    }
  ) {
    nodes {
      id
      proposedBy
      createdAt
      executedAt
    }
  }
}
```

## Final recommendation

Proceed with the pre-launch dashboard as an analytics and instrumentation project. The data is already rich enough to validate the core accretion thesis, especially unit cost, accepted output, absorption, delivery, and exact reuse. Start by fixing recipient/currency/lifecycle data and by materializing proposal diffs. Defer protocol-level issuance, commission, and staker panels until their accounting event sources exist.

Above all, retain the boundary that makes the framework robust: measurement may inform governance and choice, while payment remains a separate human-adjudicated clearing decision.
