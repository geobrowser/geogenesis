import type * as S from 'zapatos/schema';

/**
 * We currently index two sets of contracts representing spaces:
 * 1. The original Space contract with simple permissions rules and no proposals.
 * 2. The new (as of January 23rd, 2024) DAO-based contracts with Plugins representing
 *    the Space and any governance and permissions rules.
 *
 * Having multiple sets of contracts means that we support multiple methods for
 * indexing data from these contracts, including the data representing the contracts
 * themselves like the address of the contract and any plugins (if they exist).
 *
 * This file represents mapping Proposals emitted by the DAO-based contracts. Currently
 * we map proposals from the old contracts in `map-entries.ts.` Since the the old
 * contracts don't have governance, we automatically set those to APPROVED.
 *
 * The new contracts have a more complex governance system, so we need to map the
 * proposals and track the status of the proposal for the duration of the voting period.
 */

export function mapProposals(): S.proposals.Insertable[] {
  return [];
}
