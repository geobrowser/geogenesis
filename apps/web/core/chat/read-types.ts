// Types shared between the server-side read tool definitions (registered on
// streamText so the model sees the catalog) and the client-side dispatcher
// that actually executes them against the merged local+remote graph. Pure
// types only — safe to import from either side.

export type GetEntityInput = {
  entityId: string;
  spaceId?: string;
};

// Code blocks are stored identically to text blocks at the graph level (same
// TEXT_BLOCK type, same MARKDOWN_CONTENT property, same TEXT renderable type)
// and so read back as 'text' here. Callers wanting code behavior on update can
// just pass kind: 'text' with fenced markdown.
export type BlockKind = 'text' | 'image' | 'video' | 'data' | 'unknown';

export type BlockEntry = {
  id: string;
  kind: BlockKind;
  // For data blocks, the entity id of the BLOCKS relation itself — the VIEW
  // relation hangs off this, not the block entity.
  blockRelationEntityId: string;
};

export type TabEntry = {
  id: string;
  name: string | null;
};

export type SchemaEntry = {
  propertyId: string;
  propertyName: string | null;
  dataType: string;
  filled: boolean;
};

export type GetEntitySuccess = {
  id: string;
  name: string | null;
  description: string | null;
  spaceId: string | null;
  spaceName: string | null;
  types: string[];
  values: Array<{ propertyId: string | null; propertyName: string | null; value: string; dataType: string }>;
  relations: Array<{ typeName: string | null; toEntityId: string; toEntityName: string | null }>;
  blocks: BlockEntry[];
  tabs: TabEntry[];
  schema: SchemaEntry[];
  // Surfaces local-only entities so the model can phrase responses as "your
  // draft" instead of asserting the published graph contains them.
  isDraft?: boolean;
};

export type GetEntityOutput = GetEntitySuccess | { error: 'not_found' | 'invalid_id' | 'lookup_failed' };

export type SearchGraphInput = {
  query: string;
  spaceId?: string;
  typeId?: string;
  limit?: number;
};

export type SearchGraphResult = {
  id: string;
  name: string | null;
  spaceId: string;
  spaceName: string | null;
  typeNames: string[];
  isDraft?: boolean;
};

export type SearchGraphOutput = { results: SearchGraphResult[] } | { error: 'lookup_failed' };

export type ListSpacesInput = {
  query?: string;
  limit?: number;
};

export type ListSpaceEntry = {
  id: string;
  name: string | null;
  description: string | null;
};

export type ListSpacesOutput = { spaces: ListSpaceEntry[] } | { error: 'lookup_failed' };

export type ResearchInput = {
  query: string;
};

export type ResearchSource = {
  url: string;
  title: string | null;
};

export type ResearchOutput =
  | { summary: string; sources: ResearchSource[] }
  | { error: 'not_signed_in' | 'rate_limited' | 'lookup_failed' };

export type WebFetchInput = {
  url: string;
};

// Same shape as ResearchOutput so the UI source-pill row picks it up via the
// same selector. `not_accessible` (page reachable but unextractable) is
// separate from `lookup_failed` (generic) so the model can surface the right
// reason to the user.
export type WebFetchOutput =
  | { summary: string; sources: ResearchSource[] }
  | { error: 'not_signed_in' | 'rate_limited' | 'invalid_url' | 'not_accessible' | 'lookup_failed' };
