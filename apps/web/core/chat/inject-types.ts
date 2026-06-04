// MVP scope: news / Reddit posts / tweets. `person` and `news-story` (multi-URL)
// are out of scope for v1 — person URLs fall through to the chat-driven flow.
export type InjectType = 'news-story-single' | 'post' | 'tweet';

export type InjectSpace = 'crypto' | 'ai' | 'world-affairs' | 'health';

export type ClassifyUrlResponse = { route: 'chat' } | { route: 'inject'; type: InjectType };

export type SerializedUnsetLanguage = { type: 'all' } | { type: 'english' } | { type: 'specific'; language: string };

export type SerializedValue =
  | { type: 'boolean'; value: boolean }
  | { type: 'integer'; value: string; unit?: string }
  | { type: 'float'; value: number; unit?: string }
  | {
      type: 'decimal';
      exponent: number;
      mantissa: { type: 'i64'; value: string } | { type: 'big'; bytes: string };
      unit?: string;
    }
  | { type: 'text'; value: string; language?: string }
  | { type: 'bytes'; value: string }
  | { type: 'date'; value: string }
  | { type: 'time'; value: string }
  | { type: 'datetime'; value: string }
  | { type: 'schedule'; value: string }
  | { type: 'point'; lat: number; lon: number; alt?: number }
  | { type: 'rect'; minLat: number; minLon: number; maxLat: number; maxLon: number }
  | { type: 'embedding'; subType: number; dims: number; data: string };

export type SerializedPropertyValue = { property: string; value: SerializedValue };

export type SerializedUnsetValue = { property: string; language: SerializedUnsetLanguage };

export type SerializedOp =
  | { type: 'createEntity'; id: string; values: SerializedPropertyValue[] }
  | {
      type: 'updateEntity';
      id: string;
      set: SerializedPropertyValue[];
      unset: SerializedUnsetValue[];
    }
  | { type: 'deleteEntity'; id: string }
  | { type: 'restoreEntity'; id: string }
  | {
      type: 'createRelation';
      id: string;
      relationType: string;
      from: string;
      to: string;
      fromIsValueRef?: boolean;
      toIsValueRef?: boolean;
      fromSpace?: string;
      fromVersion?: string;
      toSpace?: string;
      toVersion?: string;
      entity?: string;
      position?: string;
    }
  | {
      type: 'updateRelation';
      id: string;
      fromSpace?: string;
      fromVersion?: string;
      toSpace?: string;
      toVersion?: string;
      position?: string;
      unset: Array<'fromSpace' | 'fromVersion' | 'toSpace' | 'toVersion' | 'position'>;
    }
  | { type: 'deleteRelation'; id: string }
  | { type: 'restoreRelation'; id: string }
  | {
      type: 'createValueRef';
      id: string;
      entity: string;
      property: string;
      language?: string;
      space?: string;
    };

export type InjectPollResponse =
  | { status: 'pending' }
  | { status: 'completed'; name: string; ops: SerializedOp[] }
  | { status: 'failed'; error?: string };
