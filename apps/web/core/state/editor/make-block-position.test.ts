import { describe, expect, it } from 'vitest';

import { makeBlockPosition } from './make-block-position';

const blockRelations = [
  { block: { id: 'first' }, position: 'a0' },
  { block: { id: 'middle' }, position: 'a1' },
  { block: { id: 'last' }, position: 'a2' },
];

describe('makeBlockPosition', () => {
  it('places an existing last block before the current first block', () => {
    const position = makeBlockPosition({
      blockId: 'last',
      nextBlockIds: ['last', 'first', 'middle'],
      blockRelations,
      newBlocks: [],
    });

    expect(position < 'a0').toBe(true);
  });

  it('places an existing first block after the current last block', () => {
    const position = makeBlockPosition({
      blockId: 'first',
      nextBlockIds: ['middle', 'last', 'first'],
      blockRelations,
      newBlocks: [],
    });

    expect(position > 'a2').toBe(true);
  });

  it('places multiple adjacent new blocks before the existing first block', () => {
    const firstNewPosition = makeBlockPosition({
      blockId: 'new-1',
      nextBlockIds: ['new-1', 'new-2', 'first', 'middle', 'last'],
      blockRelations,
      newBlocks: [],
    });
    const secondNewPosition = makeBlockPosition({
      blockId: 'new-2',
      nextBlockIds: ['new-1', 'new-2', 'first', 'middle', 'last'],
      blockRelations,
      newBlocks: [{ toEntity: { id: 'new-1' }, position: firstNewPosition }],
    });

    expect(firstNewPosition < secondNewPosition).toBe(true);
    expect(secondNewPosition < 'a0').toBe(true);
  });
});
