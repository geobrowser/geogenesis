import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EMPLOYER_TYPE,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_STATUS_PROPERTY,
  ROLES_PROPERTY,
  START_DATE_PROPERTY,
} from '~/core/profile/history-ontology';
import type { EmploymentCard } from '~/core/profile/normalize-history';
import type { PositionDraft } from '~/core/profile/stage-history';

import { useProfileHistory } from './use-profile-history';

const ENTITY_ID = '6caf2067e9a64f3696ff22fb7bc94947';
const SPACE_ID = 'c3cdf799eb8a469abbb609b7c3ecdb83';

const mocks = vi.hoisted(() => ({
  employment: [] as unknown[],
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { employment: mocks.employment, education: [] }, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('~/core/io/subgraph/fetch-profile-history', () => ({
  fetchProfileHistory: vi.fn(),
  profileHistoryQueryKey: (entityId: string) => ['profile-history', entityId],
}));

afterEach(() => {
  mocks.employment = [];
  vi.clearAllMocks();
});

/** One employer, with as many saved roles under one Employment edge as named. */
const savedCard = (org: string, roles: string[], stint = `stint-${org}`): EmploymentCard => ({
  organization: { id: `org-${org}`, name: org },
  edges: [{ relationId: `edge-${org}`, stintId: stint }],
  entries: roles.map(role => ({
    relationId: `rel-${role}`,
    tenureId: `tenure-${role}`,
    edge: { relationId: `edge-${org}`, stintId: stint },
    subject: { id: `title-${role}`, name: role },
    startDate: '2022-06-01Z',
    endDate: null,
    description: null,
    isLegacy: false,
    status: 'current' as const,
    employmentType: null,
    skills: [],
  })),
});

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

const setup = () => renderHook(() => useProfileHistory({ entityId: ENTITY_ID, spaceId: SPACE_ID }));

const tombstones = (relations: { isDeleted?: boolean; id: string; type: { id: string } }[]) =>
  relations.filter(relation => relation.isDeleted);

describe('useProfileHistory', () => {
  it('writes nothing until something is staged', () => {
    mocks.employment = [savedCard('Geo', ['Engineer'])];
    const { result } = setup();

    expect(result.current.hasPendingChanges).toBe(false);
    expect(result.current.stagePending()).toEqual({ values: [], relations: [] });
  });

  describe('removing', () => {
    // An employer with nothing under it is not a record of anything.
    it('takes the Employment edge with the last role under it', () => {
      mocks.employment = [savedCard('Geo', ['Engineer'])];
      const { result } = setup();

      act(() => {
        const card = result.current.employment[0];
        result.current.removeEntry(card, card.entries[0], 'employment');
      });

      const deleted = tombstones(result.current.stagePending().relations);
      expect(deleted.map(relation => relation.id).sort()).toEqual(['edge-Geo', 'rel-Engineer']);
      expect(result.current.employment).toEqual([]);
    });

    it('leaves the edge standing while another role still hangs off it', () => {
      mocks.employment = [savedCard('Geo', ['Engineer', 'Product Lead'])];
      const { result } = setup();

      act(() => {
        const card = result.current.employment[0];
        result.current.removeEntry(card, card.entries[0], 'employment');
      });

      expect(tombstones(result.current.stagePending().relations).map(relation => relation.id)).toEqual([
        'rel-Engineer',
      ]);
    });

    // Two edges to one employer read as one card. A sibling under the other edge
    // is not under this one, so it cannot keep this one alive.
    it('counts siblings on the row’s own edge, not across the whole card', () => {
      const card = savedCard('Geo', ['Engineer']);
      const second = savedCard('Geo', ['Product Lead'], 'stint-Geo-2');
      second.entries[0].edge = { relationId: 'edge-Geo-2', stintId: 'stint-Geo-2' };
      mocks.employment = [
        { ...card, edges: [...card.edges, ...second.edges], entries: [...card.entries, ...second.entries] },
      ];

      const { result } = setup();

      act(() => {
        const merged = result.current.employment[0];
        result.current.removeEntry(merged, merged.entries[0], 'employment');
      });

      expect(
        tombstones(result.current.stagePending().relations)
          .map(relation => relation.id)
          .sort()
      ).toEqual(['edge-Geo', 'rel-Engineer']);
    });

    it('forgets an unsaved row rather than queuing a delete for it', () => {
      const { result } = setup();

      act(() => result.current.addPosition(draft('Fathom', 'Engineer')));
      act(() => {
        const card = result.current.employment[0];
        result.current.removeEntry(card, card.entries[0], 'employment');
      });

      expect(result.current.hasPendingChanges).toBe(false);
      expect(result.current.stagePending()).toEqual({ values: [], relations: [] });
    });
  });

  describe('editing', () => {
    // The tenure is an anonymous relation entity nothing else points at, so a
    // replacement and a rewrite come to the same thing — and only a replacement
    // can also move the row to another company.
    it('replaces a saved row and reattaches it to the same employer', () => {
      mocks.employment = [savedCard('Geo', ['Engineer'])];
      const { result } = setup();

      act(() => {
        const card = result.current.employment[0];
        result.current.editEntry(card, card.entries[0], 'employment', draft('Geo', 'Staff Engineer'));
      });

      const { relations, values } = result.current.stagePending();

      // The row goes; the Employment edge it hung off does not, and nothing
      // re-creates one.
      expect(tombstones(relations).map(relation => relation.id)).toEqual(['rel-Engineer']);
      expect(relations.some(relation => relation.type.id === EMPLOYMENT_PROPERTY && !relation.isDeleted)).toBe(false);

      const roles = relations.find(relation => relation.type.id === ROLES_PROPERTY && !relation.isDeleted);
      expect(roles?.fromEntity.id).toBe('stint-Geo');
      expect(roles?.toEntity.id).toBe('title-Staff Engineer');
      expect(values.some(value => value.property.id === START_DATE_PROPERTY)).toBe(true);
    });

    it('shows the edited row in place of the one it replaced', () => {
      mocks.employment = [savedCard('Geo', ['Engineer'])];
      const { result } = setup();

      act(() => {
        const card = result.current.employment[0];
        result.current.editEntry(card, card.entries[0], 'employment', draft('Geo', 'Staff Engineer'));
      });

      expect(result.current.employment).toHaveLength(1);
      expect(result.current.employment[0].entries.map(entry => entry.subject.name)).toEqual(['Staff Engineer']);
    });

    // Correcting the employer, not the role. The old edge has nothing left under
    // it, so it goes too, and the row opens a new one at the right company.
    it('moves a row to another employer, edge and all', () => {
      mocks.employment = [savedCard('Geo', ['Engineer'])];
      const { result } = setup();

      act(() => {
        const card = result.current.employment[0];
        result.current.editEntry(card, card.entries[0], 'employment', draft('Coinbase', 'Engineer'));
      });

      const { relations } = result.current.stagePending();

      expect(
        tombstones(relations)
          .map(relation => relation.id)
          .sort()
      ).toEqual(['edge-Geo', 'rel-Engineer']);

      const employment = relations.find(relation => relation.type.id === EMPLOYMENT_PROPERTY && !relation.isDeleted);
      expect(employment?.toEntity.id).toBe('org-Coinbase');
      expect(result.current.employment.map(card => card.organization.name)).toEqual(['Coinbase']);
    });

    // The bug this exists for: reopening an unsaved row rebuilt its draft from
    // what the card displayed, which does not show that the company was created
    // here. `isNew` came back false, so neither the name nor the type was staged
    // and the employer published as "Untitled" with no types at all.
    it('keeps a created company named and typed when the row is reopened', () => {
      const { result } = setup();

      const created = draft('Digital Paradise', 'Cofounder');
      created.company.isNew = true;

      act(() => result.current.addPosition(created));

      const entry = result.current.employment[0].entries[0];
      const reopened = result.current.draftFor(entry) as PositionDraft | undefined;

      expect(reopened?.company.isNew).toBe(true);

      act(() => {
        const card = result.current.employment[0];
        result.current.editEntry(card, card.entries[0], 'employment', { ...reopened!, description: 'Edited' });
      });

      const { values, relations } = result.current.stagePending();

      expect(values).toContainEqual(
        expect.objectContaining({ entity: { id: 'org-Digital Paradise', name: null }, value: 'Digital Paradise' })
      );
      expect(
        relations.some(
          relation => relation.fromEntity.id === 'org-Digital Paradise' && relation.toEntity.id === EMPLOYER_TYPE
        )
      ).toBe(true);
    });

    it('rewrites an unsaved row in place rather than queuing a delete', () => {
      const { result } = setup();

      act(() => result.current.addPosition(draft('Fathom', 'Engineer')));
      act(() => {
        const card = result.current.employment[0];
        result.current.editEntry(card, card.entries[0], 'employment', draft('Fathom', 'Staff Engineer'));
      });

      expect(tombstones(result.current.stagePending().relations)).toEqual([]);
      expect(result.current.employment[0].entries.map(entry => entry.subject.name)).toEqual(['Staff Engineer']);
    });
  });

  describe('staging', () => {
    // Two roles added at one new employer in a sitting would otherwise publish two
    // Employment edges and read back as two employers.
    it('opens one Employment edge for two roles at the same new employer', () => {
      const { result } = setup();

      act(() => result.current.addPosition(draft('Fathom', 'Engineer')));
      act(() => result.current.addPosition(draft('Fathom', 'Staff Engineer')));

      const { relations } = result.current.stagePending();
      const edges = relations.filter(relation => relation.type.id === EMPLOYMENT_PROPERTY);
      const roles = relations.filter(relation => relation.type.id === ROLES_PROPERTY);

      expect(edges).toHaveLength(1);
      expect(roles).toHaveLength(2);
      expect(roles.every(role => role.fromEntity.id === edges[0].entityId)).toBe(true);
      expect(result.current.employment).toHaveLength(1);
    });

    it('attaches a new role to the saved edge when the employer is already listed', () => {
      mocks.employment = [savedCard('Geo', ['Engineer'])];
      const { result } = setup();

      act(() => result.current.addPosition(draft('Geo', 'Product Lead', { existingStintId: 'stint-Geo' })));

      const { relations } = result.current.stagePending();
      expect(relations.filter(relation => relation.type.id === EMPLOYMENT_PROPERTY)).toEqual([]);
      expect(relations.find(relation => relation.type.id === ROLES_PROPERTY)?.fromEntity.id).toBe('stint-Geo');
    });

    it('records the status on the role rather than on the employer', () => {
      const { result } = setup();

      act(() => result.current.addPosition(draft('Fathom', 'Engineer')));

      const { relations } = result.current.stagePending();
      const roles = relations.find(relation => relation.type.id === ROLES_PROPERTY);
      const status = relations.find(relation => relation.type.id === EMPLOYMENT_STATUS_PROPERTY);

      expect(status?.fromEntity.id).toBe(roles?.entityId);
    });
  });

  it('drops everything pending when the modal is dismissed', () => {
    mocks.employment = [savedCard('Geo', ['Engineer'])];
    const { result } = setup();

    act(() => result.current.addPosition(draft('Fathom', 'Engineer')));
    act(() => result.current.discard());

    expect(result.current.hasPendingChanges).toBe(false);
    expect(result.current.employment.map(card => card.organization.name)).toEqual(['Geo']);
  });
});
