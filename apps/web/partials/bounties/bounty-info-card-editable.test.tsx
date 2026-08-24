import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_STATUS_IN_PROGRESS_ID,
  BOUNTY_STATUS_TODO_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
} from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';
import type { Relation, Value } from '~/core/types';

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
// Radix select needs a real pointer environment; a native select keeps the contract testable.
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
vi.mock('~/design-system/select-entity', () => ({
  SelectEntity: ({ onDone }: { onDone: (r: { id: string; name: string | null }) => void }) => (
    <button type="button" onClick={() => onDone({ id: 'skill-9', name: 'Zoology' })}>
      pick-entity
    </button>
  ),
}));

const bounty = { id: 'bounty-1', spaceId: 'dao-1', name: 'Bounty' } as BoardBounty;

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

function skillRelation(toId: string, name: string): Relation {
  return {
    id: `rel-skill-${toId}`,
    entityId: 'rel-entity',
    spaceId: 'dao-1',
    renderableType: 'RELATION',
    fromEntity: { id: 'bounty-1', name: 'Bounty' },
    toEntity: { id: toId, name, value: toId },
    type: { id: BOUNTY_SKILLS_PROPERTY_ID, name: 'Skills' },
  };
}

beforeEach(() => {
  mocks.valuesSet.mockClear();
  mocks.valuesDelete.mockClear();
  mocks.relationsSet.mockClear();
  mocks.relationsDeleteMany.mockClear();
  mocks.entity = {
    name: 'Bounty',
    values: [],
    relations: [statusRelation(BOUNTY_STATUS_TODO_ID), skillRelation('skill-1', 'Curation')],
    isLoading: false,
  };
});

afterEach(cleanup);

describe('EditableBountyInfoCard', () => {
  it('renders a skeleton (no editors) until the store has hydrated the entity', () => {
    mocks.entity = { ...mocks.entity, isLoading: true };
    render(<EditableBountyInfoCard bounty={bounty} />);
    expect(screen.queryByLabelText('Bounty budget')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy]')).toBeTruthy();
  });

  it('tolerates a malformed stored deadline instead of throwing', () => {
    mocks.entity = {
      ...mocks.entity,
      values: [
        {
          id: 'v1',
          entity: { id: 'bounty-1', name: 'Bounty' },
          property: { id: BOUNTY_DEADLINE_PROPERTY_ID, name: 'Submission Deadline', dataType: 'DATETIME' },
          spaceId: 'dao-1',
          value: 'not-a-date',
        } as Value,
      ],
    };
    render(<EditableBountyInfoCard bounty={bounty} />);
    expect(screen.getByLabelText('Submission deadline')).toHaveValue('');
  });

  it('commits the budget to the store on blur, and unsets it when cleared', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    const input = screen.getByLabelText('Bounty budget');

    fireEvent.blur(input, { target: { value: '250' } });
    expect(mocks.valuesSet).toHaveBeenCalledTimes(1);
    expect(mocks.valuesSet.mock.calls[0][0]).toMatchObject({
      spaceId: 'dao-1',
      value: '250',
      entity: { id: 'bounty-1' },
      property: { id: BOUNTY_BUDGET_PROPERTY_ID, dataType: 'FLOAT' },
    });

    fireEvent.blur(input, { target: { value: '' } });
    expect(mocks.valuesDelete).toHaveBeenCalledTimes(1);
    expect(mocks.valuesDelete.mock.calls[0][0]).toMatchObject({ property: { id: BOUNTY_BUDGET_PROPERTY_ID } });
  });

  it('ignores invalid numbers instead of writing them', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    fireEvent.blur(screen.getByLabelText('Bounty budget'), { target: { value: '-5' } });
    fireEvent.blur(screen.getByLabelText('Max contributors'), { target: { value: '1.5' } });
    expect(mocks.valuesSet).not.toHaveBeenCalled();
    expect(mocks.valuesDelete).not.toHaveBeenCalled();
  });

  it('replaces the status relation: tombstones the current row and adds the pick', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    const [statusSelect] = screen.getAllByLabelText('select');
    fireEvent.change(statusSelect, { target: { value: 'in-progress' } });

    expect(mocks.relationsDeleteMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'rel-status-1' })]);
    expect(mocks.relationsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'dao-1',
        fromEntity: expect.objectContaining({ id: 'bounty-1' }),
        toEntity: expect.objectContaining({ id: BOUNTY_STATUS_IN_PROGRESS_ID }),
        type: expect.objectContaining({ id: BOUNTY_TASK_STATUS_PROPERTY_ID }),
      })
    );
  });

  it('re-picking the current status writes nothing', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    const [statusSelect] = screen.getAllByLabelText('select');
    fireEvent.change(statusSelect, { target: { value: 'todo' } });
    expect(mocks.relationsDeleteMany).not.toHaveBeenCalled();
    expect(mocks.relationsSet).not.toHaveBeenCalled();
  });

  it('adds and removes skills as individual relations', () => {
    render(<EditableBountyInfoCard bounty={bounty} />);
    expect(screen.getByText('Curation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Curation' }));
    expect(mocks.relationsDeleteMany).toHaveBeenCalledWith([expect.objectContaining({ id: 'rel-skill-skill-1' })]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'pick-entity' }));
    expect(mocks.relationsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        toEntity: expect.objectContaining({ id: 'skill-9', name: 'Zoology' }),
        type: expect.objectContaining({ id: BOUNTY_SKILLS_PROPERTY_ID }),
      })
    );
  });
});
