# Governance UI changes — voting settings & proposal path

Three governance-related UI changes for the new DAO-space contracts, implemented against
the Figma designs. Automated status: `apps/web` `tsc --noEmit` clean; full unit suite
1,175 tests green (added 14 in `voting-settings.test.ts`); eslint clean on all touched
files. Everything below the automated line needs manual on-chain / UI verification.

All three changes share one field mapping between the design labels and the SDK's
`VotingSettingsInput` (`@geoprotocol/geo-sdk` 0.20.0-beta.8):

| Design label                       | SDK field                          | Notes |
|------------------------------------|------------------------------------|-------|
| Vote duration                      | `durationInSeconds`                | shown as `24h` / `Xm` |
| Pass threshold / Slow path threshold | `partialPercentageSupportThreshold` | percentage 0–100 |
| Fast pass threshold / Fast path votes | `flatSupportThreshold`           | editor votes for instant approval |
| Quorum                             | `quorum`                           | min editors that must vote |

The designs expose only those four. `universalPercentageSupportThreshold`,
`executionGracePeriodInDays`, and `disableFastPathAccessForNewMembers` are **not** shown;
they are preserved unchanged on edit and defaulted on create (see decisions below).

---

## Change 1 — governance settings display (Figma 62569-13445)

`apps/web/app/space/[id]/(space)/governance/page.tsx`

- Replaced the previous 5 settings cards + "new members fast path" badge with the 4
  design cards: **Vote duration, Pass threshold, Fast pass threshold, Quorum**.
- Removed the **"Active proposals / Accepted vs. rejected"** counter row (and its
  `getProposalsCount` GraphQL query) so the page matches the design — only the four
  cards, the filter row, and the proposal list remain.
- The edit-governance action lives in an **editor-only 3-dot (⋯) context menu** on the
  right of the "All proposals" filter row (design 62569-13445), rendered by the new
  `EditGovernanceSettings` client component; it returns `null` for non-editors via
  `useAccessControl`, so the menu doesn't appear for them.
- The raw on-chain `votingSettings` struct is bigints, which can't cross the
  server→client boundary, so the page converts it to a plain `VotingSettingsSnapshot`
  and passes that to the client modal.

## Change 2 — set / propose governance settings (Figma 62596-12064)

The same 4-field form is now used in two places, via shared building blocks:

- `apps/web/partials/governance/voting-settings.ts` — pure form ↔ input ↔ snapshot
  converters + `parseVotingSettingsForm` (reuses the SDK's `validateVotingSettingsInput`).
- `apps/web/partials/governance/voting-settings-fields.tsx` — the presentational 4-field
  UI (slow-path threshold slider, vote duration Day/Hours/Minutes/Seconds, fast-path
  votes, quorum).

**(a) Create-space advanced** — `StepConfigureGovernance` in
`apps/web/partials/create-space/create-space-dialog.tsx` was rewritten to use the shared
fields. Validates against 1 initial editor (the creator). Button: **Save settings**.

**(b) Existing space** — new `apps/web/partials/governance/edit-governance-settings.tsx`
modal + `apps/web/core/hooks/use-propose-voting-settings.ts` hook. On **Propose changes**
it calls `geo.daoSpaces.proposeUpdateVotingSettings(...)` → `smartAccount.sendUserOperation`.
Updating settings is **SLOW-path only** (SDK-enforced): it always creates a proposal that
editors vote on, never a direct change.

## Change 4 — voting-settings change in the proposal diff viewer

When someone opens an `UPDATE_VOTING_SETTINGS` proposal to vote, the diff viewer now shows
the settings change (current → proposed) instead of an empty "no changes" state.

- The proposed NEW values already arrive on the API action (`slowThreshold`, `fastThreshold`,
  `quorum`, `duration`) but were being dropped. Wired them through:
  `substream-schema.ts` (added `UPDATE_VOTING_SETTINGS` to the `ProposalType` union),
  `rest/schemas/proposal.ts` (`getVotingSettingsProposalDetails` + type mapping — a lone
  update action was previously mis-classified as `ADD_EDIT` and rendered "No changes"),
  `dto/proposals.ts` (`votingSettingsDetails` field), `subgraph/fetch-proposal.ts` (extract it).
- The current (OLD) values are read on-chain via `useVotingSettings` (the same
  `DaoSpaceAbi.votingSettings` read used elsewhere).
- New component `partials/active-proposal/voting-settings-proposal.tsx` renders old→new rows
  for the four user-facing fields, branched in `active-proposal.tsx`. Only those four are
  diffable (the API doesn't carry universal support / grace / new-member fast-path).
- Units: the API's `slowThreshold` is a raw contract ratio (1e7 = 100%); it's converted to a
  percentage the same way the on-chain read is, with a ratio-vs-percent guard in case the API
  ever switches to sending a plain percentage.

**Tooltip fix (governance edit modal):** the "?" hints weren't showing because a portaled
Radix tooltip's popper wrapper sits at `z-index: auto` and renders behind a Dialog with an
explicit z-index. Replaced with a small portal-based hint (`HintTooltip` in
`voting-settings-fields.tsx`) that carries an inline max z-index on the positioned element,
so it always paints on top and is never clipped.

## Change 3 — fast/slow path selector on proposals (Figma 62501-94092)

- `apps/web/core/hooks/use-publish.ts` — `MakeProposalOptions`/`MakeProposalArgs` now take
  an optional `votingMode`. The decision at the old hardcode is now
  `space.isEditor ? (requestedVotingMode ?? 'FAST') : 'SLOW'` — editors default to FAST or
  their explicit choice; a stray FAST from a non-editor is ignored (members are always SLOW).
- `apps/web/partials/governance/proposal-path-selector.tsx` — the "Fast path / Review path"
  dropdown, with copy parameterized from the space's actual settings
  (`Only requires N editors…` / `Goes to a review over Xh and requires P% pass rate`).
- `apps/web/partials/review/review-changes.tsx` — renders the selector next to Publish,
  **only for DAO spaces where the user is an editor** (via `useAccessControl`), reads
  settings for the copy via the new `use-voting-settings.ts` hook, and threads the chosen
  mode into `makeProposal`. Resets to FAST when the active space changes.
- Added `apps/web/design-system/icons/fast-path.tsx` (bolt); reused `Time` for review path.

---

## Decisions made (autonomous — flag if you'd have chosen differently)

1. **Hidden settings.** universal support / grace period / new-member fast-path are not in
   any of the three designs, so they're no longer user-editable: preserved as-is when
   editing an existing space, defaulted (universal 90%, grace 14d, disable-new-member-fast-path
   true) when creating. The SDK validates `partial` and `universal` independently, so hiding
   universal can't produce an invalid combination.
2. **Removed the counters.** The "Active proposals / Accepted vs. rejected" boxes were
   deleted so the page matches the design (four settings cards only). If you want those
   stats back somewhere, they're easy to restore.
3. **Edit trigger.** An editor-only **3-dot (⋯) context menu** on the filter row, with a
   single "Edit space governance" item that opens the modal (matches design 62569-13445).
4. **Slow-path threshold slider** uses a native range input (no range component exists in
   the design system); the four duration boxes and the fast-path/quorum values are numeric
   inputs.

## Deferred (shown in the designs, not implemented — out of the stated scope)

- **Proposal-list restyle.** Designs 1 & 2 also restyle each proposal row (fast-path tag,
  YES/NO vote progress bars, "1 vote required"). That's a separate, larger effort on
  `GovernanceProposalsList` and was not part of the "how we show/set settings" ask. The
  existing proposal list is unchanged.
- The "All proposals ▾ / …" filter row already exists (`GovernanceProposalTypeFilter`) and
  was left as-is.

---

## Manual retest checklist

Run on testnet (chain 55516) with the beta.8 SDK. A DAO space where you are an editor is
required for most of these.

**G1. Display (Change 1).** Open a DAO space → Governance tab. Expect exactly four cards:
Vote duration, Pass threshold, Fast pass threshold, Quorum, with values matching the
space's on-chain settings — and no "Active proposals / Accepted vs. rejected" boxes.
Non-DAO/personal spaces: no cards, no 3-dot menu.

**G2. Edit trigger gating.** As an **editor**, a 3-dot (⋯) menu shows on the right of the
"All proposals" filter row; opening it shows "Edit space governance". As a **non-editor /
logged-out**, the 3-dot menu does not render.

**G3. Propose changes (Change 2b).** Open the 3-dot menu → Edit space governance → the modal prefills with current
settings. Change the slow-path threshold slider and/or duration, click **Propose changes**.
Expect: sponsored op submits, "Proposal submitted" confirmation, modal auto-closes, and a
new `UPDATE_VOTING_SETTINGS` proposal appears in the governance list for editors to vote on.
Verify nothing changed on-chain until the proposal passes.

**G4. Edit validation.** In the modal, blank a field / set quorum 0 / set duration under a
minute → inline error, "Propose changes" disabled. Fast-path votes 0 → non-blocking warning
but still submittable.

**G5. Create advanced (Change 2a).** Create Space → pick a DAO template → Advanced settings.
Expect the same 4-field form. Set values, Save settings, finish creation. On the new space's
Governance tab the four cards reflect what you entered. "Reset to defaults" restores them.
Out-of-range (e.g. quorum 3 with a single initial editor) → validation error.

**G6. Path selector visible (Change 3).** As an editor, open Review edits on a DAO space →
a "Fast path ▾" selector sits between "Link to bounty" and Publish. Open it: two options
with copy reflecting this space's settings (editor count, duration hours, pass %).

**G7. Path selector gating.** As a **member (non-editor)** of a DAO space: no selector
(proposal goes slow-path). On a **personal space**: no selector.

**G8. Fast vs review path submit.** As an editor, publish once with **Fast path** (expect
immediate execution as before) and once with **Review path** (expect a proposal with a
voting window, not instant execution). Confirm the selector resets to Fast path when you
switch to a different space in the review panel.

**G9. Regression — default publish.** An editor publishing without touching the selector
still defaults to Fast path (unchanged behavior). A member publishing still goes slow-path.

**G10. Voting-settings diff viewer (Change 4).** Submit a governance-settings change (G3),
then open that proposal from the governance list. Expect the proposal body to show
"Proposed governance settings" with current → proposed rows for the changed fields (e.g.
slow path threshold 51% → 60%), unchanged fields shown without an arrow. Confirm it is NOT
the empty "No changes to display" state. Title reads "Governance settings update" when the
proposal has no name.

**G11. Tooltip.** In the governance edit modal, hover each "?" — a dark hint tooltip appears
immediately, on top of the modal (not clipped, not behind it).
