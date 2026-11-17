# Best debates: graded ballots (GEO-3729)

A Best debates ranker grades each debate A, B or C. The grade is a label the ranker gives, stored on
their ballot. It is never worked out from a position. This page says what a ballot with grades looks
like in the graph, so an agent can publish one that the web shows with the same tiers.

## What gaia scores

Only the ballot's order. gaia's ranking indexer reads each vote's position. It never reads a grade.
The team order and Best react to a graded ballot exactly as they would to the same order placed by
hand.

## The ballot

| Piece | Value |
|---|---|
| Ranking block | `1221b258ec204608b0c33d00d6df2c21` (Best debates, Debates space `9284477c8fe746368698994e2e517b32`) |
| Ballot | one `Rank` entity per ranker, in the ranker's personal space, rank type `ORDINAL`, submitted to the block |
| Entries | `RANK_VOTES` relations (`19a4cfff45f24150abf2af0f43eb2eec`) from the Rank to each debate, in order, each with the debate's own space as `to_space` |
| Grade | a Text value of **Grade** (`72971267f0a4446ba68f54299b4c4e99`) on each entry's vote entity (the relation's `entity`): `A`, `B` or `C` |

The vote entity also carries "Vote Ordinal Value" (`49ee1b8918204e75a1ae38a2dcaad4a5`), the
position string. Write the Grade in the ranker's personal space, the same space as the ballot. The
web reads grades from that space only.

## Rules

- **Order is tier-ordered:** all A first, then B, then C. A debate with no Grade is "Ungraded" and
  goes below C. The web never publishes any other order. If an agent's ballot breaks it, the web
  shows each debate in its grade's tier. The ranker's next publish reorders the ballot to match.
- **Every publish writes every grade.** `geo.ranks.update` deletes every vote relation and vote
  entity and re-creates them. A republish that leaves out the Grade values wipes every grade.
- **D is not a grade.** D is Down rank: a downvote on the debate, which also takes it off the
  ballot.

## Writing a graded ballot with geo-sdk

```js
import { Graph, Ops } from '@geoprotocol/geo-sdk';

// `entries`: the ballot in order, [{ debateId, spaceId: <the debate's own space>, grade: 'A' | 'B' | 'C' }].
const votes = entries.map(e => ({ entityId: e.debateId, spaceId: e.spaceId }));
const { ops, voteIds } = existingRankId
  ? await geo.ranks.update({ rankId: existingRankId, rankType: 'ORDINAL', votes })
  : Ops.ranks.create({ name: 'Best debates', rankType: 'ORDINAL', blockId: BEST_DEBATES_BLOCK_ID, votes });

// voteIds[i] is the vote entity of votes[i].
const gradeOps = entries.flatMap((e, i) =>
  Graph.updateEntity({ id: voteIds[i], values: [{ property: GRADE_PROPERTY_ID, type: 'text', value: e.grade }] }).ops
);
// One edit, in the ranker's personal space: [...ops, ...gradeOps].
```

The web puts the grade in the vote's own create op, so the edit stays the same size. A separate
update op per vote, as above, works the same way.

To grade a ballot that already exists without changing it, add only the Grade values. Write
`Graph.updateEntity` on each current vote entity, with no relation ops. Preston's ballot was graded
this way on 13 Nov 2026: places 1 to 20 are A, 21 to 60 are B, and the rest are C.

## Reading it back

```graphql
relationsConnection(first: 1000, after: $cursor,
  filter: { fromEntityId: { is: $rankId }, spaceId: { is: $personalSpaceId }, typeId: { is: "19a4cfff45f24150abf2af0f43eb2eec" } }) {
  nodes { toEntityId position entity { valuesList(filter: { spaceId: { is: $personalSpaceId },
    propertyId: { in: ["49ee1b8918204e75a1ae38a2dcaad4a5", "72971267f0a4446ba68f54299b4c4e99"] } }) { propertyId text } } }
  pageInfo { hasNextPage endCursor }
}
```

Page with cursors. An unpaged list stops at 100 rows without saying so.
