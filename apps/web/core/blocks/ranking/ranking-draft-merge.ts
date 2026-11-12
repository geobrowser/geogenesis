import { ID } from '~/core/id';

/*
 * A local copy of #3102's (GEO-3680) `mergeBallotOrders` and `sameBallotOrder` from
 * `ranking-publish-queue.ts`, same names, signature and behaviour. When #3102 lands in this stack,
 * import them from there and delete this file.
 */

const norm = (id: string) => ID.uuidToHex(id);

export function sameBallotOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => norm(id) === norm(b[index]));
}

export type BallotMergeResult = {
  ids: string[];
  /** Both sides reordered shared items; this device's order was kept. */
  overrodeTheirOrder: boolean;
};

/**
 * Three-way merge of ordered ballots.
 *
 * - `base`: the published list this device's edit was made from.
 * - `ours`: the list this edit wants to publish.
 * - `theirs`: the list published now.
 *
 * Membership: base, plus what either side added, minus what either side removed. Order: an edit
 * that didn't reorder the base items it kept leaves the published order alone, and its own additions
 * go next to their neighbours from `ours`. Only when this edit did reorder does its order win.
 */
export function mergeBallotOrders({
  base,
  ours,
  theirs,
}: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
}): BallotMergeResult {
  const baseSet = new Set(base.map(norm));
  const ourSet = new Set(ours.map(norm));
  const theirSet = new Set(theirs.map(norm));

  const keep = (id: string) => {
    const key = norm(id);
    return baseSet.has(key) ? ourSet.has(key) && theirSet.has(key) : ourSet.has(key) || theirSet.has(key);
  };
  const reordered = (list: readonly string[], listSet: Set<string>) =>
    !sameBallotOrder(
      list.filter(id => baseSet.has(norm(id))),
      base.filter(id => listSet.has(norm(id)))
    );

  const weReordered = reordered(ours, ourSet);
  const theyReordered = reordered(theirs, theirSet);
  const [primary, secondary] = weReordered ? [ours, theirs] : [theirs, ours];
  const secondarySet = weReordered ? theirSet : ourSet;

  const result: string[] = [];
  const inResult = new Set<string>();
  for (const id of primary) {
    if (keep(id) && !inResult.has(norm(id))) {
      result.push(id);
      inResult.add(norm(id));
    }
  }

  for (let index = 0; index < secondary.length; index++) {
    const id = secondary[index];
    if (!keep(id) || inResult.has(norm(id))) continue;

    const resultKeys = result.map(norm);
    let insertAt = -1;
    for (let back = index - 1; back >= 0 && insertAt === -1; back--) {
      const at = resultKeys.indexOf(norm(secondary[back]));
      if (at !== -1) {
        insertAt = at + 1;
        while (
          insertAt < resultKeys.length &&
          !baseSet.has(resultKeys[insertAt]) &&
          !secondarySet.has(resultKeys[insertAt])
        ) {
          insertAt += 1;
        }
      }
    }
    for (let ahead = index + 1; ahead < secondary.length && insertAt === -1; ahead++) {
      const at = resultKeys.indexOf(norm(secondary[ahead]));
      if (at !== -1) insertAt = at;
    }
    if (insertAt === -1) insertAt = result.length;
    result.splice(insertAt, 0, id);
    inResult.add(norm(id));
  }

  return { ids: result, overrodeTheirOrder: weReordered && theyReordered };
}
