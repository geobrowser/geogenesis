import { render, renderHook } from '@testing-library/react';
import { Signer } from 'ethers';
import { describe, expect, it } from 'vitest';
import { StubNetwork } from '../services/stub-network';
import { Triple } from '../types';
import { useSharedObservable } from './hook';
import { TripleStore } from './triple-store';

describe('useSharedObservable', () => {
  it('Initializes empty', () => {
    const store = new TripleStore({ api: new StubNetwork() });
    const { result } = renderHook(() => useSharedObservable(store.triples$));

    expect(result.current).toStrictEqual([]);
  });

  // The next two tests are really just to make sure that our integration with useSyncInternalStore works.
  // We have to pass a specific object that wraps our rxjs BehaviorSubject, so want to make sure that
  // doesn't break at some point.
  it('Adds a new triple', () => {
    const store = new TripleStore({ api: new StubNetwork() });
    const { result, rerender } = renderHook(() => useSharedObservable(store.triples$));
    expect(result.current).toStrictEqual([]);

    const newTriple: Triple = {
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    };

    store.createLocalTriple(newTriple);
    rerender();
    expect(result.current).toContain(newTriple);
  });

  it('Rerenders component when changing state', () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const Component = () => {
      const triples = useSharedObservable(store.triples$);
      return <p>{triples.length}</p>;
    };

    const { getByText, rerender } = render(<Component />);
    expect(getByText('0')).toBeTruthy();

    store.createLocalTriple({
      id: '1',
      entityId: 'bob',
      attributeId: 'name',
      value: {
        type: 'string',
        value: 'Bob',
      },
    });

    rerender(<Component />);
    expect(getByText('1')).toBeTruthy();
  });
});
