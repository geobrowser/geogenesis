import { describe, expect, it } from 'vitest';

import {
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_STATUS_COMPLETED,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYMENT_STATUS_CURRENT,
  EMPLOYMENT_STATUS_FORMER,
  EMPLOYMENT_STATUS_PROPERTY,
  END_DATE_PROPERTY,
  FIELDS_OF_STUDY_PROPERTY,
  LEGACY_FIELD_OF_STUDY_PROPERTY,
  ROLES_PROPERTY,
  START_DATE_PROPERTY,
} from './history-ontology';
import {
  type HistoryEdgeNode,
  type HistoryRelationNode,
  type HistoryValueNode,
  normalizeEducation,
  normalizeEmployment,
} from './normalize-history';

const NAME_PROPERTY = 'a126ca530c8e48d5b88882c734c38935';
const IPFS_URL_PROPERTY = '8a743832c0944a62b6650c3cc2f9c7bc';

const dateValue = (propertyId: string, date: string): HistoryValueNode => ({
  property: { id: propertyId },
  date,
  text: null,
});

const textValue = (propertyId: string, text: string): HistoryValueNode => ({
  property: { id: propertyId },
  date: null,
  text,
});

const statusRelation = (propertyId: string, optionId: string): HistoryRelationNode => ({
  id: `status-${optionId}`,
  entityId: `status-entity-${optionId}`,
  type: { id: propertyId },
  toEntity: { id: optionId, name: null },
  entity: null,
});

// `propertyId` is typed rather than inferred: the SDK brands its ids, so taking
// the default's type would reject the plain-string constants defined here.
const role = (
  name: string,
  tenure: { values?: HistoryValueNode[]; relations?: HistoryRelationNode[] } = {},
  propertyId: string = ROLES_PROPERTY
): HistoryRelationNode => ({
  id: `rel-${name}`,
  entityId: `tenure-${name}`,
  type: { id: propertyId },
  toEntity: { id: `subject-${name}`, name },
  entity: { valuesList: tenure.values ?? [], relationsList: tenure.relations ?? [] },
});

const edge = (
  org: string,
  stint: { values?: HistoryValueNode[]; relations?: HistoryRelationNode[] }
): HistoryEdgeNode => ({
  id: `edge-${org}`,
  entityId: `stint-${org}`,
  toEntity: { id: `org-${org}`, name: org },
  entity: { valuesList: stint.values ?? [], relationsList: stint.relations ?? [] },
});

describe('normalizeEmployment', () => {
  it('reads a role’s dates and status from its own tenure', () => {
    const [card] = normalizeEmployment([
      edge('Geo', {
        relations: [
          role('Product Lead', {
            values: [dateValue(START_DATE_PROPERTY, '2024-01-01Z')],
            relations: [statusRelation(EMPLOYMENT_STATUS_PROPERTY, EMPLOYMENT_STATUS_CURRENT)],
          }),
        ],
      }),
    ]);

    expect(card.organization.name).toBe('Geo');
    expect(card.entries).toHaveLength(1);
    expect(card.entries[0]).toMatchObject({
      subject: { name: 'Product Lead' },
      startDate: '2024-01-01Z',
      endDate: null,
      status: 'current',
      isLegacy: false,
    });
  });

  // The promotion case, and the whole reason for one Employment edge per company.
  it('keeps two roles at one company under a single card', () => {
    const [card] = normalizeEmployment([
      edge('Geo', {
        relations: [
          role('Engineer', {
            values: [dateValue(START_DATE_PROPERTY, '2022-06-01Z'), dateValue(END_DATE_PROPERTY, '2024-01-01Z')],
            relations: [statusRelation(EMPLOYMENT_STATUS_PROPERTY, EMPLOYMENT_STATUS_FORMER)],
          }),
          role('Product Lead', {
            values: [dateValue(START_DATE_PROPERTY, '2024-01-01Z')],
            relations: [statusRelation(EMPLOYMENT_STATUS_PROPERTY, EMPLOYMENT_STATUS_CURRENT)],
          }),
        ],
      }),
    ]);

    // The role still held sorts above the one that ended.
    expect(card.entries.map(entry => entry.subject.name)).toEqual(['Product Lead', 'Engineer']);
  });

  // Modelled on stint 333463c7 in the graph: Start date, Description and status
  // all sit on the stint, and both tenures are empty.
  it('falls back to the stint for records written before this shape', () => {
    const [card] = normalizeEmployment([
      edge('World Labs', {
        values: [
          dateValue(START_DATE_PROPERTY, '2024-01-01Z'),
          textValue(DESCRIPTION_PROPERTY, 'Co-founded a spatial intelligence company.'),
        ],
        relations: [
          statusRelation(EMPLOYMENT_STATUS_PROPERTY, EMPLOYMENT_STATUS_CURRENT),
          role('CEO'),
          role('Co-founder'),
        ],
      }),
    ]);

    expect(card.entries).toHaveLength(2);
    for (const entry of card.entries) {
      expect(entry).toMatchObject({
        startDate: '2024-01-01Z',
        status: 'current',
        description: 'Co-founded a spatial intelligence company.',
        isLegacy: true,
      });
    }
  });

  // Without this, a role held now — a real start and a deliberately empty end —
  // would look indistinguishable from an unstructured one and adopt the stint's.
  it('does not treat an open role as legacy', () => {
    const [card] = normalizeEmployment([
      edge('Geo', {
        values: [dateValue(START_DATE_PROPERTY, '2019-01-01Z')],
        relations: [role('Product Lead', { values: [dateValue(START_DATE_PROPERTY, '2024-01-01Z')] })],
      }),
    ]);

    expect(card.entries[0]).toMatchObject({ startDate: '2024-01-01Z', endDate: null, isLegacy: false });
  });

  it('reads a company with no roles yet as a card with no rows', () => {
    const [card] = normalizeEmployment([edge('Apple', {})]);

    expect(card.organization.name).toBe('Apple');
    expect(card.entries).toEqual([]);
  });

  it('ignores relations on the stint that are not roles', () => {
    const [card] = normalizeEmployment([
      edge('Geo', { relations: [statusRelation(EMPLOYMENT_STATUS_PROPERTY, EMPLOYMENT_STATUS_CURRENT)] }),
    ]);

    expect(card.entries).toEqual([]);
  });
});

describe('normalizeEducation', () => {
  it('reads a degree with its fields and status', () => {
    const [card] = normalizeEducation([
      edge('Northumbria University', {
        relations: [
          role(
            'Ph.D.',
            {
              values: [dateValue(START_DATE_PROPERTY, '2022-09-01Z')],
              relations: [
                statusRelation(EDUCATION_STATUS_PROPERTY, EDUCATION_STATUS_COMPLETED),
                {
                  id: 'field-finance',
                  entityId: 'field-entity',
                  type: { id: FIELDS_OF_STUDY_PROPERTY },
                  toEntity: { id: 'finance', name: 'Finance' },
                  entity: null,
                },
              ],
            },
            DEGREE_PROPERTY
          ),
        ],
      }),
    ]);

    expect(card.entries[0]).toMatchObject({
      subject: { name: 'Ph.D.' },
      status: 'completed',
      fields: [{ id: 'finance', name: 'Finance' }],
    });
  });

  // Eleven records keep the discipline as free text from before `Fields of study`
  // existed. Surfaced so they render, but they are not a second way to store one.
  it('surfaces a legacy text field of study when there is no relation', () => {
    const [card] = normalizeEducation([
      edge('Northumbria University', {
        values: [textValue(LEGACY_FIELD_OF_STUDY_PROPERTY, 'Computer Science')],
        relations: [role('B.Sc.', {}, DEGREE_PROPERTY)],
      }),
    ]);

    expect(card.entries[0].fields).toEqual([{ id: '', name: 'Computer Science' }]);
  });

  it('prefers real Field of study relations over the legacy text', () => {
    const [card] = normalizeEducation([
      edge('Northumbria University', {
        values: [textValue(LEGACY_FIELD_OF_STUDY_PROPERTY, 'Computer Science')],
        relations: [
          role(
            'B.Sc.',
            {
              relations: [
                {
                  id: 'field-cs',
                  entityId: 'field-entity',
                  type: { id: FIELDS_OF_STUDY_PROPERTY },
                  toEntity: { id: 'cs', name: 'Computing' },
                  entity: null,
                },
              ],
            },
            DEGREE_PROPERTY
          ),
        ],
      }),
    ]);

    expect(card.entries[0].fields).toEqual([{ id: 'cs', name: 'Computing' }]);
  });

  // Still studying is the absence of a status, not a status of its own.
  it('reads a degree with no status as still studying rather than guessing', () => {
    const [card] = normalizeEducation([
      edge('Northumbria University', {
        relations: [role('M.Sc.', { values: [dateValue(START_DATE_PROPERTY, '2020-09-01Z')] }, DEGREE_PROPERTY)],
      }),
    ]);

    expect(card.entries[0].status).toBeNull();
    expect(card.entries[0].endDate).toBeNull();
  });
});

describe('one card per organisation', () => {
  // Two Employment edges to one company, which is what an older version of the
  // modal wrote and what any other tool is free to write. Two cards for one
  // employer is a rendering fault to the person looking at their own profile.
  it('folds a second edge to the same employer into one card', () => {
    const cards = normalizeEmployment([
      edge('Geo', {
        relations: [role('Product Manager', { values: [dateValue(START_DATE_PROPERTY, '2026-07-01Z')] })],
      }),
      { ...edge('Geo', { relations: [role('Senior Product Designer')] }), id: 'edge-Geo-2', entityId: 'stint-Geo-2' },
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].entries.map(entry => entry.subject.name)).toEqual(['Product Manager', 'Senior Product Designer']);
    expect(cards[0].edges.map(cardEdge => cardEdge.stintId)).toEqual(['stint-Geo', 'stint-Geo-2']);
  });

  // Removing a row has to know which of the employer's edges it hung off, since
  // a sibling under the other one cannot keep this one alive.
  it('tells each row which edge it hangs off', () => {
    const cards = normalizeEmployment([
      edge('Geo', { relations: [role('Product Manager')] }),
      { ...edge('Geo', { relations: [role('Designer')] }), id: 'edge-Geo-2', entityId: 'stint-Geo-2' },
    ]);

    const byName = Object.fromEntries(cards[0].entries.map(entry => [entry.subject.name, entry.edge.stintId]));
    expect(byName).toEqual({ 'Product Manager': 'stint-Geo', Designer: 'stint-Geo-2' });
  });

  it('keeps two different employers apart', () => {
    const cards = normalizeEmployment([
      edge('Geo', { relations: [role('Product Manager')] }),
      edge('Coinbase', { relations: [role('Data Analyst')] }),
    ]);

    expect(cards.map(card => card.organization.name)).toEqual(['Geo', 'Coinbase']);
  });
});

describe('the organisation avatar', () => {
  const withImage = (org: string, values: HistoryValueNode[]): HistoryEdgeNode => ({
    ...edge(org, { relations: [role('Engineer')] }),
    toEntity: { id: `org-${org}`, name: org, relationsList: [{ toEntity: { valuesList: values } }] },
  });

  // An image entity carries its own name and a couple of dimensions beside the
  // URL. Taking the first value that held a string picked "Geo avatar" and
  // rendered nothing at all.
  it('reads the URL rather than the image entity’s name', () => {
    const cards = normalizeEmployment([
      withImage('Geo', [textValue(NAME_PROPERTY, 'Geo avatar'), textValue(IPFS_URL_PROPERTY, 'ipfs://bafyavatar')]),
    ]);

    expect(cards[0].avatarUrl).toBe('ipfs://bafyavatar');
  });

  it('has none where the image entity holds no URL', () => {
    const cards = normalizeEmployment([withImage('Geo', [textValue(NAME_PROPERTY, 'Geo avatar')])]);

    expect(cards[0].avatarUrl).toBeNull();
  });
});
