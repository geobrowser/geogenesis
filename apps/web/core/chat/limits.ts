// Shared between API route and chat widget — safe to import on both sides.

// Shared so all chat-side callers import the entity-id shape from one place.
export const ENTITY_ID_REGEX = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const MAX_PATH_CHARS = 200;
