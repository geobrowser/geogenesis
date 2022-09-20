import { describe, expect, it } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { TripleStore } from './triple-store';
import { useSharedObservable } from './hook';
import { ITriple } from '../types';
import { MockNetwork } from '../services/mocks/mock-network';

describe('useSharedObservable', () => {
  it('Initializes empty', () => {
    const store = new TripleStore({ api: new MockNetwork() });
    const { result } = renderHook(() => useSharedObservable(store.triples$));

    expect(result.current).toStrictEqual([]);
  });

  // The next two tests are really just to make sure that our integration with useSyncInternalStore works.
  // We have to pass a specific object that wraps our rxjs BehaviorSubject, so want to make sure that
  // doesn't break at some point.
  it('Adds a new triple', () => {
    const store = new TripleStore({ api: new MockNetwork() });
    const { result, rerender } = renderHook(() => useSharedObservable(store.triples$));
    expect(result.current).toStrictEqual([]);

    const newTriple: ITriple = {
      id: '1',
      entity: {
        id: '1',
      },
      attribute: {
        id: 'name',
      },
      stringValue: 'Bob',
    };

    store.createTriple(newTriple);
    rerender();
    expect(result.current).toContain(newTriple);
  });

  it('Rerenders component when changing state', () => {
    const store = new TripleStore({ api: new MockNetwork() });

    const Component = () => {
      const triples = useSharedObservable(store.triples$);
      return <p>{triples.length}</p>;
    };

    const { getByText, rerender } = render(<Component />);
    expect(getByText('0')).toBeTruthy();

    store.createTriple({
      id: '1',
      entity: {
        id: '1',
      },
      attribute: {
        id: 'name',
      },
      stringValue: 'Bob',
    });

    rerender(<Component />);
    expect(getByText('1')).toBeTruthy();
  });
});
