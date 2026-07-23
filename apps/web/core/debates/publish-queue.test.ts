import { beforeEach, describe, expect, it } from 'vitest';

import {
  dequeueDebatePublish,
  enqueueDebatePublish,
  listPendingDebatePublishes,
  observeDebatePublishQueue,
} from './publish-queue';

describe('debate publish queue', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('enqueues without duplicates and dequeues by id', () => {
    enqueueDebatePublish('a');
    enqueueDebatePublish('a');
    enqueueDebatePublish('b');
    expect(listPendingDebatePublishes()).toEqual(['a', 'b']);

    dequeueDebatePublish('a');
    expect(listPendingDebatePublishes()).toEqual(['b']);
  });

  it('notifies observers on change and stops after unsubscribe', () => {
    const seen: string[][] = [];
    const unsubscribe = observeDebatePublishQueue(ids => seen.push(ids));

    enqueueDebatePublish('x');
    dequeueDebatePublish('x');
    unsubscribe();
    enqueueDebatePublish('y');

    expect(seen).toEqual([['x'], []]);
  });

  it('recovers from corrupt storage as an empty queue', () => {
    window.localStorage.setItem('geo:debate-publish-pending', '{not json');
    expect(listPendingDebatePublishes()).toEqual([]);
  });
});
