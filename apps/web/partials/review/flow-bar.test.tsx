import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { options } from '~/core/environment/environment';
import { MockNetworkData, Network, StorageClient } from '~/core/io';
import { Providers } from '~/core/providers';
import { ActionsStore } from '~/core/state/actions-store';
import { ActionsStoreContext } from '~/core/state/actions-store/actions-store-provider';
import { editable$ } from '~/core/state/editable-store/editable-store';

import { FlowBar } from './flow-bar';

// Most of these tests are covered by the action.test.ts file, but there are some
// other cases we want to handle, particularly for rendering the flow bar in different
// states.
describe('Flow Bar', () => {
  it('Should not render the flow bar when there are not changes', () => {
    const store = new ActionsStore({
      api: new Network.NetworkClient(options.production.subgraph),
      storageClient: new StorageClient(options.production.ipfs),
    });

    render(
      <Providers>
        <ActionsStoreContext.Provider value={store}>
          <FlowBar />
        </ActionsStoreContext.Provider>
      </Providers>
    );

    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('Should not render the flow bar when there are changes but not in edit mode', () => {
    const store = new ActionsStore({
      api: new Network.NetworkClient(options.production.subgraph),
      storageClient: new StorageClient(options.production.ipfs),
    });

    render(
      <Providers>
        <ActionsStoreContext.Provider value={store}>
          <FlowBar />
        </ActionsStoreContext.Provider>
      </Providers>
    );

    act(() => store.create(MockNetworkData.makeStubTriple('Alice')));

    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('Should render the flow bar when there are changes and in edit mode', () => {
    const store = new ActionsStore({
      api: new Network.NetworkClient(options.production.subgraph),
      storageClient: new StorageClient(options.production.ipfs),
    });

    render(
      <Providers>
        <ActionsStoreContext.Provider value={store}>
          <FlowBar />
        </ActionsStoreContext.Provider>
      </Providers>
    );

    act(() => {
      store.create(MockNetworkData.makeStubTriple('Alice'));
      editable$.set(true);
    });

    expect(screen.queryByRole('button')).toBeInTheDocument();
  });

  /**
   * 1. createTriple, createTriple -- This should only be considered one change
   * 2. createTriple, editTriple -- This should only be considered one change
   * 3. createTriple, deleteTriple -- This should be considered no change
   * 4. editTriple, editTriple -- This should be considered one change only if the value has changed
   * 5. editTriple, deleteTriple -- This should be considered one change
   */
  it('Should show correct counts', () => {
    const store = new ActionsStore({
      api: new Network.NetworkClient(options.production.subgraph),
      storageClient: new StorageClient(options.production.ipfs),
    });

    render(
      <Providers>
        <ActionsStoreContext.Provider value={store}>
          <FlowBar />
        </ActionsStoreContext.Provider>
      </Providers>
    );

    act(() => {
      store.create(MockNetworkData.makeStubTriple('Alice'));
      editable$.set(true);
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    // create -> create should only be one change
    act(() => {
      store.create(MockNetworkData.makeStubTriple('Alice'));
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    // create -> delete should be 0 changes
    act(() => {
      store.remove(MockNetworkData.makeStubTriple('Alice'));
    });

    expect(screen.queryByText('Review')).not.toBeInTheDocument();

    // create -> edit should only be one change
    act(() => {
      const newTriple = MockNetworkData.makeStubTriple('Alice');
      store.create(newTriple);
      store.update({ ...newTriple, value: { ...newTriple.value, id: 'Bob' } }, newTriple);
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    // Multiple changes to the same entity should show the correct count
    act(() => {
      // Passing the previous entityId as a parameter to add this triple to the same entity
      const newTriple = MockNetworkData.makeStubTriple('Bob', 'Alice');
      store.create(newTriple);
    });

    expect(screen.queryByText('2 edits')).toBeInTheDocument();
    expect(screen.queryByText('1 entity in 1 space')).toBeInTheDocument();

    // Changes to multiple entities should show the correct count
    act(() => {
      // Passing the previous entityId as a parameter to add this triple to the same entity
      const newTriple = MockNetworkData.makeStubTriple('Charlie');
      store.create(newTriple);
    });

    expect(screen.queryByText('3 edits')).toBeInTheDocument();
    expect(screen.queryByText('2 entities in 1 space')).toBeInTheDocument();
  });
});
