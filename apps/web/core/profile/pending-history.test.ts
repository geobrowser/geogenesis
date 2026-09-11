import { describe, expect, it } from 'vitest';

import { EMPLOYMENT_PROPERTY, ROLES_PROPERTY } from './history-ontology';
import type { EmploymentCard } from './normalize-history';
import {
  NOTHING_PENDING,
  PENDING_PREFIX,
  dropPendingAddition,
  hasPendingChanges,
  isPending,
  mergePendingEmployment,
  replacePendingAddition,
  shareStintsByOrganization,
} from './pending-history';
import type { PositionDraft } from './stage-history';

const draft = (company: string, title: string, overrides: Partial<PositionDraft> = {}): PositionDraft => ({
  company: { id: `org-${company}`, name: company, isNew: false },
  title: { id: `title-${title}`, name: title, isNew: false },
  employmentType: null,
  skills: [],
  startDate: '2024-01-01Z',
  endDate: null,
  status: 'current',
  description: '',
  ...overrides,
});

const savedCard = (org: string, roles: string[]): EmploymentCard => ({
  organization: { id: `org-${org}`, name: org },
  edges: [{ relationId: `edge-${org}`, stintId: `stint-${org}` }],
  entries: roles.map(role => ({
    relationId: `rel-${role}`,
    tenureId: `tenure-${role}`,
    edge: { relationId: `edge-${org}`, stintId: `stint-${org}` },
    subject: { id: `title-${role}`, name: role },
    startDate: '2022-06-01Z',
    endDate: null,
    description: null,
    isLegacy: false,
    status: null,
    employmentType: null,
    skills: [],
  })),
});

describe('mergePendingEmployment', () => {
  it('shows an unsaved position alongside the saved ones', () => {
    const cards = mergePendingEmployment(
      [savedCard('Coinbase', ['Data Analyst'])],
      [{ key: 'k1', draft: draft('Geo', 'Product Lead') }],
      []
    );

    expect(cards.map(card => card.organization.name)).toEqual(['Coinbase', 'Geo']);
    expect(cards[1].entries[0].subject.name).toBe('Product Lead');
    expect(isPending(cards[1].entries[0].relationId)).toBe(true);
  });

  // The promotion case while still unsaved: it belongs under the employer it was
  // added from, not as a second card for the same company.
  it('puts a role added to an existing employer under that employer', () => {
    const cards = mergePendingEmployment(
      [savedCard('Geo', ['Engineer'])],
      [{ key: 'k1', draft: draft('Geo', 'Product Lead', { existingStintId: 'stint-Geo' }) }],
      []
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].entries.map(entry => entry.subject.name)).toEqual(['Product Lead', 'Engineer']);
    // Hung off the saved edge, so removing it later knows which one it belongs to.
    expect(cards[0].entries[0].edge.stintId).toBe('stint-Geo');
  });

  // Two roles at one new employer, added in a single sitting, would otherwise be
  // two cards that merge only after a save and a refetch.
  it('groups two unsaved roles at the same new employer', () => {
    const cards = mergePendingEmployment(
      [],
      [
        { key: 'k1', draft: draft('Fathom', 'Engineer') },
        { key: 'k2', draft: draft('Fathom', 'Staff Engineer') },
      ],
      []
    );

    expect(cards).toHaveLength(1);
    // Newest first, the same order the saved rows use.
    expect(cards[0].entries.map(entry => entry.subject.name)).toEqual(['Staff Engineer', 'Engineer']);
  });

  it('hides a row queued for removal', () => {
    const cards = mergePendingEmployment(
      [savedCard('Geo', ['Engineer', 'Product Lead'])],
      [],
      [{ relationId: 'rel-Engineer', entityId: 'tenure-Engineer', typeId: ROLES_PROPERTY }]
    );

    expect(cards[0].entries.map(entry => entry.subject.name)).toEqual(['Product Lead']);
  });

  // An organisation edge goes with its last row, so leaving the card on screen
  // would promise something the save will not deliver.
  it('drops a card once its last row is queued for removal', () => {
    const cards = mergePendingEmployment(
      [savedCard('Geo', ['Engineer'])],
      [],
      [
        { relationId: 'rel-Engineer', entityId: 'tenure-Engineer', typeId: ROLES_PROPERTY },
        { relationId: 'edge-Geo', entityId: 'stint-Geo', typeId: EMPLOYMENT_PROPERTY },
      ]
    );

    expect(cards).toEqual([]);
  });

  it('leaves a saved employer standing when an unsaved role is added and then dropped', () => {
    const pending = {
      ...NOTHING_PENDING,
      positions: [{ key: 'k1', draft: draft('Geo', 'Product Lead', { existingStintId: 'stint-Geo' }) }],
    };

    const after = dropPendingAddition(pending, `${PENDING_PREFIX}k1`);
    const cards = mergePendingEmployment([savedCard('Geo', ['Engineer'])], after.positions, after.removals);

    expect(cards).toHaveLength(1);
    expect(cards[0].entries.map(entry => entry.subject.name)).toEqual(['Engineer']);
  });
});

describe('replacePendingAddition', () => {
  // Editing something never written is a different draft under the same key —
  // no removal, and no second row beside the one being changed.
  it('rewrites an unsaved row in place', () => {
    const pending = { ...NOTHING_PENDING, positions: [{ key: 'k1', draft: draft('Geo', 'Engineer') }] };

    const after = replacePendingAddition(pending, `${PENDING_PREFIX}k1`, draft('Geo', 'Staff Engineer'));

    expect(after.positions).toHaveLength(1);
    expect(after.positions[0].key).toBe('k1');
    expect(after.positions[0].draft.title.name).toBe('Staff Engineer');
    expect(after.removals).toEqual([]);
  });
});

describe('shareStintsByOrganization', () => {
  const mint = () => {
    let next = 0;
    return () => `minted-${++next}`;
  };

  it('opens one edge for two roles at the same new employer', () => {
    const assigned = shareStintsByOrganization(
      [
        { key: 'k1', draft: draft('Fathom', 'Engineer') },
        { key: 'k2', draft: draft('Fathom', 'Staff Engineer') },
      ],
      mint()
    );

    // The first mints it and the second attaches to what the first minted, so the
    // pair publishes as one employer with two roles.
    expect(assigned[0].draft.existingStintId).toBeUndefined();
    expect(assigned[0].newStintId).toBe('minted-1');
    expect(assigned[1].draft.existingStintId).toBe('minted-1');
  });

  it('opens an edge each for two different employers', () => {
    const assigned = shareStintsByOrganization(
      [
        { key: 'k1', draft: draft('Fathom', 'Engineer') },
        { key: 'k2', draft: draft('Geo', 'Product Lead') },
      ],
      mint()
    );

    expect(assigned[0].newStintId).toBe('minted-1');
    expect(assigned[1].newStintId).toBe('minted-2');
    expect(assigned.every(entry => entry.draft.existingStintId === undefined)).toBe(true);
  });

  // Whichever order they were added in: a saved edge is the one that exists, so
  // it is the one everything at that employer attaches to.
  it('prefers a saved edge over minting, even when the new role came first', () => {
    const assigned = shareStintsByOrganization(
      [
        { key: 'k1', draft: draft('Geo', 'Product Lead') },
        { key: 'k2', draft: draft('Geo', 'Engineer', { existingStintId: 'stint-Geo' }) },
      ],
      mint()
    );

    expect(assigned.map(entry => entry.draft.existingStintId)).toEqual(['stint-Geo', 'stint-Geo']);
  });

  // The placeholder `merge` hands the resting state so rows group on screen. It
  // names nothing in the graph, so it must never be written out as a target.
  it('mints over a pending stint rather than pointing at one', () => {
    const assigned = shareStintsByOrganization(
      [{ key: 'k1', draft: draft('Fathom', 'Engineer', { existingStintId: `${PENDING_PREFIX}org-Fathom-stint` }) }],
      mint()
    );

    expect(assigned[0].draft.existingStintId).toBeUndefined();
    expect(assigned[0].newStintId).toBe('minted-1');
  });
});

describe('hasPendingChanges', () => {
  it('is false with nothing queued', () => {
    expect(hasPendingChanges(NOTHING_PENDING)).toBe(false);
  });

  it('is true for an addition and for a removal alike', () => {
    expect(hasPendingChanges({ ...NOTHING_PENDING, positions: [{ key: 'k', draft: draft('Geo', 'Engineer') }] })).toBe(
      true
    );
    expect(
      hasPendingChanges({
        ...NOTHING_PENDING,
        removals: [{ relationId: 'r', entityId: 'e', typeId: ROLES_PROPERTY }],
      })
    ).toBe(true);
  });
});
