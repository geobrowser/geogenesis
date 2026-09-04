import { describe, expect, it } from 'vitest';

import type { BrowseSidebarData, BrowseSpaceRow } from '~/core/browse/fetch-browse-sidebar-data';
import { normId } from '~/core/utils/norm-id';

import {
  browseSidebarClaimSpaceAllowlist,
  browseSidebarMemberSpaceIds,
  buildClaimSpaceAllowlist,
  buildMemberSpaceIds,
  isClaimSpaceAllowed,
} from './claim-space-allowlist';

function row(id: string, overrides: Partial<BrowseSpaceRow> = {}): BrowseSpaceRow {
  return { id, name: id, image: null, ...overrides };
}

const FEATURED = '019fedae-72b6-7ab2-927a-df044d57c566';
const EDITOR = '019fedae-72b6-7ab2-927a-df044d57c567';
const MEMBER = '019fedae-72b6-7ab2-927a-df044d57c568';
const PENDING = '019fedae-72b6-7ab2-927a-df044d57c569';
const PERSONAL = '019fedae-72b6-7ab2-927a-df044d57c570';
const STRANGER = '019fedae-72b6-7ab2-927a-df044d57c571';

describe('buildClaimSpaceAllowlist', () => {
  it('covers featured spaces and the spaces the viewer belongs to', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      personalSpaceId: PERSONAL,
    });

    for (const id of [FEATURED, EDITOR, MEMBER, PERSONAL]) {
      expect(isClaimSpaceAllowed(id, allowlist)).toBe(true);
    }
    expect(isClaimSpaceAllowed(STRANGER, allowlist)).toBe(false);
  });

  // Requested counts as theirs, which is a wider line than `useGlobalSearchSpaceIds` draws off the
  // same lists. Sign-up collects the viewer's spaces before any approval exists,
  // so a new account has nothing else for its first few minutes — and excluding these left it
  // looking at a panel with none of the spaces it had just chosen, which then filled in on its own
  // once the approvals landed.
  it('covers spaces whose membership or editorship is only requested', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [],
      editorOf: [row(PENDING, { pendingLabel: 'Editorship pending' })],
      memberOf: [row(MEMBER, { pendingLabel: 'Membership pending' })],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(PENDING, allowlist)).toBe(true);
    expect(isClaimSpaceAllowed(MEMBER, allowlist)).toBe(true);
  });

  // Featured ids arrive UUID-formatted and claim rows carry canonical hex, so a raw comparison
  // would silently allow nothing.
  it('compares ids regardless of hyphens or case', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED.toUpperCase())],
      editorOf: [],
      memberOf: [],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(FEATURED.replace(/-/g, ''), allowlist)).toBe(true);
  });

  it('allows a signed-out viewer the featured spaces and nothing else', () => {
    const allowlist = buildClaimSpaceAllowlist({
      featured: [row(FEATURED)],
      editorOf: [],
      memberOf: [],
      personalSpaceId: null,
    });

    expect(isClaimSpaceAllowed(FEATURED, allowlist)).toBe(true);
    expect(isClaimSpaceAllowed(STRANGER, allowlist)).toBe(false);
  });
});

describe('browseSidebarClaimSpaceAllowlist', () => {
  // The sidebar subtracts the viewer's own spaces from `featured`, so only the union of all three
  // lists is the full set.
  it('unions the sidebar sections and falls back to the sidebar personal space', () => {
    const data: BrowseSidebarData = {
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      documentationImage: null,
      personalSpaceId: PERSONAL,
    };

    const allowlist = browseSidebarClaimSpaceAllowlist(data, null);

    for (const id of [FEATURED, EDITOR, MEMBER, PERSONAL]) {
      expect(isClaimSpaceAllowed(id, allowlist)).toBe(true);
    }
  });
});

describe('isClaimSpaceAllowed', () => {
  // Null means the sources haven't resolved, not that nothing is allowed.
  it('passes everything while the allowlist is unresolved', () => {
    expect(isClaimSpaceAllowed(STRANGER, null)).toBe(true);
    expect(isClaimSpaceAllowed(null, null)).toBe(true);
  });

  // A claim the picker can't attribute to a space has no space to check, and acting on it would
  // publish a response against the wrong one.
  it('rejects a claim with no home space once the allowlist is known', () => {
    expect(isClaimSpaceAllowed(null, new Set([FEATURED]))).toBe(false);
    expect(isClaimSpaceAllowed('', new Set([FEATURED]))).toBe(false);
  });
});

// GEO-2789. The space filter defaults to what the viewer belongs to, which is the allowlist minus
// the part of it that is on offer to everybody.
describe('buildMemberSpaceIds', () => {
  it('covers the spaces the viewer belongs to, and their own', () => {
    const mine = buildMemberSpaceIds({
      editorOf: [row(EDITOR)],
      memberOf: [row(MEMBER)],
      personalSpaceId: PERSONAL,
    });

    expect([...mine].sort()).toEqual([EDITOR, MEMBER, PERSONAL].map(normId).sort());
  });

  // The difference from the allowlist, and the whole point of a second function: a featured space
  // is one the viewer may browse, not one that is theirs, so defaulting the filter to it would
  // answer a question about them with a list about everyone.
  it('leaves out featured spaces, which the allowlist includes', () => {
    const data = {
      featured: [row(FEATURED)],
      editorOf: [row(EDITOR)],
      memberOf: [],
      personalSpaceId: PERSONAL,
    } as unknown as BrowseSidebarData;

    expect(browseSidebarClaimSpaceAllowlist(data, PERSONAL).has(normId(FEATURED))).toBe(true);
    expect(browseSidebarMemberSpaceIds(data, PERSONAL).has(normId(FEATURED))).toBe(false);
    expect(browseSidebarMemberSpaceIds(data, PERSONAL).has(normId(EDITOR))).toBe(true);
  });

  // The default has to reach them for the same reason the allowlist does: a new account's spaces
  // are all pending at once, and a default that skipped them would open on everything for exactly
  // the viewers it exists for.
  it('counts spaces the viewer has asked to join', () => {
    const mine = buildMemberSpaceIds({
      editorOf: [],
      memberOf: [row(MEMBER), row(PENDING, { pendingLabel: 'Membership pending' })],
      personalSpaceId: null,
    });

    expect(mine.has(normId(PENDING))).toBe(true);
    expect(mine.has(normId(MEMBER))).toBe(true);
  });

  it('is empty for a viewer who belongs to nothing, which is the fallback case', () => {
    expect(buildMemberSpaceIds({ editorOf: [], memberOf: [], personalSpaceId: null }).size).toBe(0);
  });
});
