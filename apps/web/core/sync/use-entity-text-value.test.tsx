import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityTextValue } from './use-entity-text-value';

const SPACE_ID = '11111111111111111111111111111111';
const ENTITY_ID = '22222222222222222222222222222222';
const PROPERTY_ID = '33333333333333333333333333333333';

const mocks = vi.hoisted(() => ({
  stored: null as null | { id: string; value: string; isDeleted?: boolean },
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({ useValue: () => mocks.stored }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { values: { set: mocks.set, delete: mocks.delete } } }),
}));

function render(entityId: string | null = ENTITY_ID) {
  return renderHook(() =>
    useEntityTextValue({ entityId, spaceId: SPACE_ID, propertyId: PROPERTY_ID, propertyName: 'Description' })
  );
}

function renderWithFallback(fallback: string | null) {
  return renderHook(() =>
    useEntityTextValue({
      entityId: ENTITY_ID,
      spaceId: SPACE_ID,
      propertyId: PROPERTY_ID,
      propertyName: 'Description',
      fallback,
    })
  );
}

beforeEach(() => {
  mocks.stored = null;
  mocks.set.mockReset();
  mocks.delete.mockReset();
});

afterEach(() => vi.clearAllMocks());

/**
 * Three store states reach this hook and only two of them mean the same thing. Every caller
 * used to decide that for itself with `value ?? fallback`, which collapsed the two that differ.
 */
describe('useEntityTextValue', () => {
  it('falls back while the store has no row at all', () => {
    const { result } = renderWithFallback('From the server');

    expect(result.current.text).toBe('From the server');
  });

  it('prefers a live row over the fallback', () => {
    mocks.stored = { id: 'v1', value: 'From the store' };
    const { result } = renderWithFallback('From the server');

    expect(result.current.text).toBe('From the store');
  });

  // The bug this hook exists to stop: a tombstone read as "nothing here" put the cleared text
  // back on screen from the fallback, and clearing it again deleted nothing.
  it('does not fall back once the value has been cleared', () => {
    mocks.stored = { id: 'v1', value: 'From the store', isDeleted: true };
    const { result } = renderWithFallback('From the server');

    expect(result.current.text).toBe('');
  });

  it('is empty with neither a row nor a fallback', () => {
    expect(render().result.current.text).toBe('');
  });

  it('writes a non-empty value against the property it was given', () => {
    render().result.current.setValue('Typed');

    expect(mocks.set).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      entity: { id: ENTITY_ID, name: null },
      property: { id: PROPERTY_ID, name: 'Description', dataType: 'TEXT' },
      value: 'Typed',
    });
  });

  it('deletes the live row rather than storing an empty string', () => {
    mocks.stored = { id: 'v1', value: 'From the store' };
    render().result.current.setValue('');

    expect(mocks.delete).toHaveBeenCalledWith(mocks.stored);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('clears nothing when the row is already a tombstone', () => {
    mocks.stored = { id: 'v1', value: 'From the store', isDeleted: true };
    render().result.current.setValue('');

    expect(mocks.delete).not.toHaveBeenCalled();
  });

  // A personal space whose topic entity never resolved. There is nothing to write onto, and a
  // write keyed on `null` would mint a row nobody can read.
  it('writes nothing without an entity to write onto', () => {
    const { result } = render(null);

    result.current.setValue('Typed');

    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
