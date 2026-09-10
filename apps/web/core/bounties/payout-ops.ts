/**
 * Payout builder — the one write whose graph shape MUST match curator-app's
 * `create-payout.ts` exactly, or curator-app's readers miss payouts authored
 * here (and vice versa):
 *
 *   spaceEntity —Payout Recipient→ recipient
 *     └ relation-entity: Types → Payout, Name, Payout Amount (decimal, whole
 *       points), Payout Bounty → bounty, Proposals → paid proposals
 *
 * curator-app emits this as one `Graph.createRelation` with entity values and
 * relations attached; here it is expressed as the outer relation (with an
 * explicit `entityId`) plus values/relations on that entity id, which the
 * publish layer turns into createRelation + updateEntity + createRelation ops
 * for the same resulting graph. The decimal amount is normalized by the
 * publish layer (e.g. 1000 → mantissa 1, exponent 3), which is the same
 * number and reads back as "1000" from the API either way.
 *
 * The outer relation id is also what curator-app's tooling keys payouts on
 * (`payoutEntityId`), so keeping the shape identical keeps payouts authored
 * here first-class citizens there.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { createEntityId, createValueId } from '~/core/id/create-id';
import type { Relation, Value } from '~/core/types';

import type { EntityPick } from './bounty-ops';
import {
  PAYOUT_AMOUNT_PROPERTY_ID,
  PAYOUT_BOUNTY_PROPERTY_ID,
  PAYOUT_PROPOSALS_PROPERTY_ID,
  PAYOUT_RECIPIENT_PROPERTY_ID,
  PAYOUT_TYPE_ID,
} from './ontology';

export type PayoutInput = {
  /** The bounty's DAO space — the payout is published here by an editor. */
  spaceId: string;
  bounty: EntityPick;
  /** The recipient's personal-space (system) entity or person entity, as curator-app records it. */
  recipient: EntityPick;
  /** Whole points; rounded. */
  amount: number;
  proposalIds: string[];
  name?: string;
};

export function buildPayoutOps(input: PayoutInput): {
  payoutRelationId: string;
  payoutEntityId: string;
  values: Value[];
  relations: Relation[];
} {
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payout amount must be a positive whole number');

  const payoutRelationId = createEntityId();
  const payoutEntityId = createEntityId();
  const name = input.name ?? `Payout to ${input.recipient.name?.trim() || 'curator'}`;
  const payoutRef = { id: payoutEntityId, name };
  const { spaceId } = input;

  const values: Value[] = [
    {
      id: createValueId({ entityId: payoutEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
      entity: payoutRef,
      property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
      value: name,
      spaceId,
      isLocal: true,
    },
    {
      id: createValueId({ entityId: payoutEntityId, propertyId: PAYOUT_AMOUNT_PROPERTY_ID, spaceId }),
      entity: payoutRef,
      property: { id: PAYOUT_AMOUNT_PROPERTY_ID, name: 'Payout Amount', dataType: 'DECIMAL' },
      value: String(amount),
      spaceId,
      isLocal: true,
    },
  ];

  const relation = (
    fromEntity: EntityPick,
    typeId: string,
    typeName: string,
    to: EntityPick,
    id = createEntityId()
  ): Relation => ({
    id,
    entityId: createEntityId(),
    spaceId,
    renderableType: 'RELATION',
    fromEntity: { id: fromEntity.id, name: fromEntity.name },
    toEntity: { id: to.id, name: to.name, value: to.id },
    type: { id: typeId, name: typeName },
    isLocal: true,
  });

  const relations: Relation[] = [
    // The outer relation, carrying the payout entity as its relation-entity.
    {
      ...relation(
        { id: spaceId, name: null },
        PAYOUT_RECIPIENT_PROPERTY_ID,
        'Payout Recipient',
        input.recipient,
        payoutRelationId
      ),
      entityId: payoutEntityId,
    },
    relation(payoutRef, SystemIds.TYPES_PROPERTY, 'Types', { id: PAYOUT_TYPE_ID, name: 'Payout' }),
    relation(payoutRef, PAYOUT_BOUNTY_PROPERTY_ID, 'Payout Bounty', input.bounty),
    ...input.proposalIds.map(proposalId =>
      relation(payoutRef, PAYOUT_PROPOSALS_PROPERTY_ID, 'Proposals', { id: proposalId, name: null })
    ),
  ];

  return { payoutRelationId, payoutEntityId, values, relations };
}
