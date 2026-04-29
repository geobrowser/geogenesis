import type { UIMessage } from 'ai';
import { isToolUIPart } from 'ai';

// Populated from tool-result parts to resolve geo:// citations into relation
// pills. Best-effort; missing keys fall back to plain text.

export type CachedEntity = {
  id: string;
  name: string | null;
  spaceId: string | null;
};

export type EntityCache = Map<string, CachedEntity>;

function normalizeId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const normalized = id.replace(/-/g, '').toLowerCase();
  return normalized === '' ? null : normalized;
}

function addEntry(cache: EntityCache, entry: CachedEntity) {
  const existing = cache.get(entry.id);
  if (!existing) {
    cache.set(entry.id, entry);
    return;
  }
  cache.set(entry.id, {
    id: entry.id,
    name: entry.name ?? existing.name,
    spaceId: entry.spaceId ?? existing.spaceId,
  });
}

function ingestToolOutput(cache: EntityCache, toolType: string, output: unknown) {
  if (!output || typeof output !== 'object') return;
  const record = output as Record<string, unknown>;

  if (toolType === 'tool-searchGraph' && Array.isArray(record.results)) {
    for (const raw of record.results) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const id = normalizeId(r.id);
      if (!id) continue;
      addEntry(cache, {
        id,
        name: typeof r.name === 'string' ? r.name : null,
        spaceId: normalizeId(r.spaceId),
      });
    }
    return;
  }

  if (toolType === 'tool-getEntity') {
    const id = normalizeId(record.id);
    if (!id) return;
    addEntry(cache, {
      id,
      name: typeof record.name === 'string' ? record.name : null,
      spaceId: normalizeId(record.spaceId),
    });
  }
}

export function buildEntityCacheFromMessages(messages: readonly UIMessage[]): EntityCache {
  const cache: EntityCache = new Map();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.state !== 'output-available') continue;
      ingestToolOutput(cache, part.type, (part as { output?: unknown }).output);
    }
  }
  return cache;
}

const GEO_ENTITY_HREF = /^geo:\/\/entity\/([a-f0-9-]{32,36})(?:\?space=([a-f0-9-]{32,36}))?$/i;

export function parseGeoEntityHref(href: string | null | undefined): { id: string; spaceId: string | null } | null {
  if (!href) return null;
  const match = href.match(GEO_ENTITY_HREF);
  if (!match) return null;
  const id = normalizeId(match[1]);
  if (!id) return null;
  return { id, spaceId: normalizeId(match[2]) };
}
