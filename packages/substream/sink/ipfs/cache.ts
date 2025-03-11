import { LRUCache } from 'lru-cache';

export const cache = new LRUCache<string, Buffer>({ max: 30, ttl: 1000 * 60 * 5 });
