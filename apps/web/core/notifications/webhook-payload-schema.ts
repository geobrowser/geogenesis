import { Schema } from 'effect';

/**
 * Minimal schemas for the gaia notification-service governance events we actually
 * act on. Only the fields we read are required; the service may add more fields
 * without breaking us. Bounty events and any other `event_type` values are
 * accepted + ignored at the route level (we 2xx them so the delivery worker
 * doesn't retry).
 *
 * Source: gaia/notification-service/WEBHOOK_INTEGRATION.md
 */

const ProposalCreatedSchema = Schema.Struct({
  version: Schema.Number,
  event_type: Schema.Literal('proposal_created'),
  category: Schema.Literal('governance'),
  user_space_id: Schema.String,
  proposal_id: Schema.String,
  idempotency_key: Schema.String,
});

const ProposalVotedSchema = Schema.Struct({
  version: Schema.Number,
  event_type: Schema.Literal('proposal_voted'),
  category: Schema.Literal('governance'),
  user_space_id: Schema.String,
  proposal_id: Schema.String,
  idempotency_key: Schema.String,
  voter_id: Schema.optional(Schema.NullOr(Schema.String)),
});

const ProposalExecutedSchema = Schema.Struct({
  version: Schema.Number,
  event_type: Schema.Literal('proposal_executed'),
  category: Schema.Literal('governance'),
  user_space_id: Schema.String,
  proposal_id: Schema.String,
  idempotency_key: Schema.String,
});

const ProposalRejectedSchema = Schema.Struct({
  version: Schema.Number,
  event_type: Schema.Literal('proposal_rejected'),
  category: Schema.Literal('governance'),
  user_space_id: Schema.String,
  proposal_id: Schema.String,
  idempotency_key: Schema.String,
});

export const RedDotWebhookPayloadSchema = Schema.Union(
  ProposalCreatedSchema,
  ProposalVotedSchema,
  ProposalExecutedSchema,
  ProposalRejectedSchema
);

export type RedDotWebhookPayload = Schema.Schema.Type<typeof RedDotWebhookPayloadSchema>;
