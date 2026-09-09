'use client';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import { keepSelectedVisible, orderFacetOptions, toggleId } from './topic-facets';

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
 * At most once while the marker is armed, on the first render where the viewer's spaces are known
 * and there is something on the menu to draw from. For an uncontrolled caller that is once per
 * mount; a caller passing `spent` can re-arm it without remounting, which is what an account
 * changing under an open surface needs — see "How long once lasts" below. Callers must therefore
 * report loading through `pending` honestly — including whether their *options* have finished
 * arriving, not only their gates — because the seed is spent the moment it fires and a half-built
 * menu spends it badly.
 *
 * Spent on a match rather than on an attempt, which covers two cases that look different and are
 * the same. A settled-empty menu has nothing to default *to*; a menu of spaces the viewer belongs
 * to none of has nothing to default *with*. Neither is an answer about the viewer, and consuming
 * the seed on either denies them the default for the whole visit on the strength of a list that
 * was never about them. The second is the ordinary case rather than an edge: the picker opens on
 * Recommended whenever there is anything to recommend, and that is a curator's page whose spaces
 * say nothing about who is looking.
 *
 * If a menu that can answer appears later, the seed applies then, which is the first point at which
 * it could mean anything. Nothing can override a viewer who has acted — that is what the returned
 * marker is for — so late is the only risk, and never is the worse one.
 *
 * ## How long "once" lasts
 *
 * This hook does not own the selection, so it does not decide how long the answer survives — the
 * caller does, through `spent`. There are two kinds of caller, and they want different lifetimes.
 *
 * A caller that omits `spent` keeps the original arrangement: the selection starts empty on every
 * mount and the seed is spent once per mount, so "first open" means this visit and a viewer who
 * narrows or widens the filter keeps that only while the surface is up. The rematch page and the
 * explore feed are both this.
 *
 * A caller that passes `spent` holds the marker somewhere the mount cannot take with it, because
 * its selection outlives the mount too — the debates hub since GEO-2850, where closing the panel no
 * longer discards the filter bar. For those, "once" means once a session, and the marker has to
 * travel with the selection or reopening the surface would seed straight over it.
 *
 * Either way the rule below is the same, and it is what both lifetimes exist to protect: a viewer
 * who deliberately unticks everything is asking for the unfiltered list, and nothing here later
 * decides they meant otherwise. That case is indistinguishable from an untouched filter by the
 * selection alone — both are empty — which is exactly why the marker is what carries it and why a
 * caller must never infer one from the other.
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
/**
 * Which of the offered spaces are the viewer's — the selection the default would apply.
 *
 * Both sides through `normId`, not just the ids being tested. The two sets arrive by different
 * routes and neither promises a shape, so normalizing only one leaves an implicit contract that a
 * mismatch would break silently — and a mismatch here looks exactly like a viewer who belongs to
 * nothing, which is the case that quietly falls back to showing everything.
 *
 * Exported because a surface whose options are a server prop knows both sides on its very first
 * render, and can seed its state directly rather than waiting for the effect below — which would
 * otherwise fire one unfiltered request before the narrowed one and show the wide feed in between.
 * The effect stays for the surfaces whose options arrive from a query.
 */
export function memberSpaceSelection(
  availableSpaceIds: string[],
  memberSpaceIds: ReadonlySet<string> | null
): string[] {
  if (memberSpaceIds === null) return [];
  const mine = new Set([...memberSpaceIds].map(normId));
  return availableSpaceIds.filter(id => mine.has(normId(id)));
}

export function useMemberSpaceDefault({
  memberSpaceIds,
  availableSpaceIds,
  pending,
  spent,
  onSeed,
  onSpend,
}: {
  /** The spaces the viewer is a member or editor of. Null until it is known. */
  memberSpaceIds: ReadonlySet<string> | null;
  /** The spaces this surface is actually offering. */
  availableSpaceIds: string[];
  /** Whether those options are still resolving. */
  pending: boolean;
  /**
   * Whether the seed has already been applied or forfeited, from a store that outlives this mount.
   *
   * Omitted is *not* the same as `false`. Undefined leaves the marker uncontrolled and spent per
   * mount, which is the right lifetime whenever the selection dies with the mount too — the
   * rematch page and the explore feed. A caller whose selection outlives its mount — the hub's
   * tabs since GEO-2850 — passes it, and then owns the marker in both directions: `true` starts
   * spent, so reopening the surface cannot re-seed a filter the viewer deliberately cleared, and
   * flipping back to `false` re-arms a seed on a surface that never unmounted, which is what an
   * account changing under an open panel needs.
   */
  spent?: boolean;
  /** Called at most once, and only with a non-empty selection. */
  onSeed: (spaceIds: string[]) => void;
  /** Called when the seed is spent, either way, so a caller holding {@link spent} can record it. */
  onSpend?: () => void;
}): () => void {
  const seededRef = React.useRef(spent === true);
  const onSpendRef = React.useRef(onSpend);
  onSpendRef.current = onSpend;
  // Held in a ref so a caller passing an inline function doesn't re-arm the effect on every render.
  const onSeedRef = React.useRef(onSeed);
  onSeedRef.current = onSeed;

  React.useEffect(() => {
    // Only a controlled caller can re-arm; `undefined` means the marker is this mount's alone, and
    // treating it as `false` would re-arm the uncontrolled callers on every run of this effect.
    if (spent === false) seededRef.current = false;
    if (seededRef.current || pending || memberSpaceIds === null) return;
    // An empty menu is not an answer about the viewer, settled or not — see the note above on why
    // this holds the seed rather than spending it.
    if (availableSpaceIds.length === 0) return;

    const seeded = memberSpaceSelection(availableSpaceIds, memberSpaceIds);

    // Spent on a match, not on an attempt. A menu with options the viewer belongs to none of is no
    // more an answer about them than an empty one is, and the surfaces open on exactly such a menu
    // in the ordinary case: the picker starts on Recommended whenever there is anything to
    // recommend, and that is a curator's page, whose spaces say nothing about who is looking. Spent
    // there, the seed was gone by the time the viewer reached the list it was written for.
    //
    // The cost of the other direction is a seed that stays armed all visit for a viewer who matches
    // nothing — which costs nothing, since it can only ever fire on a match, and a viewer who acts
    // forfeits it through the marker below either way.
    if (seeded.length === 0) return;

    seededRef.current = true;
    onSpendRef.current?.();
    onSeedRef.current(seeded);
  }, [availableSpaceIds, memberSpaceIds, pending, spent]);

  // Marks the seed as spent without applying it. A ref rather than state: this must take effect
  // for the effect above on the very same tick the viewer acts, and re-rendering to record it
  // would leave a window where their pick is already made and the seed still armed.
  return React.useCallback(() => {
    seededRef.current = true;
    onSpendRef.current?.();
  }, []);
}

/** One menu row, in the shape both surfaces already build and `SpaceTopicFilters` already reads. */
type SpaceFacetOption = { id: string; name: string | null; count: number };

/**
 * The space filter menu: what it offers, and what pressing it does.
 *
 * {@link useMemberSpaceDefault} is the rule; this is the wiring around it, and it is here because
 * the wiring was the part that duplicated. Both surfaces derived the same option ids, folded the
 * selection back in the same way, and then had to remember to forfeit the default at *three* call
 * sites each — two menu handlers and a "Clear filters" action. Forgetting one of the six is silent
 * and turns the default into a policy: the viewer picks a space, the seed lands on top of them.
 *
 * So the handlers come from here already carrying it, and there is nothing left to remember.
 *
 * The selection itself stays with the caller. Both surfaces reconcile it against gates only they
 * know about — a space that stops being publishable, one the allowlist drops — so ownership here
 * would mean a second setter racing those effects for the same state.
 *
 * `offeredSpaces` is deliberately the caller's own list rather than something derived here: the hub
 * counts a server facet and the picker falls back to counting the rows on screen, and both then
 * apply gates that are theirs. What the two agree on is everything after that.
 */
export function useSpaceFilterMenu({
  offeredSpaces,
  spaceIds,
  setSpaceIds,
  memberSpaceIds,
  pending,
  seedSpent,
  onSeedSpend,
}: {
  /** What this surface is offering, already gated. */
  offeredSpaces: SpaceFacetOption[];
  spaceIds: string[];
  setSpaceIds: (spaceIds: string[]) => void;
  memberSpaceIds: ReadonlySet<string> | null;
  /** Whether those options are still resolving — see {@link useMemberSpaceDefault}. */
  pending: boolean;
  /** Passed straight through as {@link useMemberSpaceDefault}'s `spent`. */
  seedSpent?: boolean;
  /** Passed straight through as {@link useMemberSpaceDefault}'s `onSpend`. */
  onSeedSpend?: () => void;
}): {
  /** Ordered, with the viewer's selection kept visible even where the count dropped it. */
  facetSpaces: SpaceFacetOption[];
  onSpaceToggle: (spaceId: string) => void;
  onSpacesClear: () => void;
} {
  const offeredSpaceIds = React.useMemo(() => offeredSpaces.map(space => space.id), [offeredSpaces]);

  // Read through a ref so the handlers below keep one identity for the life of the surface. They
  // are passed to a memoized filter bar, and an identity that changed with the selection would
  // re-render the menu on every tick.
  const spaceIdsRef = React.useRef(spaceIds);
  spaceIdsRef.current = spaceIds;

  const markChosen = useMemberSpaceDefault({
    memberSpaceIds,
    availableSpaceIds: offeredSpaceIds,
    pending,
    spent: seedSpent,
    onSpend: onSeedSpend,
    // A seed the selection already holds is not worth a render. A surface whose options are a
    // server prop applies the default in its own initial state — see `memberSpaceSelection` — and
    // the effect then arrives at the same answer a beat later.
    onSeed: next => {
      const current = spaceIdsRef.current;
      if (current.length === next.length && next.every((id, index) => current[index] === id)) return;
      setSpaceIds(next);
    },
  });

  // An absent *selection* comes back at zero, or its checkbox disappears while the trigger goes on
  // counting it, and it cannot be unticked without clearing every space.
  const facetSpaces = React.useMemo(
    () => orderFacetOptions(keepSelectedVisible(offeredSpaces, spaceIds), spaceIds),
    [offeredSpaces, spaceIds]
  );

  const onSpaceToggle = React.useCallback(
    (spaceId: string) => {
      markChosen();
      setSpaceIds(toggleId(spaceIdsRef.current, spaceId));
    },
    [markChosen, setSpaceIds]
  );

  const onSpacesClear = React.useCallback(() => {
    markChosen();
    setSpaceIds([]);
  }, [markChosen, setSpaceIds]);

  return { facetSpaces, onSpaceToggle, onSpacesClear };
}
