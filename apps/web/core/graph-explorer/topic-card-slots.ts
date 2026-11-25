import type { GraphKind } from './graph-kinds';

/**
 * Where the Topic link preview draws its neighbours. Slot 0-2 sit close to the hub and only fit a
 * pill or a person; 3-5 take a 250px content card. A card in a near slot would cover the hub.
 */
export const TOPIC_HUB = { x: 945, y: 318, size: 184 };
export const TOPIC_SLOTS = [
  { x: 960, y: 62 },
  { x: 1080, y: 150 },
  { x: 1110, y: 340 },
  { x: 1030, y: 548 },
  { x: 760, y: 515 },
  { x: 770, y: 140 },
] as const;

const CARD_SLOTS = [3, 4, 5];
/** Slot 2 is right of the hub: a person's tag clears it, a wide pill would not. */
const PREFERENCE: Partial<Record<GraphKind, number[]>> = {
  ent: [1, 2, 0, 5, 4, 3],
  topic: [0, 1, 5, 4, 3],
};

/** Pill or person: everything else draws as a content card. */
export const isCompactKind = (kind: GraphKind) => kind === 'ent' || kind === 'topic';

/**
 * Each node's slot, in slot order. Cards claim the card slots first; pills and people take what is
 * left, in the order given. A node with no free slot is dropped, so the card never overlaps.
 */
export function assignTopicSlots<T extends { kind: GraphKind }>(nodes: readonly T[]): Array<{ node: T; slot: number }> {
  const taken = new Map<number, T>();
  const place = (node: T, preference: readonly number[]) => {
    const slot = preference.find(index => !taken.has(index));
    if (slot !== undefined) taken.set(slot, node);
  };
  for (const node of nodes) if (!isCompactKind(node.kind)) place(node, CARD_SLOTS);
  for (const node of nodes) if (isCompactKind(node.kind)) place(node, PREFERENCE[node.kind]!);
  return [...taken.entries()].sort(([a], [b]) => a - b).map(([slot, node]) => ({ node, slot }));
}
