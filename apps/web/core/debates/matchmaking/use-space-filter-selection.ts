'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

/**
 * Seeds the space filter with the spaces the viewer belongs to, once (GEO-2789).
 *
 * Written once rather than per surface so the debates side panel and the debate-again flow can't
 * drift: they ask the same question of the same viewer and should answer it the same way. It seeds
 * rather than owning the selection because the two surfaces need it at different points — the hub
 * can seed as soon as its eligible set settles, while the picker's menu accumulates as rows arrive
 * and only means something once its facets have landed.
 *
 * ## When the default applies
 *
 * At most once per mount, on the first render where the viewer's spaces are known and there is
 * something on the menu to draw from. Callers must therefore report loading through `pending`
 * honestly — including whether their *options* have finished arriving, not only their gates —
 * because the seed is spent the moment it fires and a half-built menu spends it badly.
 *
 * A settled-empty menu does not spend it. That is deliberate rather than an oversight of the
 * "once per mount" rule: a surface opened before any claim exists has nothing to default *to*, and
 * consuming the seed there would deny the viewer the default for the whole visit on the strength
 * of a list that was empty for a moment. If options appear later the seed applies then, which is
 * the first point at which it could mean anything. Nothing can override a viewer who has acted —
 * that is what the returned marker is for — so late is the only risk, and never is the worse one.
 *
 * The selection is not persisted, which is what it already was: both surfaces started from an
 * empty selection on every mount and still do. So "first open" means this visit — a viewer who
 * narrows or widens the filter keeps that while the surface is up, and starts fresh next time.
 *
 * That also disposes of the case a persisted default would have to answer: a viewer who
 * deliberately unticks everything is asking for the unfiltered list, and nothing here later decides
 * they meant otherwise. The seed fires once and never again, even if their memberships change under
 * it.
 *
 * ## Losing the right to seed
 *
 * The menus are live before this settles — the picker's options accumulate from rows as they
 * arrive — so a viewer can pick a space, or clear the filter, before the seed is ready. Seeding
 * over that would make this a policy rather than a default, so callers report the interaction
 * through the returned marker and the seed is forfeited. Clearing counts: an empty selection the
 * viewer asked for means the unfiltered list, and is not an invitation to fill it in for them.
 *
 * ## The fallback
 *
 * A viewer who belongs to none of the spaces on offer — including every signed-out one, who belongs
 * to nothing at all — keeps the empty selection this filter already reads as "any space". They see
 * everything, which is what they saw before this existed, rather than an empty list filtered by a
 * membership they do not have.
 */
export function useMemberSpaceDefault({
  memberSpaceIds,
  availableSpaceIds,
  pending,
  onSeed,
}: {
  /** The spaces the viewer is a member or editor of. Null until it is known. */
  memberSpaceIds: ReadonlySet<string> | null;
  /** The spaces this surface is actually offering. */
  availableSpaceIds: string[];
  /** Whether those options are still resolving. */
  pending: boolean;
  /** Called at most once, and only with a non-empty selection. */
  onSeed: (spaceIds: string[]) => void;
}): () => void {
  const seededRef = React.useRef(false);
  // Held in a ref so a caller passing an inline function doesn't re-arm the effect on every render.
  const onSeedRef = React.useRef(onSeed);
  onSeedRef.current = onSeed;

  React.useEffect(() => {
    if (seededRef.current || pending || memberSpaceIds === null) return;
    // An empty menu is not an answer about the viewer, settled or not — see the note above on why
    // this holds the seed rather than spending it.
    if (availableSpaceIds.length === 0) return;

    seededRef.current = true;

    // Both sides through `normId`, not just the ids being tested. The two sets arrive by different
    // routes and neither promises a shape, so normalizing only one leaves an implicit contract that
    // a mismatch would break silently — and a mismatch here looks exactly like a viewer who belongs
    // to nothing, which is the case that quietly falls back to showing everything.
    const mine = new Set([...memberSpaceIds].map(normId));
    const seeded = availableSpaceIds.filter(id => mine.has(normId(id)));
    if (seeded.length > 0) onSeedRef.current(seeded);
  }, [availableSpaceIds, memberSpaceIds, pending]);

  // Marks the seed as spent without applying it. A ref rather than state: this must take effect
  // for the effect above on the very same tick the viewer acts, and re-rendering to record it
  // would leave a window where their pick is already made and the seed still armed.
  return React.useCallback(() => {
    seededRef.current = true;
  }, []);
}
