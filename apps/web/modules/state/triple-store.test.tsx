import { Signer } from 'ethers';
import { firstValueFrom, lastValueFrom, skip, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createTripleId, createTripleWithId } from '../services/create-id';
import { StubNetwork } from '../services/stub-network';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

describe('TripleStore', () => {
  it('Initializes to empty', async () => {
    const store = new TripleStore({ api: new StubNetwork() });
    expect(await firstValueFrom(store.triples$)).toStrictEqual([]);
  });

  it('Adds new triple', async () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const newTriple: Triple = createTripleWithId('bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    expect(await firstValueFrom(store.triples$)).toStrictEqual([newTriple]);
  });

  it('Updates existing triple', async () => {
    const store = new TripleStore({
      api: new StubNetwork(),
    });

    const originalTriple: Triple = createTripleWithId('alice', 'name', { type: 'string', value: 'Alice' });
    store.create([originalTriple]);

    const newTriple: Triple = createTripleWithId(originalTriple.entityId, originalTriple.attributeId, {
      type: 'string',
      value: 'Bob',
    });

    store.update(newTriple, originalTriple);
    expect(await firstValueFrom(store.triples$)).toStrictEqual([newTriple]);
  });

  it('Tracks the created triple', async () => {
    const store = new TripleStore({ api: new StubNetwork() });

    const newTriple: Triple = createTripleWithId('bob', 'name', {
      type: 'string',
      value: 'Bob',
    });

    store.create([newTriple]);
    // expect(await firstValueFrom(store.actions$)).toStrictEqual([]);
    expect(await firstValueFrom(store.actions$)).toStrictEqual([
      {
        ...newTriple,
        type: 'createTriple',
      },
    ]);
  });

  // it('Tracks an updated triple', () => {
  //   const store = new TripleStore({ api: new StubNetwork() });

  //   const originalTriple: Triple = createTripleWithId('alice', 'name', {
  //     type: 'string',
  //     value: 'Alice',
  //   });
  //   store.create([originalTriple]);

  //   const newTriple: Triple = createTripleWithId('bob', 'name', {
  //     type: 'string',
  //     value: 'Bob',
  //   });

  //   store.update(newTriple, originalTriple);

  //   expect(store.actions$.value).toStrictEqual([
  //     {
  //       type: 'editTriple',
  //       before: {
  //         ...originalTriple,
  //         type: 'deleteTriple',
  //       },
  //       after: {
  //         ...newTriple,
  //         type: 'createTriple',
  //       },
  //     },
  //   ]);
  // });

  // it('Tracks a triple that was updated multiple times', () => {
  //   const store = new TripleStore({ api: new StubNetwork() });

  //   const originalTriple: Triple = createTripleWithId('alice', 'name', {
  //     type: 'string',
  //     value: 'Alice',
  //   });
  //   store.create([originalTriple]);

  //   const firstTriple: Triple = createTripleWithId('alice', 'name', { type: 'string', value: 'Bob' });
  //   store.update(firstTriple, originalTriple);

  //   const secondTriple: Triple = createTripleWithId(firstTriple.entityId, firstTriple.attributeId, {
  //     type: 'string',
  //     value: 'Connor',
  //   });

  //   store.update(secondTriple, firstTriple);

  //   expect(store.actions$.value).toStrictEqual([
  //     {
  //       type: 'editTriple',
  //       before: {
  //         ...originalTriple,
  //         type: 'deleteTriple',
  //       },
  //       after: {
  //         ...secondTriple,
  //         type: 'createTriple',
  //       },
  //     },
  //   ]);
  // });

  // it('Updates the tracked entity names when creating triple with name attribute', () => {
  //   const store = new TripleStore({ api: new StubNetwork() });

  //   const originalTriple: Triple = createTripleWithId('bob', 'name', { type: 'string', value: 'Bob' });
  //   store.create([originalTriple]);

  //   const secondTriple = createTripleWithId(originalTriple.entityId, originalTriple.attributeId, {
  //     type: 'string',
  //     value: 'Connor',
  //   });

  //   store.update(secondTriple, originalTriple);

  //   expect(store.entityNames$.value).toStrictEqual({
  //     bob: 'Connor',
  //   });
  // });
});
