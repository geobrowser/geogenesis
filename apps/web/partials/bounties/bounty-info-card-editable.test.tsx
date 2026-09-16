import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_STATUS_IN_PROGRESS_ID,
  BOUNTY_STATUS_TODO_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
} from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';
import type { Relation, Value } from '~/core/types';

import { BountyInfoCard } from './bounty-info-card';
import { EditableBountyInfoCard } from './bounty-info-card-editable';

const mocks = vi.hoisted(() => ({
  valuesSet: vi.fn(),
  valuesDelete: vi.fn(),
  relationsSet: vi.fn(),
  relationsDeleteMany: vi.fn(),
  entity: { name: 'Bounty', values: [] as Value[], relations: [] as Relation[], isLoading: false },
}));

vi.mock('~/core/database/entities', () => ({ useEntity: () => mocks.entity }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      values: { set: mocks.valuesSet, delete: mocks.valuesDelete },
      relations: { set: mocks.relationsSet, deleteMany: mocks.relationsDeleteMany },
    },
  }),
}));
// The design-system editors are the properties container's own; stand-ins keep their contracts.
vi.mock('~/design-system/editable-fields/number-field', () => ({
  NumberField: ({
    value,
    placeholder,
    onChange,
  }: {
    value?: string;
    placeholder?: string;
    onChange?: (v: string) => void;
  }) => <input aria-label={placeholder} defaultValue={value} onChange={e => onChange?.(e.target.value)} />,
}));
vi.mock('~/design-system/editable-fields/date-field', () => ({
  DateField: ({ value, onBlur }: { value: string; onBlur?: (a: { value: string }) => void }) => (
    <input aria-label="Submission deadline" defaultValue={value} onBlur={e => onBlur?.({ value: e.target.value })} />
  ),
}));
vi.mock('~/partials/entity-page/editable-entity-page', () => ({
  RelationsGroup: ({ propertyId }: { propertyId: string }) => <div data-testid={`relations-${propertyId}`} />,
}));
vi.mock('~/design-system/select', () => ({
  Select: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label="select">
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('~/design-system/geo-image', () => ({ ThumbGeoImage: () => <span data-thumb-image /> }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));
vi.mock('~/design-system/tooltip', () => ({
  Tooltip: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

const bounty: BoardBounty = {
  id: 'bounty-1',
  spaceId: 'dao-1',
  spaceLabel: 'DAO',
  name: 'Bounty',
  description: null,
  budget: 500,
  difficulty: null,
  difficultyId: null,
  status: null,
  statusId: null,
  deadline: null,
  skills: [],
  maintainers: [],
  allocatedIds: [],
  interestedCount: 2,
  updatedAt: null,
  isFeatured: false,
  contributors: [],
  submissionsCount: 1,
};

function statusRelation(toId: string, id = 'rel-status-1'): Relation {
  return {
    id,
    entityId: 'rel-entity',
    spaceId: 'dao-1',
    renderableType: 'RELATION',
    fromEntity: { id: 'bounty-1', name: 'Bounty' },
    toEntity: { id: toId, name: null, value: toId },
    type: { id: BOUNTY_TASK_STATUS_PROPERTY_ID, name: 'Workflow Status' },
  };
}

beforeEach(() => {
  mocks.valuesSet.mockClear();
  mocks.valuesDelete.mockClear();
  mocks.relationsSet.mockClear();
  mocks.relationsDeleteMany.mockClear();
  mocks.entity = { name: 'Bounty', values: [], relations: [statusRelation(BOUNTY_STATUS_TODO_ID)], isLoading: false };
});

afterEach(cleanup);

const labelsOf = (root: HTMLElement) =>
  within(root)
    .getAllByRole('term')
    .map(dt => dt.textContent?.trim());

describe('EditableBountyInfoCard', () => {
  it('lists the same properties in the same order as the read-only card (no reshuffle on mode switch)', () => {
    const read = render(<BountyInfoCard bounty={bounty} showStatus />);
    const readLabels = labelsOf(read.container);
    read.unmount();
    const edit = render(<EditableBountyInfoCard bounty={bounty} />);
    expect(labelsOf(edit.container)).toEqual(readLabels);
  });

  it('renders a skeleton (no editors) until the store has hydrated the entity', () => {
    mocks.entity = { ...mocks.entity, isLoading: true };
    render(<EditableBountyInfoCard bounty={bounty} />);
    expect(screen.queryByLabelText('Not set')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy]')).toBeTruthy();
  });

  it('commits the budget through the store as typed, and unsets it when cleared', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    const input = screen.getByLabelText('Not set'); // budget's placeholder
    fireEvent.change(input, { target: { value: '250' } });
    expect(mocks.valuesSet).toHaveBeenCalledTimes(1);
    expect(mocks.valuesSet.mock.calls[0][0]).toMatchObject({
      spaceId: 'dao-1',
      value: '250',
      entity: { id: 'bounty-1' },
      property: { id: BOUNTY_BUDGET_PROPERTY_ID, dataType: 'FLOAT' },
    });
    fireEvent.change(input, { target: { value: '' } });
    expect(mocks.valuesDelete).toHaveBeenCalledTimes(1);
  });

  it('ignores invalid numbers instead of writing them', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    fireEvent.change(screen.getByLabelText('Not set'), { target: { value: '-5' } });
    fireEvent.change(screen.getAllByLabelText('Unlimited')[0], { target: { value: '1.5' } });
    expect(mocks.valuesSet).not.toHaveBeenCalled();
    expect(mocks.valuesDelete).not.toHaveBeenCalled();
  });

  it('stores a picked deadline as the end of that day', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    fireEvent.blur(screen.getByLabelText('Submission deadline'), { target: { value: '2026-12-31' } });
    expect(mocks.valuesSet.mock.calls[0][0]).toMatchObject({
      property: { id: BOUNTY_DEADLINE_PROPERTY_ID, dataType: 'DATETIME' },
      value: '2026-12-31T23:59:59.000Z',
    });
  });

  it('replaces the status relation: tombstones the current row and adds the pick', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    const [statusSelect] = screen.getAllByLabelText('select');
    fireEvent.change(statusSelect, { target: { value: 'in-progress' } });
    expect(mocks.relationsDeleteMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'rel-status-1' })]);
    expect(mocks.relationsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        toEntity: expect.objectContaining({ id: BOUNTY_STATUS_IN_PROGRESS_ID }),
        type: expect.objectContaining({ id: BOUNTY_TASK_STATUS_PROPERTY_ID }),
      })
    );
  });

  it('re-picking the current status writes nothing', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    fireEvent.change(screen.getAllByLabelText('select')[0], { target: { value: 'todo' } });
    expect(mocks.relationsDeleteMany).not.toHaveBeenCalled();
    expect(mocks.relationsSet).not.toHaveBeenCalled();
  });

  it("edits skills and maintainers with the properties container's own relation editor", () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    expect(screen.getByTestId(`relations-${BOUNTY_SKILLS_PROPERTY_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`relations-${BOUNTY_MAINTAINER_PROPERTY_ID}`)).toBeInTheDocument();
  });
});
