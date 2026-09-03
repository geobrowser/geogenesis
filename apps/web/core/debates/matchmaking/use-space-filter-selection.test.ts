import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useMemberSpaceDefault } from './use-space-filter-selection';

const A = '019fedae-72b6-7ab2-927a-df044d57c566';
const B = '019fedae-72b6-7ab2-927a-df044d57c567';
const STRANGER = '019fedae-72b6-7ab2-927a-df044d57c568';

type Props = {
  memberSpaceIds: ReadonlySet<string> | null;
  availableSpaceIds: string[];
  pending: boolean;
};

function seed(initial: Props) {
  const onSeed = vi.fn();
  const view = renderHook((props: Props) => useMemberSpaceDefault({ ...props, onSeed }), { initialProps: initial });
  return { ...view, onSeed, markChosen: () => view.result.current() };
}

describe('useMemberSpaceDefault', () => {
  it('selects the spaces the viewer belongs to that are on offer', () => {
    const { onSeed } = seed({
      memberSpaceIds: new Set([A, STRANGER]),
      availableSpaceIds: [A, B],
      pending: false,
    });

    // Not `STRANGER`: theirs, but not something this surface offers.
    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });

  // The fallback. An empty selection is what this filter reads as "any space", so they see
  // everything rather than an empty list filtered by a membership they do not have.
  it('leaves the selection alone for a viewer who belongs to none of them', () => {
    const { onSeed } = seed({ memberSpaceIds: new Set([STRANGER]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();
  });

  // The case the two above are the halves of, and the one that matters in practice. Both surfaces
  // open on a menu that need not be about the viewer at all — the picker starts on Recommended
  // whenever there is anything to recommend, and that is a curator's page. Spending the seed there
  // meant the viewer reached the list it was written for with the default already gone.
  it('keeps the seed through a menu the viewer belongs to none of, not just an empty one', () => {
    const { rerender, onSeed } = seed({
      memberSpaceIds: new Set([A]),
      availableSpaceIds: [STRANGER],
      pending: false,
    });
    expect(onSeed).not.toHaveBeenCalled();

    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });

  it('still gives the seed up if the viewer acts before a menu it can answer arrives', () => {
    // The guard on the case above: holding the seed longer must not let it overrule a choice the
    // viewer has already made.
    const { rerender, onSeed, markChosen } = seed({
      memberSpaceIds: new Set([A]),
      availableSpaceIds: [STRANGER],
      pending: false,
    });

    markChosen();
    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();
  });

  it('leaves the selection alone when the viewer belongs to nothing at all, as signed out', () => {
    const { onSeed } = seed({ memberSpaceIds: new Set(), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();
  });

  // Null is "not known yet", which is a different answer from "nothing", and seeding on it would
  // spend the one seed this gets and land every viewer on the fallback.
  it('waits for the viewer spaces to be known rather than treating unknown as none', () => {
    const { rerender, onSeed } = seed({ memberSpaceIds: null, availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();

    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });

  it('waits for the options too, rather than seeding against a list that has not arrived', () => {
    const { rerender, onSeed } = seed({ memberSpaceIds: new Set([A]), availableSpaceIds: [], pending: true });

    expect(onSeed).not.toHaveBeenCalled();

    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [], pending: false });
    expect(onSeed).not.toHaveBeenCalled();

    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });
    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });

  // Deliberate, and the reason `pending` has to be honest: an empty menu holds the seed rather
  // than spending it, so a surface opened before any claim exists still gets its default once
  // there is something to apply it to.
  it('keeps the seed for a menu that fills in later, having had nothing to seed from', () => {
    const { rerender, onSeed } = seed({ memberSpaceIds: new Set([A]), availableSpaceIds: [], pending: false });

    expect(onSeed).not.toHaveBeenCalled();

    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });

  // The rule the ticket asked for: this is a default, not a policy. Once it has applied, a viewer's
  // own choice stands — including their choice to widen it back to everything.
  it('never seeds twice, so a later change of memberships cannot overrule the viewer', () => {
    const { rerender, onSeed } = seed({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);

    rerender({ memberSpaceIds: new Set([A, B]), availableSpaceIds: [A, B], pending: false });
    rerender({ memberSpaceIds: new Set([B]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).toHaveBeenCalledTimes(1);
  });

  // The two sets reach this by different routes, and this codebase has had id-shape mismatches
  // before. One here would look exactly like a viewer who belongs to nothing.
  it('matches across id formats', () => {
    const { onSeed } = seed({
      memberSpaceIds: new Set([A.replace(/-/g, '')]),
      availableSpaceIds: [A, B],
      pending: false,
    });

    expect(onSeed).toHaveBeenCalledExactlyOnceWith([A]);
  });
});

// The menus are live before this settles — the picker's options accumulate from rows as they
// arrive — so a viewer can act first. Seeding over that would make this a policy rather than a
// default.
describe('useMemberSpaceDefault once the viewer has acted', () => {
  it('gives up the seed when the viewer picks a space first', () => {
    const { rerender, onSeed, markChosen } = seed({
      memberSpaceIds: null,
      availableSpaceIds: [A, B],
      pending: true,
    });

    markChosen();
    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();
  });

  // Clearing counts. An empty selection the viewer asked for means the unfiltered list, and is not
  // an invitation to fill it back in for them.
  it('gives up the seed when the viewer clears the filter first', () => {
    const { rerender, onSeed, markChosen } = seed({
      memberSpaceIds: new Set([A]),
      availableSpaceIds: [],
      pending: true,
    });

    markChosen();
    rerender({ memberSpaceIds: new Set([A]), availableSpaceIds: [A, B], pending: false });

    expect(onSeed).not.toHaveBeenCalled();
  });
});
