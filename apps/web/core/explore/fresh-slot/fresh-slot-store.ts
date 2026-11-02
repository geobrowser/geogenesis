import { Redis } from '@upstash/redis';

import { createPromiseTtlCache } from '~/core/utils/promise-ttl-cache';

import {
  DEFAULT_FRESH_SLOT_CONFIG,
  type FreshSlotConfig,
  coerceFreshSlotConfig,
  parseFreshSlotConfig,
} from './fresh-slot-config';

/**
 * Where the fresh slot's config lives (GEO-3221): this app's Upstash Redis, the server-side store it
 * already has (the debate acceptor's signing lock and publish lease, the rate limiters). An admin
 * changes it from the ranking lab and the feed picks it up within {@link SERVING_CACHE_TTL_MS}, with
 * no deploy and no gaia migration.
 *
 * Three keys: the current state, its revision on its own (so the compare-and-set script needs no
 * JSON parsing), and a capped history list, newest first, of every change with who made it and the
 * config before and after. Serving fails closed: no Upstash, an unreadable record or an error all
 * read as the default, which is disabled.
 */
const STATE_KEY = 'explore:fresh-slot:state';
const REVISION_KEY = 'explore:fresh-slot:revision';
const HISTORY_KEY = 'explore:fresh-slot:history';
export const FRESH_SLOT_HISTORY_LIMIT = 200;

export type FreshSlotState = {
  config: FreshSlotConfig;
  /** 0 before the first save. */
  revision: number;
  updatedAt: string | null;
  /** Personal space id of the admin who saved it. */
  updatedBy: string | null;
};

export type FreshSlotHistoryEntry = {
  revision: number;
  at: string;
  by: string;
  action: 'save' | 'rollback';
  /** For a rollback, the revision whose config was restored. */
  restoredRevision?: number;
  before: FreshSlotConfig;
  after: FreshSlotConfig;
};

export const INITIAL_FRESH_SLOT_STATE: FreshSlotState = {
  config: DEFAULT_FRESH_SLOT_CONFIG,
  revision: 0,
  updatedAt: null,
  updatedBy: null,
};

export type FreshSlotStore = {
  readState: () => Promise<unknown>;
  readHistory: (limit: number) => Promise<unknown[]>;
  /** Writes state and history together, only if the stored revision is still `expectedRevision`. */
  compareAndSet: (expectedRevision: number, state: FreshSlotState, entry: FreshSlotHistoryEntry) => Promise<boolean>;
};

const COMPARE_AND_SET = `
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
if current ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
redis.call('LPUSH', KEYS[3], ARGV[4])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[5]) - 1)
return 1
`;

/** The Upstash-backed store, or null when Upstash is not configured. */
export function upstashFreshSlotStore(): FreshSlotStore | null {
  // Either name pair, as the acceptor lock reads them: the app has had Upstash under both.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token, retry: { retries: 1 } });
  return {
    readState: () => redis.get(STATE_KEY),
    readHistory: limit => redis.lrange(HISTORY_KEY, 0, limit - 1),
    compareAndSet: async (expectedRevision, state, entry) =>
      Number(
        await redis.eval(
          COMPARE_AND_SET,
          [STATE_KEY, REVISION_KEY, HISTORY_KEY],
          [
            String(expectedRevision),
            JSON.stringify(state),
            String(state.revision),
            JSON.stringify(entry),
            String(FRESH_SLOT_HISTORY_LIMIT),
          ]
        )
      ) === 1,
  };
}

/** The Upstash client parses JSON values itself; a test store may hand back the string. */
function parseRecord(value: unknown): Record<string, unknown> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

function decodeState(value: unknown): FreshSlotState {
  const record = parseRecord(value);
  if (!record) return INITIAL_FRESH_SLOT_STATE;
  const revision = Number(record.revision);
  return {
    config: coerceFreshSlotConfig(record.config),
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
  };
}

function decodeHistoryEntry(value: unknown): FreshSlotHistoryEntry | null {
  const record = parseRecord(value);
  if (!record) return null;
  const revision = Number(record.revision);
  if (!Number.isSafeInteger(revision) || typeof record.at !== 'string' || typeof record.by !== 'string') return null;
  const restored = Number(record.restoredRevision);
  return {
    revision,
    at: record.at,
    by: record.by,
    action: record.action === 'rollback' ? 'rollback' : 'save',
    ...(Number.isSafeInteger(restored) ? { restoredRevision: restored } : {}),
    before: coerceFreshSlotConfig(record.before),
    after: coerceFreshSlotConfig(record.after),
  };
}

export async function readFreshSlotState(store: FreshSlotStore): Promise<FreshSlotState> {
  return decodeState(await store.readState());
}

export async function readFreshSlotHistory(store: FreshSlotStore, limit = 50): Promise<FreshSlotHistoryEntry[]> {
  const rows = await store.readHistory(Math.min(limit, FRESH_SLOT_HISTORY_LIMIT));
  return rows.flatMap(row => {
    const entry = decodeHistoryEntry(row);
    return entry ? [entry] : [];
  });
}

export type FreshSlotWriteResult =
  { ok: true; state: FreshSlotState; adjustments: string[] } | { ok: false; status: 400 | 404 | 409; errors: string[] };

async function commit(
  store: FreshSlotStore,
  args: {
    baseRevision: number;
    config: FreshSlotConfig;
    by: string;
    now: Date;
    action: 'save' | 'rollback';
    restoredRevision?: number;
  }
): Promise<FreshSlotWriteResult> {
  const current = await readFreshSlotState(store);
  if (current.revision !== args.baseRevision) {
    return { ok: false, status: 409, errors: ['the config changed since this page loaded; reload and try again'] };
  }
  const at = args.now.toISOString();
  const state: FreshSlotState = {
    config: args.config,
    revision: current.revision + 1,
    updatedAt: at,
    updatedBy: args.by,
  };
  const entry: FreshSlotHistoryEntry = {
    revision: state.revision,
    at,
    by: args.by,
    action: args.action,
    ...(args.restoredRevision !== undefined ? { restoredRevision: args.restoredRevision } : {}),
    before: current.config,
    after: args.config,
  };
  const written = await store.compareAndSet(args.baseRevision, state, entry);
  if (!written) {
    return { ok: false, status: 409, errors: ['the config changed since this page loaded; reload and try again'] };
  }
  servingCache.clear();
  return { ok: true, state, adjustments: [] };
}

/** Validates, clamps and saves a config, recording who changed what. */
export async function saveFreshSlotConfig(
  store: FreshSlotStore,
  args: { input: unknown; baseRevision: number; by: string; now?: Date }
): Promise<FreshSlotWriteResult> {
  const parsed = parseFreshSlotConfig(args.input);
  if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors };
  const result = await commit(store, {
    baseRevision: args.baseRevision,
    config: parsed.config,
    by: args.by,
    now: args.now ?? new Date(),
    action: 'save',
  });
  return result.ok ? { ...result, adjustments: parsed.adjustments } : result;
}

/** Restores the config a history entry saved, as a new revision of its own. */
export async function rollbackFreshSlotConfig(
  store: FreshSlotStore,
  args: { toRevision: number; baseRevision: number; by: string; now?: Date }
): Promise<FreshSlotWriteResult> {
  const history = await readFreshSlotHistory(store, FRESH_SLOT_HISTORY_LIMIT);
  const target = history.find(entry => entry.revision === args.toRevision);
  if (!target) return { ok: false, status: 404, errors: [`no history entry for revision ${args.toRevision}`] };
  return commit(store, {
    baseRevision: args.baseRevision,
    config: target.after,
    by: args.by,
    now: args.now ?? new Date(),
    action: 'rollback',
    restoredRevision: target.revision,
  });
}

/**
 * How long one server instance serves a config before reading it again. A save on this instance
 * clears it at once; other instances follow within this.
 */
export const SERVING_CACHE_TTL_MS = 30_000;
const servingCache = createPromiseTtlCache<FreshSlotState>({ ttlMs: SERVING_CACHE_TTL_MS, maxEntries: 1 });

/** The config the feed serves. Never throws: anything wrong reads as the default, disabled. */
export async function readServingFreshSlotState(
  store: FreshSlotStore | null = upstashFreshSlotStore()
): Promise<FreshSlotState> {
  if (!store) return INITIAL_FRESH_SLOT_STATE;
  try {
    return await servingCache.get('state', () => readFreshSlotState(store));
  } catch (error) {
    console.warn('explore fresh slot: config unreadable, serving without it', error);
    return INITIAL_FRESH_SLOT_STATE;
  }
}

export function resetFreshSlotServingCacheForTests() {
  servingCache.clear();
}
