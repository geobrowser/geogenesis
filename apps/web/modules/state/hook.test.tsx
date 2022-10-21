import { useSelector } from '@legendapp/state/react';
import { render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTripleWithId } from '../services/create-id';
import { MockNetwork } from '../services/mock-network';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

describe('useObservable', () => {
  it('Initializes empty', () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's' });
    const { result } = renderHook(() => useSelector(store.triples$));

    expect(result.current).toStrictEqual([]);
  });

  // The next two tests are really just to make sure that our integration with useSyncInternalStore works.
  // We have to pass a specific object that wraps our rxjs BehaviorSubject, so want to make sure that
  // doesn't break at some point.
  it('Adds a new triple', () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's' });
    const { result, rerender } = renderHook(() => useSelector(store.triples$));
    expect(result.current).toStrictEqual([]);

    const newTriple: Triple = createTripleWithId('s', 'bob', 'name', { type: 'string', value: 'Bob' });

    store.create([newTriple]);
    rerender();
    expect(result.current).toStrictEqual([newTriple]);
  });

  it('Rerenders component when changing state', () => {
    const store = new TripleStore({ api: new MockNetwork(), space: 's' });

    const Component = () => {
      const triples = useSelector(store.triples$);
      return <p>{triples.length}</p>;
    };

    const { getByText, rerender } = render(<Component />);
    expect(getByText('0')).toBeTruthy();

    const newTriple = createTripleWithId('s', 'bob', 'name', { type: 'string', value: 'Bob' });
    store.create([newTriple]);

    rerender(<Component />);
    expect(getByText('1')).toBeTruthy();
  });
});
