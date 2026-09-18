# Publishing claim timecodes for one test debate

**Status:** ready to run — hand this file to an agent with a funded wallet that is an editor of the space below
**Date:** 2026-09-15
**Debate:** [Preston Mantel vs. Scot Loyd on Trump's second term is making America more authoritarian](https://www.geobrowser.io/space/4582fbbee28a16589154f7e36f1ee3c5/01a0a60772dc7cb09bf6ebba15e97b67)

## What this is

The debate claim UI wants to know *when* in the video each claim was said. Nothing in the graph
records that yet. This publishes it for one debate, by hand, so the UI can be built and demoed
against real data before the extractor is changed to emit it.

The offsets below were derived by matching each published claim against the Whisper transcript
(`GET /debates/{id}/transcript?format=json` on `chat-api-testnet.geobrowser.io`, 148 segments).
Nine were matched automatically; four were read off the transcript by hand because the automatic
match was under threshold or started a few seconds early. Every one has been eyeballed against the
segment text.

**Nothing else about the debate changes.** No claims are added, removed, renamed or reattributed.

### Scope — read this first

**Your job is one proposal to one space: the sections `Constants` through `Verify`.** That is 26
values and 26 relations across the 13 claims listed below, published to
`4582fbbee28a16589154f7e36f1ee3c5`.

Everything after `Verify` — *What the backend should do later* and *What the app should not assume* —
is background for the humans. **Do not act on it.** Do not change geo-chat, the publisher, the web
app, or any other debate.

If anything does not match what this file says — a claim is missing, a relation entity id does not
resolve, the property data type is not `Integer`, a relation entity already holds values — **stop and
report it** rather than adapting. The ids here were read from the live graph on 2026-09-15; a
mismatch means something changed, and guessing would write wrong timecodes onto real claims.

---

## Constants

| Thing | Value |
|---|---|
| Debate space — **all 13 offset values go here** | `4582fbbee28a16589154f7e36f1ee3c5` (US Politics) |
| `Start offset` property (exists already, Integer) | `a1d1cb557b184238ba0ec78ba7f289fb` |
| `End offset` property (exists already, Integer) | `79a677b597f84ca8a1cf24eef7837b61` |
| Debate entity | `01a0a60772dc7cb09bf6ebba15e97b67` |
| Transcript entity | `6eceb1dbfefd41ff849b41ab238ae136` |

---

## No new properties needed

`Start offset` and `End offset` already exist in the **Geo** ontology space
(`a19c345ab9866679b001d7d2138d88a1`), both typed `Integer`. Use them — do not mint new ones.

They are the right properties, not merely available ones:

- They belong to the **`Selector`** type (`813ca865db9b486490dec6764febaab3`), whose properties are
  `Start offset`, `End offset`, `Version ID` and `Target property`, and which the graph already uses
  as a **relation entity type** on `Reply to`. "Offsets on a relation entity that points at a span"
  is the existing idiom, and it is exactly the shape below.
- They are also published in the **Podcasts** space (`b5a31f8182b042437ede0f84ee02f104`), so media
  timecodes are an intended use, not a reinterpretation.
- **Zero values exist for either property anywhere in the graph.** Nothing can break, and there is no
  established unit convention to contradict.

Two wrinkles to know about:

1. **Unit is not declared anywhere**, so being the first writer sets the convention. This publish
   writes **integer milliseconds from the start of the debate timeline** — the same origin the
   player's scrubber and `turn_durations_ms` use. Record that in the app's constants and in the
   geo-chat hand-off, because the value itself does not say it. (A reusable `Millisecond` unit
   entity would be the durable fix; none exists today and this does not block on one.)
2. **The data type is declared twice.** The Geo space says `Integer`; the Podcasts space published a
   second `Data type → Float` relation on the same entities. The API resolves `Integer` today. Write
   integers. Worth cleaning up separately.

## Write the offsets onto the relation entities

Each relation entity gets **two values and two relations**.

The values go on **the relation entity of the transcript-block → claim relation** — not the claim,
and not the block. A relation carries its own entity id (`Relation.entityId` in the API), distinct
from the relation id, and it currently holds nothing. That is the right home: the same claim can be
stated in two different blocks, and each statement has its own timecode.

The two relations type that entity as a `Selector` and name what the offsets index, so "these
integers are milliseconds into the debate's video" is answerable from the data rather than from this
document:

| Relation | Type id | Target |
|---|---|---|
| `Types` → `Selector` | `8f151ba4de204e3c9cb499ddf96f48f1` | `813ca865db9b486490dec6764febaab3` |
| `Target property` → `Debate videos` | `e1788cdf9bae42e987b0d9791de09b31` | `c48dc314fa7148aeb967139160456f1d` |

`Selector` is the type these two offset properties belong to, and the graph already uses it this way
— as the relation entity type on `Reply to`, anchoring a reply to a span of its target. This is the
same pattern with a video instead of a text property. `Version ID`, the type's fourth property, is
deliberately left unset: there is no meaningful version to pin here.

```ts
import { Ops } from '@geoprotocol/geo-sdk/lite';

const TYPES_PROPERTY = '8f151ba4de204e3c9cb499ddf96f48f1';
const SELECTOR_TYPE = '813ca865db9b486490dec6764febaab3';
const TARGET_PROPERTY = 'e1788cdf9bae42e987b0d9791de09b31';
const DEBATE_VIDEOS_PROPERTY = 'c48dc314fa7148aeb967139160456f1d';

const WRITES = [/* the JSON below */];

const ops = WRITES.flatMap(write => [
  // the two timecodes
  ...Ops.entities.update({
    id: write.entityId,
    values: write.values.map(value => ({
      property: value.property,
      type: 'integer' as const,
      value: value.value,
    })),
  }).ops,
  // this relation entity is a Selector
  ...Ops.relations.create({
    fromEntity: write.entityId,
    type: TYPES_PROPERTY,
    toEntity: SELECTOR_TYPE,
  }).ops,
  // ...whose offsets index the debate's video
  ...Ops.relations.create({
    fromEntity: write.entityId,
    type: TARGET_PROPERTY,
    toEntity: DEBATE_VIDEOS_PROPERTY,
  }).ops,
]);
```

That is 26 values and 26 relations across the 13 claims. Publish `ops` to space
`4582fbbee28a16589154f7e36f1ee3c5`. One proposal for all of it is fine.

This space is not optional. Values and relations are both space-scoped, and the app reads these
through a traversal already filtered to the debate's own space — anything published elsewhere is
invisible to it.

### The writes

| # | Relation entity id (write here) | start_ms | end_ms | Claim | How |
|---|---|---:|---:|---|---|
| 1 | `5cb095eaea774cb4ae308f4e3cc5cd2f` | 16680 | 21900 | Donald Trump is leveraging powers that have always existed within the U.S. government | matched |
| 2 | `93daa306d82e4ca5a458472bad063c8a` | 22480 | 31440 | The use of presidential executive orders has been an accelerating trend through many administrations prior to Donald Trump's | hand-checked |
| 3 | `f592a866a110475ab6804b3809b39b7c` | 40000 | 47800 | The United States is more of an oligarchy or a corporate-run government than an authoritarian state | matched |
| 4 | `a0e6129c4f0b4345ae3f692b2f199258` | 47800 | 56400 | Corporate lobbying of the U.S. government is a significant source of political issues | hand-checked |
| 5 | `a6da668a90d046868a41874c78a0c2a2` | 72640 | 84610 | The founding fathers of the United States intended to create a limited presidency with checks and balances | matched |
| 6 | `1fb00d7af22e44bbb7063a2941b9290b` | 101440 | 106520 | Policies established by a president's executive orders can be undone by a subsequent president's new executive orders | matched |
| 7 | `af6303b57b764352bb6425b70ee68352` | 110360 | 118160 | Achieving lasting political change requires passing legislation through Congress rather than relying on executive orders | hand-checked |
| 8 | `6bb34f0d87294b38b64c736909ef079c` | 134600 | 143140 | The Supreme Court is no longer providing sufficient checks on executive power | matched |
| 9 | `2ee88e8e840b43328f06774fc799590b` | 140960 | 150520 | Executive branches of the government are sidestepping the powers of Congress by suing companies directly | matched |
| 10 | `7deb967ca61e480fbb80847a83b5571a` | 150520 | 160640 | The SEC under Gary Gensler has taken action against the crypto industry, resulting in legal battles | matched |
| 11 | `77cfa2f31c854ff9bf12fa3f9ac4e29d` | 176760 | 187320 | The increasing use of executive orders by presidents is establishing a more authoritarian form of government in the U.S. | matched |
| 12 | `d259997fca4349dab0cf164860ab866b` | 195880 | 206280 | Donald Trump's second term is making America more authoritarian, amplifying a trend from his first term | matched |
| 13 | `755f5690d3f1403680af9c94d5642e1a` | 263730 | 270000 | American voters can elect a new Congress to serve as a check and balance on presidential power | hand-checked |

```json
[
  { "entityId": "5cb095eaea774cb4ae308f4e3cc5cd2f", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 16680 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 21900 }] },
  { "entityId": "93daa306d82e4ca5a458472bad063c8a", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 22480 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 31440 }] },
  { "entityId": "f592a866a110475ab6804b3809b39b7c", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 40000 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 47800 }] },
  { "entityId": "a0e6129c4f0b4345ae3f692b2f199258", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 47800 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 56400 }] },
  { "entityId": "a6da668a90d046868a41874c78a0c2a2", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 72640 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 84610 }] },
  { "entityId": "1fb00d7af22e44bbb7063a2941b9290b", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 101440 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 106520 }] },
  { "entityId": "af6303b57b764352bb6425b70ee68352", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 110360 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 118160 }] },
  { "entityId": "6bb34f0d87294b38b64c736909ef079c", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 134600 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 143140 }] },
  { "entityId": "2ee88e8e840b43328f06774fc799590b", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 140960 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 150520 }] },
  { "entityId": "7deb967ca61e480fbb80847a83b5571a", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 150520 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 160640 }] },
  { "entityId": "77cfa2f31c854ff9bf12fa3f9ac4e29d", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 176760 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 187320 }] },
  { "entityId": "d259997fca4349dab0cf164860ab866b", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 195880 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 206280 }] },
  { "entityId": "755f5690d3f1403680af9c94d5642e1a", "values": [
    { "property": "a1d1cb557b184238ba0ec78ba7f289fb", "type": "integer", "value": 263730 },
    { "property": "79a677b597f84ca8a1cf24eef7837b61", "type": "integer", "value": 270000 }] }
]
```

## Verify

Once indexed, this returns 13 relations, each carrying two integer values and two relations:

```graphql
query Verify {
  entity(id: "01a0a60772dc7cb09bf6ebba15e97b67") {
    transcripts: relationsList(
      filter: { typeId: { is: "c504c7d5c3374016a5f083e4b5a92911" }, spaceId: { is: "4582fbbee28a16589154f7e36f1ee3c5" } }
    ) {
      toEntity {
        blocks: relationsList(
          filter: { typeId: { is: "beaba5cba67741a8b35377030613fc70" }, spaceId: { is: "4582fbbee28a16589154f7e36f1ee3c5" } }
        ) {
          toEntity {
            claims: relationsList(
              filter: { typeId: { is: "e614cce1c4ce45868304fd1237119eb2" }, spaceId: { is: "4582fbbee28a16589154f7e36f1ee3c5" } }
            ) {
              entityId
              entity {
                valuesList { propertyId integer }
                relationsList(filter: { spaceId: { is: "4582fbbee28a16589154f7e36f1ee3c5" } }) {
                  type { name }
                  toEntity { id name }
                }
              }
              toEntity { name }
            }
          }
        }
      }
    }
  }
}
```

Sanity checks: every `start_ms` < its `end_ms`; every value between 0 and 270000 (the debate is
4m30s); every relation entity carries `Types → Selector` and `Target property → Debate videos`; and
the 13 claims in ascending `start_ms` order should read as a coherent argument — Trump's powers,
executive orders, oligarchy, lobbying (speaker 1), then founding fathers, executive orders undone,
legislation through Congress (speaker 2), and so on.

---

## What the backend should do later

> Background, not instructions. Nothing below is part of the publish above.

This file publishes offsets for one debate by hand. The durable version:

1. `GET /debates/{id}/claims` gains `start_ms` and `end_ms` per extracted claim. The extractor
   knows which transcript span it extracted each claim from, so it can report the span exactly
   rather than having it recovered by text matching afterwards.
2. `decodeExtractedClaims` in `apps/web/core/debates/server/extracted-claims.ts` carries them onto
   `DebateClaimInput`.
3. `debate-publish-draft.ts` writes them onto the block → claim relation entity it already creates,
   using `Start offset` and `End offset`, in integer milliseconds — and types that entity
   `Types → Selector` with `Target property → Debate videos`, as this publish does. The relation and
   its entity are minted in the same `relate()` call, so this is a small change there rather than a
   second pass.
4. Optionally, a backfill sweep over already-published debates using the same matcher.

Until then the app falls back to matching client-side, so the UI works on every debate either way.

## What the app should not assume

> Background, not instructions. This is for whoever builds the UI.

Two things this investigation turned up, both of which the UI has to handle:

- **Relation `position` is not transcript order.** `debate-publish-draft.ts` assigns every relation
  `Position.generate()`, which is random, not monotonic. On this debate the blocks in position order
  are the 3rd, 1st, 6th, 4th, 5th and 2nd turns. Order blocks by their timecodes (or by matching
  block text against the transcript), never by position.
- **Blocks with empty text are filtered out at publish**, so block count can be less than turn count
  and block index does not map to turn index.
