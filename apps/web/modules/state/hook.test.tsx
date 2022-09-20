import { describe, expect, it } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { FactsStore } from './facts';
import { useSharedObservable } from './hook';
import { BehaviorSubject } from 'rxjs';
import { IFact } from '../types';

class MockNetwork {
  syncer$ = new BehaviorSubject([]);
  getRemoteFacts = async () => [];
}

describe('useSharedObservable', () => {
  it('Initializes empty', () => {
    const store = new FactsStore({ api: new MockNetwork() });
    const { result } = renderHook(() => useSharedObservable(store.facts$));

    expect(result.current).toStrictEqual([]);
  });

  // The next two tests are really just to make sure that our integration with useSyncInternalStore works.
  // We have to pass a specific object that wraps our rxjs BehaviorSubject, so want to make sure that
  // doesn't break at some point.
  it('Adds a new fact', () => {
    const store = new FactsStore({ api: new MockNetwork() });
    const { result, rerender } = renderHook(() => useSharedObservable(store.facts$));
    expect(result.current).toStrictEqual([]);

    const newFact: IFact = {
      id: '1',
      entity: {
        id: '1',
      },
      attribute: {
        id: 'name',
      },
      stringValue: 'Bob',
    };

    store.createFact(newFact);
    rerender();
    expect(result.current).toContain(newFact);
  });

  it('Rerenders component when changing state', () => {
    const store = new FactsStore({ api: new MockNetwork() });

    const Component = () => {
      const facts = useSharedObservable(store.facts$);
      return <p>{facts.length}</p>;
    };

    const { getByText, rerender } = render(<Component />);
    expect(getByText('0')).toBeTruthy();

    store.createFact({
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
