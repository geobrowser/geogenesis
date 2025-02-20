import { expect, it } from 'vitest';

import { getBlockPositionChanges } from './get-block-position-changes';

it('should return added blocks', () => {
  let previous = ['b', 'c', 'd'];
  let next = ['b', 'c', 'a', 'd'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['a'],
    removed: [],
    moved: [],
  });

  previous = ['b', 'c', 'd'];
  next = ['f', 'b', 'c', 'e', 'd', 'a'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['f', 'e', 'a'],
    removed: [],
    moved: [],
  });
});

// Adding or removing blocks can affect the order of the other blocks, this test
// makes sure we handle that.
it('should return moved blocks', () => {
  // Move a
  let previous = ['a', 'b', 'c', 'd'];
  let next = ['b', 'c', 'a', 'd'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: [],
    removed: [],
    moved: ['a'],
  });

  // Move a and add e
  previous = ['a', 'b', 'c', 'd'];
  next = ['b', 'c', 'e', 'd', 'a'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['e'],
    removed: [],
    moved: ['a'],
  });

  // Move a and remove b
  previous = ['a', 'b', 'c', 'd'];
  next = ['c', 'a', 'd'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: [],
    removed: ['b'],
    moved: ['a'],
  });

  // Remove c, d, add e in between unmoved a, b
  previous = ['a', 'b', 'c', 'd'];
  next = ['a', 'e', 'b'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['e'],
    removed: ['c', 'd'],
    moved: [],
  });

  // Add e, move a, remove c
  previous = ['a', 'b', 'c', 'd'];
  next = ['b', 'e', 'd', 'a'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['e'],
    removed: ['c'],
    moved: ['a'],
  });

  // Add e, move a, b, remove c
  previous = ['a', 'b', 'c', 'd'];
  next = ['e', 'd', 'b', 'a'];

  expect(getBlockPositionChanges(previous, next)).toEqual({
    added: ['e'],
    removed: ['c'],
    moved: ['a', 'b'],
  });
});
