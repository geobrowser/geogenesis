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
  relationId: `edge-${org}`,
  stintId: `stint-${org}`,
  organization: { id: `org-${org}`, name: org },
  entries: roles.map(role => ({
    relationId: `rel-${role}`,
    tenureId: `tenure-${role}`,
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
