/**
 * Shared Effect Schema definitions for profile-related API responses.
 */
import { Schema } from 'effect';

/**
 * Single profile from GET /profile/address/:address or GET /profile/space/:spaceId
 */
export const ApiProfileSchema = Schema.Struct({
  entityId: Schema.NullOr(Schema.String),
  spaceId: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  address: Schema.String,
});

export type ApiProfile = Schema.Schema.Type<typeof ApiProfileSchema>;

/**
 * Batch profile response from POST /profile/batch
 */
export const ApiBatchProfileResponseSchema = Schema.Struct({
  profiles: Schema.Array(ApiProfileSchema),
});

export type ApiBatchProfileResponse = Schema.Schema.Type<typeof ApiBatchProfileResponseSchema>;
