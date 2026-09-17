# Backfilling claim timecodes across every debate

Companion to `2026-09-15-debate-claim-timecodes-publish-instructions.md`, which did this for one
debate by hand. Same writes, same properties, same space rules — 50 debates instead of one, and the
offsets come from the matcher rather than from reading a transcript by eye.

---

## Scope — read this first

> Your job is one thing: publish the writes in
> `docs/plans/2026-09-17-debate-claim-timecodes-plan.json`, as described under **The writes** and
> **Proposals** below. One proposal per space, six spaces.
>
> Everything under **Background** is context for the decision, not instructions. Do not act on it.
>
> Do not regenerate the plan, change the floor, or add claims that are not in the file. If the plan
> looks stale or the numbers do not match, stop and say so rather than rebuilding it — the file is
> the audit record of what was published and on what evidence, and it only means that if the thing
> published is the thing in the file.

---

## Background — what is being published, and why it needs a floor

*Background, not instructions.*

Each write puts `Start offset` and `End offset`, in integer milliseconds, onto the relation entity
between a transcript block and a claim — the same target, the same two properties, and the same
`Selector` typing as the single-debate publish. Nothing new is minted.

The difference is where the numbers come from. The 13 offsets in the first publish were produced by
the matcher and then hand-corrected against the transcript: 9 were right, 4 were not. There is no
hand-correcting 617 of them, so the plan publishes only the ones the matcher is confident enough
about and leaves the rest alone.

**Leaving a claim alone costs nothing.** `core/debates/claim-timing.ts` runs the same matcher at read
time for any claim with no published offsets, so an unpublished claim is displayed exactly as it is
today. Publishing is not what makes a claim work; it makes it *permanent*.

**Which is why there is a floor at all.** `published` is the resolver's most-trusted source, scored
1.0 — so writing a weak match does not preserve its weakness. It promotes a guess to an exact answer
that no later gate can demote, on a surface that quotes a real person saying something at a specific
second.

**The floor is 0.70.** The live layer draws at 0.55, and this deliberately sits above it rather
than on it. Publishing at exactly the display bar would leave no margin: a claim scraping over at
0.551 would be written as `published` and scored 1.0, and the boundary cases are precisely the ones
a margin catches. 0.70 buys that margin for the cost of 140 claims published instead of 309.

Even so, the plan file records every claim's real score, so anything published near the line can be
found again and overwritten when GEO-2958 produces the extractor's true span.

At this floor every claim being published **already displays today** on the strength of its match,
so this changes nothing a viewer sees. What it buys:

- The offsets stop depending on geo-chat still serving that debate's transcript, and on its
  segmentation not changing under us.
- The matching stops being redone on every view.
- There is a written record — this plan file — of which offsets were inferred and how strongly,
  which matters when GEO-2958 lands. Without it, a guessed offset and an exact one are
  indistinguishable in the graph.

### Where the claims actually fall

854 claims across the debates that have any. 13 already carry offsets (the test debate). 224 could
not be matched at all and fall back to their turn. That leaves 617 matched claims:

| Floor | Claims published | Share of matched | What it means |
|---|---:|---:|---|
| ≥ 0.80 | 70 | 11% | Near-certain only |
| ≥ 0.75 | 107 | 17% | |
| **≥ 0.70** | **140** | **23%** | **The plan. A margin above the live-display bar** |
| ≥ 0.65 | 178 | 29% | |
| ≥ 0.60 | 244 | 40% | |
| ≥ 0.55 | 309 | 50% | Exactly the live bar — no margin for a permanent write |
| ≥ 0.50 | 387 | 63% | Below what the app will draw — do not |
| ≥ 0.35 | 617 | 100% | Everything the resolver considers usable at all |

`plan-claim-timecodes.ts` prints this table on every run, so a different floor can be chosen with
the consequence in front of you rather than by picking a round number.

The distribution has its mass between 0.4 and 0.7, so the floor is doing real work rather than
rubber-stamping: it turns away more than three quarters of what was matched.

These counts drift by a few between runs as debates are recorded and transcripts come and go. If the
regenerated numbers differ slightly from the table, that is why; a large difference is not.

---

## Constants

| Name | Id |
|---|---|
| `Start offset` | `a1d1cb557b184238ba0ec78ba7f289fb` |
| `End offset` | `79a677b597f84ca8a1cf24eef7837b61` |
| `Types` (relation type) | `8f151ba4de204e3c9cb499ddf96f48f1` |
| `Selector` (type) | `813ca865db9b486490dec6764febaab3` |
| `Target property` (relation type) | `e1788cdf9bae42e987b0d9791de09b31` |
| `Debate videos` (property) | `c48dc314fa7148aeb967139160456f1d` |

All six are also in the plan file under `constants` and `offsetProperties`, so they can be read from
there rather than retyped.

---

## The writes

`docs/plans/2026-09-17-debate-claim-timecodes-plan.json`:

```jsonc
{
  "floor": 0.7,
  "totals": { "claims": 854, "writes": 140, "alreadyPublished": 13, "belowFloor": 477, "noMatch": 224 },
  "debates": [
    {
      "debateEntityId": "…",
      "debateName": "Bertrand Armando vs. Arturas Vil on Open-source AI…",
      "spaceId": "41e851610e13a19441c4d980f2f2ce6b",
      "writes": [
        {
          "entityId": "bbd3facb0fe542a9bb9b14678adddcb6",  // write here
          "claimId": "e55ddac8fcaf4f7cbe4d521d4cde60b4",   // for reference only
          "claimText": "Open-source AI models should be restricted…",
          "startMs": 61000,
          "endMs": 84000,
          "confidence": 0.932,
          "source": "segment"
        }
      ]
    }
  ]
}
```

`entityId` is the **relation entity** — `Relation.entityId` in the API, distinct from the relation
id, and currently empty. That is the target. Not the claim, not the block. `claimId`, `claimText`
and `confidence` are there so a write can be checked by eye; they are not written anywhere.

Each write produces two values and two relations, exactly as the single-debate publish did:

```ts
import { Ops } from '@geoprotocol/geo-sdk/lite';

const plan = JSON.parse(
  await readFile('docs/plans/2026-09-17-debate-claim-timecodes-plan.json', 'utf8')
);
const { TYPES_PROPERTY, SELECTOR_TYPE, TARGET_PROPERTY, DEBATE_VIDEOS_PROPERTY } = plan.constants;
const { start: START_OFFSET, end: END_OFFSET } = plan.offsetProperties;

const opsFor = write => [
  ...Ops.entities.update({
    id: write.entityId,
    values: [
      // Numbers, not strings — the same shape the single-debate publish used and landed with.
      // (The *read* API serialises integer values as strings; the write side does not.)
      { property: START_OFFSET, type: 'integer' as const, value: write.startMs },
      { property: END_OFFSET, type: 'integer' as const, value: write.endMs },
    ],
  }).ops,
  // this relation entity is a Selector…
  ...Ops.relations.create({ fromEntity: write.entityId, type: TYPES_PROPERTY, toEntity: SELECTOR_TYPE }).ops,
  // …whose offsets index the debate's video
  ...Ops.relations.create({
    fromEntity: write.entityId,
    type: TARGET_PROPERTY,
    toEntity: DEBATE_VIDEOS_PROPERTY,
  }).ops,
];
```

## Proposals

Group by `spaceId` and publish **one proposal per space**. Values and relations are both
space-scoped, and the app reads them through a traversal already filtered to the debate's own space
— anything published to the wrong space is invisible to it. The `spaceId` on each debate in the plan
is the space its claims were found in; use that and nothing else.

| Space | Writes | Ops (values + relations) |
|---|---:|---:|
| `41e851610e13a19441c4d980f2f2ce6b` | 56 | 112 + 112 |
| `4582fbbee28a16589154f7e36f1ee3c5` | 32 | 64 + 64 |
| `224406e0de3c48d78ef12774111b8b2f` | 29 | 58 + 58 |
| `89bd89bf28ff8a0963faf92a8c905e20` | 9 | 18 + 18 |
| `52c7ae149838b6d47ce0f3b2a5974546` | 9 | 18 + 18 |
| `c9f267dcb0d270718c2a3c45a64afd32` | 5 | 10 + 10 |

The largest is 224 ops, against 52 in the single-debate publish — over four times the biggest
proposal this pattern has actually landed. **Publish the smallest space first** and confirm it
before committing to the large ones.

If a proposal is rejected for size, or you would rather not risk one that big, split that space by
debate: group its writes by `debateEntityId` and publish one proposal per debate. The writes are
independent and nothing depends on two of them landing together, so the split costs nothing but
transactions.

**Partial runs are safe.** A claim that already carries offsets is skipped when the plan is next
generated, so a run that dies half way through can be resumed by regenerating and republishing. It
will not double-write. It is still better to finish a space than to leave one half-published, purely
so the record matches.

## Verify

Per space, after publishing. `verify-claim-timing.ts` takes a debate entity id and a space:

```
bun scripts/verify-claim-timing.ts <debateEntityId> <spaceId>
```

For a debate in the plan, the claims that were published should come back `[published 1.00]`, and
the count on the `with published timecodes:` line should equal that debate's `writes.length`. The
rest of its claims stay `segment` or `block`, which is correct — they were below the floor.

Three things to check across the run:

- Every `start_ms` is less than its `end_ms`, and both are within the debate's duration. The plan is
  generated from real segment boundaries so this should hold by construction; it is worth confirming
  once per space rather than per claim.
- Each relation entity carries `Types → Selector` and `Target property → Debate videos`. A bare pair
  of integers with no typing is readable by the app but says nothing about what it indexes.
- Nothing landed in a space other than the one the plan names.

---

## Background — what this deliberately does not do

*Background, not instructions.*

- **It does not touch the 477 claims below the floor.** They keep working through the read-time
  matcher, at their true confidence, and they keep the option of being published properly later.
- **It does not touch the 224 claims with no usable match.** A whole-turn window is the absence of a
  timecode, not a loose one; publishing a 30-second span as an exact offset would be worse than
  publishing nothing.
- **It does not overwrite the test debate.** Its 13 claims already carry hand-checked offsets and
  are skipped.
- **It does not replace GEO-2958.** The extractor knows the exact span it pulled each claim from;
  that is a better answer than any match and it is the durable fix. This is a stopgap that makes the
  best-matched fifth permanent, and the plan file is what tells a later backfill which offsets were
  inferred and should be overwritten when the real ones arrive.

## Background — regenerating the plan

*Background, not instructions. The committed plan is what to publish.*

```
bun scripts/plan-claim-timecodes.ts [--floor 0.7] [--out plan.json] [--limit N]
```

Read-only: it enumerates every `Debate`-typed entity, pulls each one's blocks and claims in its own
space, fetches the transcript from geo-chat, runs `resolveClaimTimings`, and writes the plan. It
prints the confidence histogram the table above came from, so a different floor can be chosen with
the consequences in view.

Two API details it had to work around, in case something else needs them: `typeId` is a **field
argument** on `entities`, not a field of `EntityFilter` (the filter's own `typeIds` errors), and
`Relation.entityId` has to be read off the raw response — `TranscriptClaim` does not carry it,
because the UI has no use for it.
